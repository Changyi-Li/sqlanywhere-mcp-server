import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { ResponseFormat } from "./common.js";

const TestConnectionSchema = z
  .object({
    response_format: z
      .enum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' or 'json' (default: 'markdown')"),
  })
  .strict();

export function registerTestConnectionTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_test_connection",
    {
      title: "Test Database Connection",
      description: "Test the connection to the SQL Anywhere database.",
      inputSchema: TestConnectionSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // Execute a simple query to verify connectivity
        const result = await db.query("SELECT @@VERSION as version");
        const version = result.length > 0 ? result[0].version : "unknown";

        const output = {
          status: "connected",
          version,
          timestamp: new Date().toISOString(),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textContent = [
            `# Database Connection Status`,
            ``,
            `✅ **Status**: Connected`,
            `ℹ️ **Version**: ${version}`,
            `🕒 **Timestamp**: ${output.timestamp}`,
          ].join("\n");
        } else {
          textContent = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: textContent }],
          structuredContent: output,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error connecting to database: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
