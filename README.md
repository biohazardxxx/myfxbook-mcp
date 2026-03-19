# MyFxBook MCP Server

A Model Context Protocol (MCP) Server for the MyFxBook API. 
It provides tools to interact with your MyFxBook accounts natively within any MCP client (like Claude Desktop or Gemini).

## Features

- **get_accounts**: Retrieve a list of all your configured MyFxBook accounts.
- **get_open_trades**: Fetch open trades for a specific account (requires account ID).
- **get_history**: Retrieve the complete trade history for a specific account (requires account ID).

## Prerequisites

- Node.js installed on your machine
- A valid MyFxBook account email and password

## Setup

1. Build the server:
   ```bash
   npm install
   npm run build
   ```

2. Make sure the entry point has execution permissions (on UNIX systems):
   ```bash
   chmod +x build/index.js
   ```

## Configuration

You must provide your MyFxBook credentials as environment variables.

Create a `.env` file in the project root:
```env
MYFXBOOK_EMAIL=your_email@example.com
MYFXBOOK_PASSWORD=your_password
```

## Installation as Claude Desktop Package

This project includes a `manifest.json` which allows it to be bundled as a Claude Desktop installable package (`.mcpb`).

1. Ensure you have the build ready:
   ```bash
   npm run build
   ```

3. (Alternative) Zip and Rename:
   - Compile the project: `npm run build`
   - Include `manifest.json`, `package.json`, and the `build/` folder in a ZIP archive.
   - Rename the file extension from `.zip` to `.mcpb`.
   - Drag and drop this `.mcpb` file into Claude Desktop > Settings > Extensions.

## Integrating with an MCP Client (Manual)

Add the following to your MCP client's configuration file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "myfxbook": {
      "command": "node",
      "args": ["/path/to/myfxbook-mcp/build/index.js"],
      "env": {
        "MYFXBOOK_EMAIL": "your_email@example.com",
        "MYFXBOOK_PASSWORD": "your_password"
      }
    }
  }
}
```

Replace `/path/to/myfxbook-mcp` with the absolute path to this project.