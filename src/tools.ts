import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { MyfxbookClient } from "./myfxbook.js";

export const TOOL_DEFINITIONS = [
  {
    name: "get_accounts",
    description: "Get a list of all your MyFxBook accounts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_open_trades",
    description: "Get the currently open trades for a specific MyFxBook account.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The ID of the account to fetch open trades for",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_history",
    description: "Get the trade history for a specific MyFxBook account.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The ID of the account to fetch history for",
        },
      },
      required: ["id"],
    },
  },
];

export type ToolResult = CallToolResult;

/** MCP clients routinely serialise numeric arguments as strings, so accept both. */
function parseAccountId(args: Record<string, unknown> | undefined): number {
  const raw = args?.id;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  throw new Error(
    "Missing or invalid 'id' parameter: expected the numeric account id from get_accounts."
  );
}

export async function callTool(
  client: MyfxbookClient,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_accounts": {
        const data = await client.getMyAccounts();
        return {
          content: [
            { type: "text", text: JSON.stringify(data.accounts || [], null, 2) },
          ],
        };
      }

      case "get_open_trades": {
        const data = await client.getOpenTrades(parseAccountId(args));
        return {
          content: [
            { type: "text", text: JSON.stringify(data.openTrades || [], null, 2) },
          ],
        };
      }

      case "get_history": {
        const data = await client.getHistory(parseAccountId(args));
        return {
          content: [
            { type: "text", text: JSON.stringify(data.history || [], null, 2) },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message || String(error)}` }],
      isError: true,
    };
  }
}
