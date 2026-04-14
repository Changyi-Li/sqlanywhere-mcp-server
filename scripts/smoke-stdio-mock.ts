import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

import {
  EXPECTED_TOOL_NAMES,
  FAKE_CONNECTION_STRING,
  assert,
  createClientMetadata,
  withErrorContext,
  writeEvidence,
} from "./smoke-helpers.js";

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "./scripts/mock-server.ts"],
    cwd: process.cwd(),
    env: {
      MCP_TRANSPORT: "stdio",
      SQLANYWHERE_CONN_STR: FAKE_CONNECTION_STRING,
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
    assert(serverVersion?.name === "sqlanywhere-mcp-server", "Unexpected server name in initialize response.");

    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((tool) => tool.name).sort();

    assert(toolNames.length === EXPECTED_TOOL_NAMES.length, "Unexpected tool count from stdio mock smoke.");

    for (const expectedTool of EXPECTED_TOOL_NAMES) {
      assert(toolNames.includes(expectedTool), `Missing tool in stdio mock smoke: ${expectedTool}`);
    }

    await writeEvidence("smoke-stdio-mock", {
      transport: "stdio",
      mode: "mock",
      serverVersion,
      tools: toolNames,
      stderr: stderr.trim(),
    });
  } catch (error) {
    throw withErrorContext(`stdio mock smoke failed${stderr ? `\nchild stderr:\n${stderr.trim()}` : ""}`, error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
