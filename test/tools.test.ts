import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MyfxbookClient } from "../src/myfxbook.js";
import { TOOL_DEFINITIONS, callTool } from "../src/tools.js";
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

const textOf = (result: { content: Array<{ text: string }> }) => result.content[0].text;

describe("tool registry", () => {
  test("every advertised tool has a handler", async () => {
    for (const tool of TOOL_DEFINITIONS) {
      const result = await callTool(client, tool.name, { id: 8401078 });
      expect(textOf(result), `tool ${tool.name}`).not.toContain("Unknown tool");
    }
  });

  test("an unknown tool is reported as an error", async () => {
    const result = await callTool(client, "get_daily_gain", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown tool");
  });
});

describe("get_accounts", () => {
  test("returns the accounts array as JSON text", async () => {
    const result = await callTool(client, "get_accounts", {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(8401078);
  });

  test("reports an error instead of an empty list when the API call fails", async () => {
    api.failLogin = true;
    const result = await callTool(client, "get_accounts", {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toBe("[]");
  });
});

describe("get_open_trades", () => {
  test("accepts a numeric account id", async () => {
    const result = await callTool(client, "get_open_trades", { id: 8401078 });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))[0].symbol).toBe("EURUSD");
  });

  test("accepts an account id sent as a numeric string", async () => {
    const result = await callTool(client, "get_open_trades", { id: "8401078" });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))[0].symbol).toBe("EURUSD");
  });

  test("reports an error when the id is missing", async () => {
    const result = await callTool(client, "get_open_trades", {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("id");
  });

  test("rejects a non-numeric id", async () => {
    const result = await callTool(client, "get_open_trades", { id: "not-an-id" });
    expect(result.isError).toBe(true);
  });
});

describe("get_history", () => {
  test("returns the history array as JSON text", async () => {
    const result = await callTool(client, "get_history", { id: 8401078 });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))[0].symbol).toBe("GBPUSD");
  });

  test("reports an error when the id is missing", async () => {
    const result = await callTool(client, "get_history", {});
    expect(result.isError).toBe(true);
  });
});

describe("error propagation", () => {
  test("API failures come back as isError, never as a thrown exception", async () => {
    api.failLogin = true;
    await expect(callTool(client, "get_history", { id: 8401078 })).resolves.toMatchObject({
      isError: true,
    });
  });
});
