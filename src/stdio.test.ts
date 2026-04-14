import { afterEach, describe, expect, it, vi } from "vitest";

const { connectMock, transportCreatedMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  transportCreatedMock: vi.fn(),
}));

vi.mock("./db.js", () => ({
  close: vi.fn(),
}));

vi.mock("./bootstrap.js", () => ({
  createServer: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class MockStdioServerTransport {
    constructor() {
      transportCreatedMock(this);
    }
  },
}));

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConfig } from "./config.js";
import { startStdioServer } from "./index.js";

const validConnectionString =
  "Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;";

describe("stdio startup", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not require MCP_HTTP_BEARER_TOKEN when MCP_TRANSPORT=stdio", () => {
    expect(() =>
      loadConfig({
        MCP_TRANSPORT: "stdio",
        SQLANYWHERE_CONN_STR: validConnectionString,
      }),
    ).not.toThrow();
  });

  it("connects using StdioServerTransport and logs to stderr", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const config = loadConfig({
      MCP_TRANSPORT: "stdio",
      SQLANYWHERE_CONN_STR: validConnectionString,
    });
    const server = {
      connect: connectMock,
    } as unknown as McpServer;

    await startStdioServer(server, config);

    expect(transportCreatedMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith(
      transportCreatedMock.mock.calls[0]?.[0],
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("MCP server running on stdio");

    consoleErrorSpy.mockRestore();
  });
});
