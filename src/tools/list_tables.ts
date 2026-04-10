import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { AUTHORIZED_USERS, ResponseFormat } from "./common.js";

const ListTablesSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe("Search for tables by name substring (case-insensitive)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Maximum tables to return"),
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

export function registerListTablesTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_list_tables",
    {
      title: "List Tables",
      description:
        "List all authorized tables and views in the SQL Anywhere database. Supports case-insensitive name filtering, pagination, and various response formats.",
      inputSchema: ListTablesSchema,
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
            u.user_name AS owner,
            CASE t.table_type_str
              WHEN 'BASE' THEN 'Table'
              WHEN 'VIEW' THEN 'View'
              ELSE t.table_type_str
            END AS type
          FROM sys.systab AS t
          JOIN sys.sysuser AS u ON t.creator = u.user_id
          WHERE t.table_type_str IN ('BASE', 'VIEW')
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
        const tables = result.slice(
          params.offset,
          params.offset + params.limit,
        );

        if (!tables.length) {
          return {
            content: [
              {
                type: "text",
                text: `No tables found matching '${params.search || ""}'`,
              },
            ],
          };
        }

        const output = {
          total,
          count: tables.length,
          offset: params.offset,
          tables: tables.map((t: any) => ({
            name: t.table_name,
            owner: t.owner,
            type: t.type,
          })),
          has_more: total > params.offset + tables.length,
          ...(total > params.offset + tables.length
            ? { next_offset: params.offset + tables.length }
            : {}),
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Tables Matching '${params.search || "All"}'`,
            "",
            `**Total Found**: ${total}`,
            `**Showing Results**: ${params.offset + 1} to ${params.offset + tables.length}`,
            "",
            `| Type | Table Name | Owner |`,
            `|------|------------|-------|`,
            ...tables.map(
              (t: any) => `| ${t.type} | **${t.table_name}** | ${t.owner} |`,
            ),
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
              text: `Error listing tables: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
