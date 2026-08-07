#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { MyfxbookClient } from "./myfxbook.js";
import { TOOL_DEFINITIONS, callTool } from "./tools.js";

dotenv.config();

const EMAIL = process.env.MYFXBOOK_EMAIL;
const PASSWORD = process.env.MYFXBOOK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("MYFXBOOK_EMAIL and MYFXBOOK_PASSWORD environment variables are required.");
  process.exit(1);
}

const client = new MyfxbookClient({ email: EMAIL, password: PASSWORD });

const server = new Server(
  { name: "myfxbook-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  callTool(client, request.params.name, request.params.arguments)
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MyFxBook MCP server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
