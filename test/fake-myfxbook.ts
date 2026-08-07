import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A real HTTP server that reproduces the MyFxBook API contract as verified
 * against https://www.myfxbook.com/api on 2026-08-07:
 *
 *  - login.json returns the session token ALREADY URL-ENCODED
 *    (real tokens end in "%3D%3D", i.e. base64 "==" padding).
 *  - Every other endpoint validates the DECODED token, so a client that
 *    percent-encodes the token again gets "Invalid session."
 *  - Missing required fields are reported BEFORE the session is validated.
 *  - Errors are HTTP 200 with {"error":true,"message":"..."}.
 */
export class FakeMyfxbook {
  private server: http.Server;
  private counter = 0;
  private readonly validSessions = new Set<string>();

  baseUrl = "";
  loginCount = 0;
  /** Every URL (path + query) the client actually requested. */
  requestUrls: string[] = [];
  /** Every request body the client actually sent. */
  requestBodies: string[] = [];

  // Failure-injection knobs
  failLogin = false;
  loginReturnsEmptySession = false;
  respondWithHtmlOnce = false;
  respondWith500Once = false;

  constructor(
    private readonly email = "user@example.com",
    private readonly password = "s3cr3t-p@ss"
  ) {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}/api`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((e) => (e ? reject(e) : resolve()))
    );
  }

  /** Invalidate every issued session, as MyFxBook does when a session expires. */
  expireAllSessions(): void {
    this.validSessions.clear();
  }

  get activeSessionCount(): number {
    return this.validSessions.size;
  }

  private json(res: http.ServerResponse, body: unknown): void {
    res.writeHead(200, { "Content-Type": "application/json;charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await this.readBody(req);
    this.requestUrls.push(req.url ?? "");
    this.requestBodies.push(body);

    // Params may arrive in the query string or in a form-encoded body.
    const bodyParams = new URLSearchParams(body);
    const param = (name: string): string | null =>
      url.searchParams.get(name) ?? bodyParams.get(name);

    if (this.respondWith500Once) {
      this.respondWith500Once = false;
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end("<html><body>Internal Server Error</body></html>");
      return;
    }

    if (this.respondWithHtmlOnce) {
      // Cloudflare-style interstitial: HTTP 200 but an HTML body, not JSON.
      this.respondWithHtmlOnce = false;
      res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
      res.end("<html><body>Just a moment...</body></html>");
      return;
    }

    const endpoint = url.pathname.replace(/^\/api\//, "");

    if (endpoint === "login.json") {
      this.loginCount++;
      if (this.failLogin || param("email") !== this.email || param("password") !== this.password) {
        this.json(res, { error: true, message: "Wrong email/password.", session: "" });
        return;
      }
      if (this.loginReturnsEmptySession) {
        this.json(res, { error: false, message: "", session: "" });
        return;
      }
      // Canonical token contains base64 padding; the API hands it back URL-encoded.
      const canonical = `SESSION-${++this.counter}-aL2hIA==`;
      this.validSessions.add(canonical);
      this.json(res, { error: false, message: "", session: encodeURIComponent(canonical) });
      return;
    }

    const collections: Record<string, string> = {
      "get-my-accounts.json": "accounts",
      "get-open-trades.json": "openTrades",
      "get-history.json": "history",
    };
    const collection = collections[endpoint];

    if (endpoint === "logout.json") {
      const session = param("session") ?? "";
      if (!this.validSessions.delete(session)) {
        this.json(res, { error: true, message: "Invalid session." });
        return;
      }
      this.json(res, { error: false, message: "Logged out." });
      return;
    }

    if (!collection) {
      res.writeHead(404, { "Content-Type": "text/html;charset=utf-8" });
      res.end("<html>404</html>");
      return;
    }

    // MyFxBook checks required fields before it checks the session.
    if (endpoint !== "get-my-accounts.json" && !param("id")) {
      this.json(res, { error: true, message: "Required fields missing.", [collection]: [] });
      return;
    }

    const session = param("session") ?? "";
    if (!this.validSessions.has(session)) {
      this.json(res, { error: true, message: "Invalid session.", [collection]: [] });
      return;
    }

    this.json(res, { error: false, message: "", [collection]: FIXTURES[collection] });
  }
}

/** Shapes captured from a real MyFxBook response on 2026-08-07. */
export const FIXTURES: Record<string, unknown[]> = {
  accounts: [
    {
      id: 8401078,
      name: "Live Account",
      description: "",
      accountId: 37018393,
      gain: 12.34,
      absGain: 12.34,
      balance: 10500.5,
      drawdown: 4.2,
      equity: 10480.25,
      demo: false,
      currency: "USD",
      lastUpdateDate: "08/06/2026 21:00",
      server: { name: "Broker-Live" },
    },
  ],
  openTrades: [
    {
      openTime: "08/06/2026 09:15",
      symbol: "EURUSD",
      action: "Buy",
      sizing: { type: "lots", value: "0.10" },
      openPrice: 1.0821,
      tp: 1.09,
      sl: 1.075,
      profit: 12.5,
      pips: 12.5,
      swap: 0,
      comment: "",
      magic: 0,
    },
  ],
  history: [
    {
      openTime: "08/05/2026 10:00",
      closeTime: "08/05/2026 14:30",
      symbol: "GBPUSD",
      action: "Sell",
      sizing: { type: "lots", value: "0.20" },
      openPrice: 1.2705,
      closePrice: 1.2681,
      tp: 1.265,
      sl: 1.275,
      pips: 24,
      profit: 48,
      interest: 0,
      commission: -1.4,
      comment: "",
    },
  ],
};
