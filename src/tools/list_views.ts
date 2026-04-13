import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { AUTHORIZED_USERS, ResponseFormat } from "./common.js";

const ListViewsSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe("Search for views by name substring (case-insensitive)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Maximum views to return"),
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

export function registerListViewsTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_list_views",
    {
      title: "List Views",
      description:
        "List all authorized views in the SQL Anywhere database. Supports case-insensitive name filtering, pagination, and various response formats.",
      inputSchema: ListViewsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        let sql = `
          SELECT
            t.table_name,
            u.user_name AS owner
          FROM sys.systab AS t
          JOIN sys.sysuser AS u ON t.creator = u.user_id
          WHERE t.table_type_str = 'VIEW'
        `;
        let parameters: any[] = [];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          sql += ` AND u.user_name IN (${placeholders})`;
          parameters.push(...AUTHORIZED_USERS);
        }

        if (params.search) {
          sql += ` AND LOWER(t.table_name) LIKE ?`;
          parameters.push(`%${params.search.toLowerCase()}%`);
        }

        sql += ` ORDER BY t.table_name`;

        const result = await db.query(sql, parameters);
        const total = result.length;
        const views = result.slice(params.offset, params.offset + params.limit);

        if (!views.length) {
          return {
            content: [
              {
                type: "text",
                text: `No views found matching '${params.search || ""}'`,
              },
            ],
          };
        }

        const output = {
          total,
          count: views.length,
          offset: params.offset,
          views: views.map((v: any) => ({
            name: v.table_name,
            owner: v.owner,
          })),
          has_more: total > params.offset + views.length,
          ...(total > params.offset + views.length
            ? { next_offset: params.offset + views.length }
            : {}),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Views Matching '${params.search || "All"}'`,
            "",
            `**Total Found**: ${total}`,
            `**Showing Results**: ${params.offset + 1} to ${params.offset + views.length}`,
            "",
            `| View Name | Owner |`,
            `|-----------|-------|`,
            ...views.map((v: any) => `| **${v.table_name}** | ${v.owner} |`),
          ];

          if (output.has_more) {
            lines.push(
              "",
              `*(More results available, use \`offset: ${output.next_offset}\` to see more)*`,
            );
          }
          textContent = lines.join("\n");
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
              text: `Error listing views: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
