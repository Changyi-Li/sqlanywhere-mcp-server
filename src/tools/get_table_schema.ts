import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "../db.js";
import { AUTHORIZED_USERS, ResponseFormat } from "./common.js";

const GetTableSchemaSchema = z
  .object({
    table_name: z.string().describe("Table name (e.g., 'Part', 'Employees')"),
    response_format: z
      .enum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' or 'json' (default: 'markdown')"),
  })
  .strict();

export function registerGetTableSchemaTool(server: McpServer) {
  server.registerTool(
    "sqlanywhere_get_table_schema",
    {
      title: "Get Table Schema",
      description:
        "Get comprehensive metadata for a specific SQL Anywhere table or view, including column definitions, data types, primary keys, and detailed foreign key relationships.",
      inputSchema: GetTableSchemaSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // 1. Check if the table exists and is authorized
        let existsSql = `
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
          WHERE t.table_name = ?
            AND t.table_type_str IN ('BASE', 'VIEW')
        `;
        const existsParams: any[] = [params.table_name];

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
                text: `Table '${params.table_name}' not found or you are not authorized to access it.`,
              },
            ],
          };
        }

        // 2. Query column details
        let colSql = `
          SELECT
            c.column_name,
            d.domain_name AS data_type,
            c.width,
            c.scale,
            c.nulls,
            c."default" AS default_value
          FROM sys.systabcol AS c
          JOIN sys.systab AS t ON c.table_id = t.table_id
          JOIN sys.sysuser AS u ON t.creator = u.user_id
          JOIN sys.sysdomain AS d ON c.domain_id = d.domain_id
          WHERE t.table_name = ?
        `;
        const colParams: any[] = [params.table_name];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          colSql += ` AND u.user_name IN (${placeholders})`;
          colParams.push(...AUTHORIZED_USERS);
        }

        colSql += ` ORDER BY c.column_id`;

        const result = await db.query(colSql, colParams);

        // 3. Query Primary Keys
        let pkSql = `
          SELECT
            i.index_name,
            t.table_name,
            tc.column_name
          FROM SYS.SYSIDX AS i
          JOIN SYS.SYSTAB AS t ON i.table_id = t.table_id
          JOIN SYS.SYSIDXCOL AS ic ON i.index_id = ic.index_id AND i.table_id = ic.table_id
          JOIN SYS.SYSTABCOL AS tc ON ic.table_id = tc.table_id AND ic.column_id = tc.column_id
          JOIN SYS.SYSUSER AS u ON t.creator = u.user_id
          WHERE t.table_name = ?
            AND i.index_category = 1
        `;
        const pkParams: any[] = [params.table_name];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          pkSql += ` AND u.user_name IN (${placeholders})`;
          pkParams.push(...AUTHORIZED_USERS);
        }

        pkSql += ` ORDER BY i.index_name`;

        const pkResult = await db.query(pkSql, pkParams);

        // 4. Query Foreign Keys
        let fkSql = `
          SELECT
            fi.index_name AS foreign_key_name,
            ft.table_name AS foreign_table_name,
            ftc.column_name AS foreign_column_name,
            pt.table_name AS primary_table_name,
            ptc.column_name AS primary_column_name,
            pi.index_name AS primary_key_name
          FROM SYS.SYSFKEY AS fk
          JOIN SYS.SYSTAB AS ft ON fk.foreign_table_id = ft.table_id
          JOIN SYS.SYSIDX AS fi ON fk.foreign_index_id = fi.index_id AND fk.foreign_table_id = fi.table_id
          JOIN SYS.SYSIDXCOL AS fic ON fi.index_id = fic.index_id AND fi.table_id = fic.table_id
          JOIN SYS.SYSTABCOL AS ftc ON fic.table_id = ftc.table_id AND fic.column_id = ftc.column_id
          JOIN SYS.SYSTAB AS pt ON fk.primary_table_id = pt.table_id
          JOIN SYS.SYSIDX AS pi ON fk.primary_index_id = pi.index_id AND fk.primary_table_id = pi.table_id
          JOIN SYS.SYSIDXCOL AS pic ON pi.index_id = pic.index_id AND pi.table_id = pic.table_id AND fic.sequence = pic.sequence
          JOIN SYS.SYSTABCOL AS ptc ON pic.table_id = ptc.table_id AND pic.column_id = ptc.column_id
          JOIN SYS.SYSUSER AS u ON ft.creator = u.user_id
          WHERE ft.table_name = ?
        `;
        const fkParams: any[] = [params.table_name];

        if (AUTHORIZED_USERS.length > 0) {
          const placeholders = AUTHORIZED_USERS.map(() => "?").join(",");
          fkSql += ` AND u.user_name IN (${placeholders})`;
          fkParams.push(...AUTHORIZED_USERS);
        }

        fkSql += ` ORDER BY fi.index_name`;

        const fkResult = await db.query(fkSql, fkParams);

        const tableInfo = existsResult[0];
        const output = {
          name: tableInfo.table_name,
          owner: tableInfo.owner,
          type: tableInfo.type,
          columns: result,
          primary_keys: pkResult,
          foreign_keys: fkResult,
        };

        let textContent: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# Schema for ${tableInfo.type}: ${tableInfo.owner}.${tableInfo.table_name}`,
            "",
            `**Owner**: ${tableInfo.owner}`,
            `**Type**: ${tableInfo.type}`,
            "",
            `### Columns`,
            `| Column | Type | Width | Scale | Nullable | Default |`,
            `|--------|------|-------|-------|----------|---------|`,
            ...result.map(
              (c) =>
                `| ${c.column_name} | ${c.data_type} | ${c.width || ""} | ${c.scale || ""} | ${c.nulls} | ${c.default_value === null ? "NULL" : c.default_value} |`,
            ),
            "",
          ];

          if (pkResult.length > 0) {
            lines.push(`### Primary Keys`);
            lines.push(`| Index Name | Column Name |`);
            lines.push(`|------------|-------------|`);
            lines.push(
              ...pkResult.map(
                (pk) => `| ${pk.index_name} | ${pk.column_name} |`,
              ),
            );
            lines.push("");
          }

          if (fkResult.length > 0) {
            lines.push(`### Foreign Keys`);
            lines.push(
              `| FK Name | Column | Primary Table | Primary Column | PK Index |`,
            );
            lines.push(
              `|---------|--------|---------------|----------------|----------|`,
            );
            lines.push(
              ...fkResult.map(
                (fk) =>
                  `| ${fk.foreign_key_name} | ${fk.foreign_column_name} | ${fk.primary_table_name} | ${fk.primary_column_name} | ${fk.primary_key_name} |`,
              ),
            );
            lines.push("");
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
              text: `Error getting table schema: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
