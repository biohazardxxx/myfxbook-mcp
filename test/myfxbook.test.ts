import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MyfxbookClient } from "../src/myfxbook.js";
import { FakeMyfxbook } from "./fake-myfxbook.js";

const EMAIL = "user@example.com";
const PASSWORD = "s3cr3t-p@ss";

let api: FakeMyfxbook;
let client: MyfxbookClient;

beforeEach(async () => {
  api = new FakeMyfxbook(EMAIL, PASSWORD);
  await api.start();
  client = new MyfxbookClient({ email: EMAIL, password: PASSWORD, baseUrl: api.baseUrl });
});

afterEach(async () => {
  await api.stop();
});

describe("authentication", () => {
  test("returns the session token on valid credentials", async () => {
    const session = await client.login();
    expect(session).toBeTruthy();
  });

  test("throws with the API message when credentials are wrong", async () => {
    const wrong = new MyfxbookClient({
      email: EMAIL,
      password: "not-my-password",
      baseUrl: api.baseUrl,
    });
    await expect(wrong.login()).rejects.toThrow("Wrong email/password.");
  });

  test("never puts the password in the request URL", async () => {
    await client.login();
    const leaked = api.requestUrls.filter((u) => u.includes(encodeURIComponent(PASSWORD)) || u.includes(PASSWORD));
    expect(leaked).toEqual([]);
  });

  test("rejects a login that succeeds but returns an empty session", async () => {
    api.loginReturnsEmptySession = true;
    await expect(client.getMyAccounts()).rejects.toThrow(/session/i);
  });
});

describe("session handling", () => {
  test("sends the session token so the API accepts it", async () => {
    const data = await client.getMyAccounts();
    expect(data.error).toBe(false);
    expect(data.accounts).toHaveLength(1);
  });

  test("reuses the session across calls instead of logging in every time", async () => {
    await client.getMyAccounts();
    await client.getMyAccounts();
    await client.getMyAccounts();
    expect(api.loginCount).toBe(1);
  });

  test("re-logins once and retries when the session has expired", async () => {
    await client.getMyAccounts();
    api.expireAllSessions();

    const data = await client.getMyAccounts();

    expect(data.accounts).toHaveLength(1);
    expect(api.loginCount).toBe(2);
  });

  test("logs in only once when several calls run concurrently", async () => {
    await Promise.all([
      client.getMyAccounts(),
      client.getMyAccounts(),
      client.getMyAccounts(),
      client.getMyAccounts(),
    ]);
    expect(api.loginCount).toBe(1);
  });

  test("does not keep a dead session cached when the re-login fails", async () => {
    await client.getMyAccounts();
    api.expireAllSessions();
    api.failLogin = true;

    await expect(client.getMyAccounts()).rejects.toThrow();

    // The credentials work again; the very next call must recover.
    api.failLogin = false;
    const data = await client.getMyAccounts();
    expect(data.accounts).toHaveLength(1);
  });
});

describe("per-account endpoints", () => {
  test("get-open-trades returns the openTrades collection", async () => {
    const data = await client.getOpenTrades(8401078);
    expect(data.openTrades).toHaveLength(1);
    expect(data.openTrades[0].symbol).toBe("EURUSD");
  });

  test("get-history returns the history collection", async () => {
    const data = await client.getHistory(8401078);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].symbol).toBe("GBPUSD");
  });

  test("sends the account id as a query parameter", async () => {
    await client.getOpenTrades(8401078);
    const call = api.requestUrls.find((u) => u.includes("get-open-trades.json"));
    expect(call).toContain("id=8401078");
  });

  test("surfaces the API error when a required field is missing", async () => {
    await expect(client.request("get-open-trades.json")).rejects.toThrow(
      "Required fields missing."
    );
  });
});

describe("transport failures", () => {
  test("throws when the API replies 200 with an HTML body instead of JSON", async () => {
    await client.getMyAccounts(); // log in first, so the HTML hits a data call
    api.respondWithHtmlOnce = true;
    await expect(client.getMyAccounts()).rejects.toThrow();
  });

  test("throws when the API replies with HTTP 500", async () => {
    await client.getMyAccounts();
    api.respondWith500Once = true;
    await expect(client.getMyAccounts()).rejects.toThrow();
  });
});
