import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { connectMock, registerToolsMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  registerToolsMock: vi.fn(),
}));

vi.mock("./db.js", () => ({
  connect: connectMock,
}));

vi.mock("./tools/index.js", () => ({
  registerTools: registerToolsMock,
}));

import { createServer } from "./bootstrap.js";

describe("createServer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an McpServer instance", async () => {
    const server = await createServer("Driver={SQL Anywhere 17};Uid=dba;");

    expect(server).toBeInstanceOf(McpServer);
  });

  it("calls registerTools exactly once on the returned server", async () => {
    const server = await createServer("Driver={SQL Anywhere 17};Uid=dba;");

    expect(connectMock).toHaveBeenCalledWith("Driver={SQL Anywhere 17};Uid=dba;");
    expect(registerToolsMock).toHaveBeenCalledTimes(1);
    expect(registerToolsMock).toHaveBeenCalledWith(server);
  });

  it("uses the same tool registration path regardless of transport mode", async () => {
    const stdioServer = await createServer("transport=stdio");
    const httpServer = await createServer("transport=http");

    expect(connectMock).toHaveBeenNthCalledWith(1, "transport=stdio");
    expect(connectMock).toHaveBeenNthCalledWith(2, "transport=http");
    expect(registerToolsMock).toHaveBeenNthCalledWith(1, stdioServer);
    expect(registerToolsMock).toHaveBeenNthCalledWith(2, httpServer);
    expect(registerToolsMock).toHaveBeenCalledTimes(2);
  });
});
