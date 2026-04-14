import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import process from "node:process";

import {
  EXPECTED_TOOL_NAMES,
  FAKE_CONNECTION_STRING,
  MOCK_HTTP_BEARER_TOKEN,
  assert,
  collectProcessOutput,
  createClientMetadata,
  getAvailablePort,
  spawnNodeScript,
  stopChildProcess,
  waitForHttpServer,
  withErrorContext,
  writeEvidence,
} from "./smoke-helpers.js";

async function main() {
  const port = await getAvailablePort();
  const path = "/mcp";
  const baseUrl = `http://127.0.0.1:${port}${path}`;
  const serverProcess = spawnNodeScript(
    ["--import", "tsx", "./scripts/mock-server.ts"],
    {
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      MCP_HTTP_PATH: path,
      MCP_HTTP_BEARER_TOKEN: MOCK_HTTP_BEARER_TOKEN,
      SQLANYWHERE_CONN_STR: FAKE_CONNECTION_STRING,
    },
  );
  const output = collectProcessOutput(serverProcess);
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${MOCK_HTTP_BEARER_TOKEN}`,
      },
    },
  });
  const client = new Client(createClientMetadata(), { capabilities: {} });

  try {
    await waitForHttpServer(baseUrl);

    const unauthorizedResponse = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: createClientMetadata(),
        },
      }),
    });

    assert(unauthorizedResponse.status === 401, `Expected 401 for unauthorized HTTP request, received ${unauthorizedResponse.status}.`);
    assert(
      unauthorizedResponse.headers.get("www-authenticate") === 'Bearer realm="MCP"',
      "Expected WWW-Authenticate header on unauthorized HTTP response.",
    );

    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    assert(serverVersion?.name === "sqlanywhere-mcp-server", "Unexpected server name in HTTP initialize response.");

    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((tool) => tool.name).sort();

    for (const expectedTool of EXPECTED_TOOL_NAMES) {
      assert(toolNames.includes(expectedTool), `Missing tool in HTTP mock smoke: ${expectedTool}`);
    }

    await writeEvidence("smoke-http-mock", {
      transport: "http",
      mode: "mock",
      serverVersion,
      tools: toolNames,
      unauthorizedStatus: unauthorizedResponse.status,
      serverStdout: output.getStdout().trim(),
      serverStderr: output.getStderr().trim(),
    });
  } catch (error) {
    throw withErrorContext(
      `http mock smoke failed${output.getStderr() ? `\nchild stderr:\n${output.getStderr().trim()}` : ""}`,
      error,
    );
  } finally {
    await client.close().catch(() => undefined);
    await stopChildProcess(serverProcess);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
