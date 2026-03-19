#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const EMAIL = process.env.MYFXBOOK_EMAIL;
const PASSWORD = process.env.MYFXBOOK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("MYFXBOOK_EMAIL and MYFXBOOK_PASSWORD environment variables are required.");
  process.exit(1);
}

const API_BASE_URL = "https://www.myfxbook.com/api";
let currentSession: string | null = null;

// MyFxBook API Helpers
async function login(): Promise<string> {
  const url = `${API_BASE_URL}/login.json?email=${encodeURIComponent(EMAIL!)}&password=${encodeURIComponent(PASSWORD!)}`;
  const response = await axios.get(url);
  if (response.data.error) {
    throw new Error(`MyFxBook Login Error: ${response.data.message}`);
  }
  return response.data.session;
}

async function getSession(): Promise<string> {
  if (!currentSession) {
    currentSession = await login();
  }
  return currentSession;
}

async function fetchMyFxBook(endpoint: string, params: Record<string, string | number> = {}) {
  let session = await getSession();
  
  // Try the request
  let urlObj = new URL(`${API_BASE_URL}/${endpoint}`);
  urlObj.searchParams.append("session", session);
  for (const [key, value] of Object.entries(params)) {
    urlObj.searchParams.append(key, value.toString());
  }

  let response = await axios.get(urlObj.toString());
  
  // If session expired or invalid, re-login and retry
  if (response.data.error && response.data.message?.toLowerCase().includes("session")) {
    currentSession = await login();
    session = currentSession;
    
    urlObj = new URL(`${API_BASE_URL}/${endpoint}`);
    urlObj.searchParams.append("session", session);
    for (const [key, value] of Object.entries(params)) {
      urlObj.searchParams.append(key, value.toString());
    }
    
    response = await axios.get(urlObj.toString());
  }

  if (response.data.error) {
    throw new Error(`MyFxBook Error (${endpoint}): ${response.data.message}`);
  }
  return response.data;
}

// MCP Server Setup
const server = new Server(
  {
    name: "myfxbook-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
    ],
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_accounts": {
        const data = await fetchMyFxBook("get-my-accounts.json");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.accounts || [], null, 2),
            },
          ],
        };
      }
      
      case "get_open_trades": {
        if (!args || typeof args.id !== "number") {
          throw new Error("Missing or invalid 'id' parameter.");
        }
        const data = await fetchMyFxBook("get-open-trades.json", { id: args.id });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.openTrades || [], null, 2),
            },
          ],
        };
      }
      
      case "get_history": {
        if (!args || typeof args.id !== "number") {
          throw new Error("Missing or invalid 'id' parameter.");
        }
        const data = await fetchMyFxBook("get-history.json", { id: args.id });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.history || [], null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start Server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MyFxBook MCP server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});