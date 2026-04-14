export type TransportMode = "stdio" | "http";

type BaseConfig = {
  transport: TransportMode;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  connectionString: string;
};

export type StdioConfig = BaseConfig & {
  transport: "stdio";
  httpBearerToken: undefined;
};

export type HttpConfig = BaseConfig & {
  transport: "http";
  httpBearerToken: string;
};

export type RuntimeConfig = StdioConfig | HttpConfig;

const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3100;
const DEFAULT_HTTP_PATH = "/mcp";

function parseTransport(value: string | undefined): TransportMode {
  if (value === undefined || value === "stdio") {
    return "stdio";
  }

  if (value === "http") {
    return "http";
  }

  throw new Error(
    `Unsupported MCP_TRANSPORT value: ${value}. Expected "stdio" or "http".`,
  );
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_HTTP_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid MCP_HTTP_PORT value: ${value}. Expected an integer between 1 and 65535.`,
    );
  }

  return port;
}

function getConnectionString(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      "ERROR: SQLANYWHERE_CONN_STR environment variable is required.\nExample: 'Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;'",
    );
  }

  return value;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const transport = parseTransport(env.MCP_TRANSPORT);
  const httpHost = env.MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST;
  const httpPort = parsePort(env.MCP_HTTP_PORT);
  const httpPath = env.MCP_HTTP_PATH ?? DEFAULT_HTTP_PATH;
  const connectionString = getConnectionString(env.SQLANYWHERE_CONN_STR);

  if (transport === "http") {
    const httpBearerToken = env.MCP_HTTP_BEARER_TOKEN;

    if (httpBearerToken === undefined || httpBearerToken.trim() === "") {
      throw new Error(
        "MCP_HTTP_BEARER_TOKEN is required when MCP_TRANSPORT=http.",
      );
    }

    return {
      transport,
      httpHost,
      httpPort,
      httpPath,
      httpBearerToken,
      connectionString,
    };
  }

  return {
    transport,
    httpHost,
    httpPort,
    httpPath,
    httpBearerToken: undefined,
    connectionString,
  };
}
