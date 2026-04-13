import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTestConnectionTool } from "./test_connection.js";
import { registerListTablesTool } from "./list_tables.js";
import { registerGetTableSchemaTool } from "./get_table_schema.js";
import { registerListViewsTool } from "./list_views.js";
import { registerGetViewSchemaTool } from "./get_view_schema.js";
import { registerExecuteQueryTool } from "./execute_query.js";

export function registerTools(server: McpServer) {
  registerTestConnectionTool(server);
  registerListTablesTool(server);
  registerGetTableSchemaTool(server);
  registerListViewsTool(server);
  registerGetViewSchemaTool(server);
  registerExecuteQueryTool(server);
}
