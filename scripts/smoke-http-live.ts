import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import process from "node:process";

import {
  EXPECTED_TOOL_NAMES,
  assert,
  collectProcessOutput,
  createClientMetadata,
  getAvailablePort,
  requireEnv,
  shouldSkipLiveSmoke,
  spawnNodeScript,
  stopChildProcess,
  waitForHttpServer,
  withErrorContext,
} from "./smoke-helpers.js";

async function main() {
  if (shouldSkipLiveSmoke()) {
    console.error("Skipping live HTTP smoke; set RUN_SQLANYWHERE_LIVE_SMOKE=1 to enable.");
    return;
  }

  const connectionString = requireEnv("SQLANYWHERE_CONN_STR");
  const bearerToken = requireEnv("MCP_HTTP_BEARER_TOKEN");
  const port = await getAvailablePort();
  const path = "/mcp";
  const baseUrl = `http://127.0.0.1:${port}${path}`;
  const serverProcess = spawnNodeScript(
    ["./dist/index.js"],
    {
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      MCP_HTTP_PATH: path,
      MCP_HTTP_BEARER_TOKEN: bearerToken,
      SQLANYWHERE_CONN_STR: connectionString,
    },
  );
  const output = collectProcessOutput(serverProcess);
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
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

    assert(unauthorizedResponse.status === 401, `Expected 401 for unauthorized live HTTP request, received ${unauthorizedResponse.status}.`);
    assert(
      unauthorizedResponse.headers.get("www-authenticate") === 'Bearer realm="MCP"',
      "Expected WWW-Authenticate header on unauthorized live HTTP response.",
    );

    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    assert(serverVersion?.name === "sqlanywhere-mcp-server", "Unexpected server name in live HTTP initialize response.");

    const toolNames = (await client.listTools()).tools.map((tool) => tool.name).sort();

    for (const expectedTool of EXPECTED_TOOL_NAMES) {
      assert(toolNames.includes(expectedTool), `Missing tool in live HTTP smoke: ${expectedTool}`);
    }
  } catch (error) {
    throw withErrorContext(
      `live HTTP smoke failed${output.getStderr() ? `\nchild stderr:\n${output.getStderr().trim()}` : ""}`,
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
