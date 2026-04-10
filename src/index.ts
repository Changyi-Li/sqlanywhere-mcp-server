#!/usr/bin/env node

import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import * as db from "./db.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const connectionString = process.env.SQLANYWHERE_CONN_STR;

  if (!connectionString) {
    console.error(
      "ERROR: SQLANYWHERE_CONN_STR environment variable is required.",
    );
    console.error(
      "Example: 'Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;'",
    );
    process.exit(1);
  }

  // Create MCP server instance
  const server = new McpServer({
    name: "sqlanywhere-mcp-server",
    version: "1.0.0",
  });

  // Register tools
  registerTools(server);

  // Setup Standard IO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up on exit
  process.on("SIGINT", async () => {
    await db.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
