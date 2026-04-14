import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

import {
  EXPECTED_TOOL_NAMES,
  assert,
  createClientMetadata,
  requireEnv,
  shouldSkipLiveSmoke,
  withErrorContext,
} from "./smoke-helpers.js";

async function main() {
  if (shouldSkipLiveSmoke()) {
    console.error("Skipping live stdio smoke; set RUN_SQLANYWHERE_LIVE_SMOKE=1 to enable.");
    return;
  }

  const connectionString = requireEnv("SQLANYWHERE_CONN_STR");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["./dist/index.js"],
    cwd: process.cwd(),
    env: {
      MCP_TRANSPORT: "stdio",
      SQLANYWHERE_CONN_STR: connectionString,
    },
    stderr: "pipe",
  });

  let stderr = "";
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const client = new Client(createClientMetadata(), { capabilities: {} });

  try {
    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    assert(serverVersion?.name === "sqlanywhere-mcp-server", "Unexpected server name in live stdio initialize response.");

    const toolNames = (await client.listTools()).tools.map((tool) => tool.name).sort();

    for (const expectedTool of EXPECTED_TOOL_NAMES) {
      assert(toolNames.includes(expectedTool), `Missing tool in live stdio smoke: ${expectedTool}`);
    }
  } catch (error) {
    throw withErrorContext(`live stdio smoke failed${stderr ? `\nchild stderr:\n${stderr.trim()}` : ""}`, error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
