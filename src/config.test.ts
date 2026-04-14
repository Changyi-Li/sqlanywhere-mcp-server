import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const validConnectionString =
  "Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;";

describe("loadConfig", () => {
  it('resolves to "stdio" when MCP_TRANSPORT is unset', () => {
    const config = loadConfig({ SQLANYWHERE_CONN_STR: validConnectionString });

    expect(config.transport).toBe("stdio");
    expect(config.httpBearerToken).toBeUndefined();
  });

  it('resolves to "stdio" when MCP_TRANSPORT=stdio', () => {
    const config = loadConfig({
      MCP_TRANSPORT: "stdio",
      SQLANYWHERE_CONN_STR: validConnectionString,
    });

    expect(config.transport).toBe("stdio");
  });

  it('resolves to "http" when MCP_TRANSPORT=http and HTTP env is provided', () => {
    const config = loadConfig({
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_PORT: "4100",
      MCP_HTTP_PATH: "/custom-mcp",
      MCP_HTTP_BEARER_TOKEN: "secret-token",
      SQLANYWHERE_CONN_STR: validConnectionString,
    });

    expect(config).toEqual({
      transport: "http",
      httpHost: "0.0.0.0",
      httpPort: 4100,
      httpPath: "/custom-mcp",
      httpBearerToken: "secret-token",
      connectionString: validConnectionString,
    });
  });

  it("throws a clear error for unsupported transports", () => {
    expect(() =>
      loadConfig({
        MCP_TRANSPORT: "bogus",
        SQLANYWHERE_CONN_STR: validConnectionString,
      }),
    ).toThrow(/Unsupported MCP_TRANSPORT value: bogus/);
  });

  it("throws a clear error when http mode is missing bearer token", () => {
    expect(() =>
      loadConfig({
        MCP_TRANSPORT: "http",
        SQLANYWHERE_CONN_STR: validConnectionString,
      }),
    ).toThrow(/MCP_HTTP_BEARER_TOKEN is required when MCP_TRANSPORT=http/);
  });

  it("throws a clear error when SQLANYWHERE_CONN_STR is missing", () => {
    expect(() => loadConfig({})).toThrow(
      /SQLANYWHERE_CONN_STR environment variable is required/,
    );
  });

  it("applies default HTTP host, port, and path values", () => {
    const config = loadConfig({ SQLANYWHERE_CONN_STR: validConnectionString });

    expect(config.httpHost).toBe("127.0.0.1");
    expect(config.httpPort).toBe(3100);
    expect(config.httpPath).toBe("/mcp");
  });
});
