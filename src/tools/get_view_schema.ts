import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { AUTHORIZED_USERS, ResponseFormat } from "./common.js";

const GetViewSchemaSchema = z
  .object({
    view_name: z.string().describe("View name (e.g., 'AllTranslations')"),
    response_format: z
      .enum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' or 'json' (default: 'markdown')"),
  })
  .strict();

export function registerGetViewSchemaTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_get_view_schema",
    {
      title: "Get View Schema",
      description:
        "Get metadata for a specific SQL Anywhere view, including column definitions, data types, and the view definition SQL.",
      inputSchema: GetViewSchemaSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // 1. Check if the view exists and is authorized
        let existsSql = `
          SELECT
            t.table_name,
            u.user_name AS owner
          FROM sys.systab AS t
          JOIN sys.sysuser AS u ON t.creator = u.user_id
          WHERE t.table_name = ?
            AND t.table_type_str = 'VIEW'
        `;
        const existsParams: any[] = [params.view_name];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          existsSql += ` AND u.user_name IN (${placeholders})`;
          existsParams.push(...AUTHORIZED_USERS);
        }

        const existsResult = await db.query(existsSql, existsParams);

        if (!existsResult || existsResult.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `View '${params.view_name}' not found or you are not authorized to access it.`,
              },
            ],
          };
        }

        const viewInfo = existsResult[0];

        // 2. Query column details
        let colSql = `
          SELECT
            c.column_name,
            d.domain_name AS data_type,
            c.width,
            c.scale,
            c.nulls
          FROM sys.systabcol AS c
          JOIN sys.systab AS t ON c.table_id = t.table_id
          JOIN sys.sysuser AS u ON t.creator = u.user_id
          JOIN sys.sysdomain AS d ON c.domain_id = d.domain_id
          WHERE t.table_name = ?
        `;
        const colParams: any[] = [params.view_name];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          colSql += ` AND u.user_name IN (${placeholders})`;
          colParams.push(...AUTHORIZED_USERS);
        }

        colSql += ` ORDER BY c.column_id`;

        const result = await db.query(colSql, colParams);

        const output = {
          name: viewInfo.table_name,
          owner: viewInfo.owner,
          columns: result,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Schema for View: ${viewInfo.owner}.${viewInfo.table_name}`,
            "",
            `**Owner**: ${viewInfo.owner}`,
            "",
            `### Columns`,
            `| Column | Type | Width | Scale | Nullable |`,
            `|--------|------|-------|-------|----------|`,
            ...result.map(
              (c) =>
                `| ${c.column_name} | ${c.data_type} | ${c.width || ""} | ${c.scale || ""} | ${c.nulls} |`,
            ),
            "",
          ];

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
              text: `Error getting view schema: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
