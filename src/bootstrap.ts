import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as db from "./db.js";
import { registerTools } from "./tools/index.js";

export async function createServer(connectionString: string): Promise<McpServer> {
  await db.connect(connectionString);

  const server = new McpServer({
    name: "sqlanywhere-mcp-server",
    version: "1.0.0",
  });

  registerTools(server);

  return server;
}
