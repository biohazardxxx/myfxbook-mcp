// End-to-end: drives the BUILT MCP server over stdio against the real MyFxBook API.
// Run: node --env-file=.env scripts/e2e-live.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["build/index.js"],
  env: {
    ...process.env,
    MYFXBOOK_EMAIL: process.env.MYFXBOOK_EMAIL,
    MYFXBOOK_PASSWORD: process.env.MYFXBOOK_PASSWORD,
  },
});

const client = new Client({ name: "e2e-check", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("tools/list ->", tools.map((t) => t.name).join(", "));

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) {
    console.log(`\n[${name}] ISERROR -> ${text.slice(0, 200)}`);
    return null;
  }
  const parsed = JSON.parse(text);
  console.log(`\n[${name}] OK -> ${Array.isArray(parsed) ? parsed.length : "?"} items, ${text.length.toLocaleString()} chars`);
  return parsed;
};

const accounts = await call("get_accounts", {});
if (accounts?.length) {
  const a = accounts[0];
  console.log(`  sample: id=${a.id} name=${JSON.stringify(a.name)} currency=${a.currency} demo=${a.demo}`);

  await call("get_open_trades", { id: a.id });
  await call("get_history", { id: a.id });

  // MCP clients often serialise numbers as strings - must still work.
  await call("get_open_trades", { id: String(a.id) });
}

// Error paths
await call("get_open_trades", {});
await call("get_open_trades", { id: "not-an-id" });
await call("get_history", { id: 1 });

await client.close();
console.log("\ne2e finished");
