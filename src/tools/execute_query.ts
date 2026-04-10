import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { validateQuery } from "../guardrails.js";
import { AUTHORIZED_USERS, ResponseFormat } from "./common.js";

const ExecuteQuerySchema = z
  .object({
    query: z
      .string()
      .describe(
        "SQL SELECT query to execute. Only SELECT and WITH statements are allowed.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Maximum rows to return"),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Number of results to skip for pagination"),
    response_format: z
      .enum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' or 'json' (default: 'markdown')"),
  })
  .strict();

export function registerExecuteQueryTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_execute_query",
    {
      title: "Execute SQL Anywhere Query",
      description:
        "Execute a read-only SELECT query on the SQL Anywhere database with a row limit.",
      inputSchema: ExecuteQuerySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const validation = validateQuery(params.query, AUTHORIZED_USERS);
      if (!validation.isValid) {
        return {
          content: [
            {
              type: "text",
              text: validation.error || "Invalid query",
            },
          ],
        };
      }

      try {
        const result = await db.query(params.query);
        const total = result.length;
        const rows = result.slice(params.offset, params.offset + params.limit);

        const output = {
          total,
          count: rows.length,
          offset: params.offset,
          rows: rows,
          has_more: total > params.offset + rows.length,
          ...(total > params.offset + rows.length
            ? { next_offset: params.offset + rows.length }
            : {}),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (rows.length === 0) {
            textContent = "_No results found matching the query._";
          } else {
            const columns = Object.keys(rows[0]);
            const lines = [
              `# Query Results`,
              "",
              `**Total Found**: ${total}`,
              `**Showing Results**: ${params.offset + 1} to ${params.offset + rows.length}`,
              "",
              `| ${columns.join(" | ")} |`,
              `| ${columns.map(() => "---").join(" | ")} |`,
              ...rows.map(
                (row) => `| ${columns.map((c) => row[c]).join(" | ")} |`,
              ),
            ];

            if (output.has_more) {
              lines.push(
                "",
                `*(More results available, use \`offset: ${output.next_offset}\` to see more)*`,
              );
            }
            textContent = lines.join("\n");
          }
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
              text: `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
