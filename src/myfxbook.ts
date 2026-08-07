import axios from "axios";

export const DEFAULT_API_BASE_URL = "https://www.myfxbook.com/api";

export interface MyfxbookClientOptions {
  email: string;
  password: string;
  baseUrl?: string;
}

export interface MyfxbookResponse {
  error: boolean;
  message: string;
  [key: string]: unknown;
}

/**
 * MyFxBook hands the session token back ALREADY percent-encoded: a base64 "=="
 * suffix arrives as "%3D%3D". Storing it verbatim and then letting a query
 * string builder encode it again produces "%253D%253D", which the API rejects
 * with "Invalid session." Decode once so the token is held in canonical form.
 */
function canonicalizeSessionToken(token: unknown): string {
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("MyFxBook Login Error: the API returned an empty session token.");
  }
  try {
    return decodeURIComponent(token);
  } catch {
    // Token contains a stray '%' that is not a valid escape - use it verbatim.
    return token;
  }
}

/** MyFxBook signals failures with HTTP 200 + {"error":true}, so the body is the contract. */
function asApiResponse(endpoint: string, data: unknown): MyfxbookResponse {
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).error !== "boolean"
  ) {
    const got = typeof data === "string" ? "a non-JSON body" : typeof data;
    throw new Error(`MyFxBook Error (${endpoint}): expected a JSON API response but got ${got}.`);
  }
  return data as MyfxbookResponse;
}

function isSessionError(response: MyfxbookResponse): boolean {
  return (
    response.error &&
    typeof response.message === "string" &&
    response.message.toLowerCase().includes("session")
  );
}

export class MyfxbookClient {
  private readonly email: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private currentSession: string | null = null;
  private pendingLogin: Promise<string> | null = null;

  constructor(options: MyfxbookClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.baseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  }

  async login(): Promise<string> {
    // Credentials go in the POST body: query strings end up in proxy, CDN and
    // access logs, and in the URL that axios attaches to thrown errors.
    const body = new URLSearchParams({ email: this.email, password: this.password });
    const response = await axios.post(`${this.baseUrl}/login.json`, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = asApiResponse("login.json", response.data);
    if (data.error) {
      throw new Error(`MyFxBook Login Error: ${data.message}`);
    }
    return canonicalizeSessionToken(data.session);
  }

  /** Returns the cached session, collapsing concurrent callers onto one login. */
  async getSession(): Promise<string> {
    if (this.currentSession) {
      return this.currentSession;
    }
    if (!this.pendingLogin) {
      this.pendingLogin = this.login()
        .then((session) => {
          this.currentSession = session;
          return session;
        })
        .finally(() => {
          this.pendingLogin = null;
        });
    }
    return this.pendingLogin;
  }

  async logout(): Promise<void> {
    const session = this.currentSession;
    this.currentSession = null;
    if (!session) return;
    await axios.get(this.buildUrl("logout.json", session, {})).catch(() => undefined);
  }

  async request(
    endpoint: string,
    params: Record<string, string | number> = {}
  ): Promise<MyfxbookResponse> {
    const session = await this.getSession();
    let data = asApiResponse(endpoint, (await axios.get(this.buildUrl(endpoint, session, params))).data);

    if (isSessionError(data)) {
      // Only discard the token we actually used, so a session another caller
      // just refreshed is not thrown away.
      if (this.currentSession === session) {
        this.currentSession = null;
      }
      const fresh = await this.getSession();
      data = asApiResponse(endpoint, (await axios.get(this.buildUrl(endpoint, fresh, params))).data);
    }

    if (data.error) {
      if (isSessionError(data)) {
        this.currentSession = null;
      }
      throw new Error(`MyFxBook Error (${endpoint}): ${data.message}`);
    }
    return data;
  }

  private buildUrl(
    endpoint: string,
    session: string,
    params: Record<string, string | number>
  ): string {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("session", session);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  getMyAccounts(): Promise<MyfxbookResponse> {
    return this.request("get-my-accounts.json");
  }

  getOpenTrades(id: number): Promise<MyfxbookResponse> {
    return this.request("get-open-trades.json", { id });
  }

  getHistory(id: number): Promise<MyfxbookResponse> {
    return this.request("get-history.json", { id });
  }
}
