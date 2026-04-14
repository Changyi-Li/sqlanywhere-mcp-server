import { createServer, type Server } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { connectMock, registerToolsMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  registerToolsMock: vi.fn(),
}));

vi.mock("./db.js", () => ({
  connect: connectMock,
  close: vi.fn(),
}));

vi.mock("./tools/index.js", () => ({
  registerTools: registerToolsMock,
}));

import type { HttpConfig } from "./config.js";
import { startHttpServer } from "./http.js";

const connectionString = "Driver={SQL Anywhere 17};Uid=dba;Pwd=sql;";

function createConfig(port: number): HttpConfig {
  return {
    transport: "http",
    httpHost: "127.0.0.1",
    httpPort: port,
    httpPath: "/mcp",
    httpBearerToken: "test-token",
    connectionString,
  };
}

function createInitializeRequest() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "vitest-client",
        version: "1.0.0",
      },
    },
  };
}

type InitializeResponse = {
  jsonrpc: string;
  id: number;
  result: {
    protocolVersion: string;
    serverInfo: {
      name: string;
    };
  };
};

async function getAvailablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", reject);
      resolve();
    });
  });

  const address = probe.address();
  if (address === null || typeof address === "string") {
    await closeServer(probe);
    throw new Error("Failed to determine an available port.");
  }

  const { port } = address;
  await closeServer(probe);
  return port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("HTTP startup", () => {
  let httpServer: Server | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    if (httpServer) {
      await closeServer(httpServer);
      httpServer = undefined;
    }
  });

  it("starts and listens on the configured host and port", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const address = httpServer.address();

    expect(httpServer.listening).toBe(true);
    expect(address).not.toBeNull();
    expect(typeof address).not.toBe("string");

    if (address && typeof address !== "string") {
      expect(address.address).toBe(config.httpHost);
      expect(address.port).toBe(config.httpPort);
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `MCP HTTP server listening on http://${config.httpHost}:${config.httpPort}${config.httpPath}`,
    );
  });

  it("returns 405 for GET requests to the MCP path", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const response = await fetch(`http://${config.httpHost}:${config.httpPort}${config.httpPath}`, {
      method: "GET",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(connectMock).not.toHaveBeenCalled();
    expect(registerToolsMock).not.toHaveBeenCalled();
  });

  it("returns 404 for POST requests to non-MCP paths", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const response = await fetch(`http://${config.httpHost}:${config.httpPort}/wrong-path`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createInitializeRequest()),
    });

    expect(response.status).toBe(404);
    expect(connectMock).not.toHaveBeenCalled();
    expect(registerToolsMock).not.toHaveBeenCalled();
  });

  it("returns 401 for POST requests without an authorization header", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const response = await fetch(`http://${config.httpHost}:${config.httpPort}${config.httpPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createInitializeRequest()),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="MCP"');
    expect(await response.text()).toBe("Unauthorized");
    expect(connectMock).not.toHaveBeenCalled();
    expect(registerToolsMock).not.toHaveBeenCalled();
  });

  it("returns 401 for POST requests with the wrong bearer token", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const response = await fetch(`http://${config.httpHost}:${config.httpPort}${config.httpPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createInitializeRequest()),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="MCP"');
    expect(await response.text()).toBe("Unauthorized");
    expect(connectMock).not.toHaveBeenCalled();
    expect(registerToolsMock).not.toHaveBeenCalled();
  });

  it("accepts initialize requests on the MCP path", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    const response = await fetch(`http://${config.httpHost}:${config.httpPort}${config.httpPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createInitializeRequest()),
    });

    const payload = await response.json() as InitializeResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(1);
    expect(payload.result.protocolVersion).toBe("2025-03-26");
    expect(payload.result.serverInfo.name).toBe("sqlanywhere-mcp-server");
    expect(connectMock).toHaveBeenCalledWith(connectionString);
    expect(registerToolsMock).toHaveBeenCalledTimes(1);
  });

  it("closes cleanly", async () => {
    const port = await getAvailablePort();
    const config = createConfig(port);

    httpServer = await startHttpServer(
      new McpServer({ name: "test-root", version: "1.0.0" }),
      config,
    );

    await closeServer(httpServer);

    expect(httpServer.listening).toBe(false);
    httpServer = undefined;
  });
});
