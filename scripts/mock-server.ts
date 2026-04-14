import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server as HttpServer } from "node:http";
import process from "node:process";
import { z } from "zod";

import { loadConfig } from "../src/config.js";
import { closeHttpServer, startHttpServer } from "../src/http.js";
import { startStdioServer } from "../src/index.js";

const EMPTY_INPUT_SCHEMA = z.object({}).strict();

const MOCK_TOOL_NAMES = [
  "sqlanywhere_test_connection",
  "sqlanywhere_execute_query",
  "sqlanywhere_list_tables",
  "sqlanywhere_list_views",
  "sqlanywhere_get_table_schema",
  "sqlanywhere_get_view_schema",
] as const;

function createMockServer() {
  const server = new McpServer({
    name: "sqlanywhere-mcp-server",
    version: "1.0.0",
  });

  for (const toolName of MOCK_TOOL_NAMES) {
    server.registerTool(
      toolName,
      {
        title: toolName,
        description: `Mock smoke tool for ${toolName}`,
        inputSchema: EMPTY_INPUT_SCHEMA,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => ({
        content: [
          {
            type: "text",
            text: `${toolName} smoke response`,
          },
        ],
      }),
    );
  }

  return server;
}

async function main() {
  const config = loadConfig();

  if (config.transport === "stdio") {
    await startStdioServer(createMockServer(), config);
    return;
  }

  let httpServer: HttpServer | undefined;

  const shutdown = async () => {
    if (httpServer) {
      await closeHttpServer(httpServer);
    }

    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  httpServer = await startHttpServer(createMockServer(), config, {
    createRequestServer: async () => createMockServer(),
  });
}

main().catch((error) => {
  console.error("Mock server error:", error);
  process.exit(1);
});
