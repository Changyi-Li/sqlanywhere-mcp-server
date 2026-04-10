import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecuteQueryTool } from "./execute_query.js";
import { registerListTablesTool } from "./list_tables.js";
import { registerGetTableSchemaTool } from "./get_table_schema.js";
import { registerTestConnectionTool } from "./test_connection.js";

export function registerTools(server: McpServer) {
  registerTestConnectionTool(server);
  registerListTablesTool(server);
  registerGetTableSchemaTool(server);
  registerExecuteQueryTool(server);
}
