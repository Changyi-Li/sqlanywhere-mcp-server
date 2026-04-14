import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";

import { checkBearerAuth } from "./auth.js";
import type { HttpConfig } from "./config.js";

type HttpServerDependencies = {
  createRequestServer?: (connectionString: string) => Promise<McpServer>;
};

function getRequestPath(req: IncomingMessage, config: HttpConfig): string {
  const origin = `http://${config.httpHost}:${config.httpPort}`;
  return new URL(req.url ?? "/", origin).pathname;
}

function writeResponse(
  res: ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: HttpConfig,
  dependencies: HttpServerDependencies,
) {
  const requestServerFactory = dependencies.createRequestServer
    ?? (await import("./bootstrap.js")).createServer;
  const requestServer = await requestServerFactory(config.connectionString);
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  try {
    await requestServer.connect(transport);
    await transport.handleRequest(req, res);
  } finally {
    await requestServer.close();
  }
}

export async function closeHttpServer(httpServer: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    httpServer.close((error) => {
      if (error) {
        console.error("Failed to close HTTP listener:", error);
      }

      resolve();
    });
  });
}

export async function startHttpServer(
  _server: McpServer,
  config: HttpConfig,
  dependencies: HttpServerDependencies = {},
): Promise<HttpServer> {
  const httpServer = createNodeHttpServer(async (req, res) => {
    if (getRequestPath(req, config) !== config.httpPath) {
      writeResponse(res, 404, "Not Found");
      return;
    }

    if (req.method !== "POST") {
      writeResponse(res, 405, "Method Not Allowed", {
        Allow: "POST",
      });
      return;
    }

    if (!checkBearerAuth(req, config.httpBearerToken)) {
      writeResponse(res, 401, "Unauthorized", {
        "WWW-Authenticate": 'Bearer realm="MCP"',
      });
      return;
    }

    try {
      await handleMcpRequest(req, res, config, dependencies);
    } catch (error) {
      console.error("MCP HTTP request error:", error);

      if (!res.headersSent) {
        writeResponse(res, 500, "Internal Server Error");
        return;
      }

      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };

    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(config.httpPort, config.httpHost);
  });

  console.error(
    `MCP HTTP server listening on http://${config.httpHost}:${config.httpPort}${config.httpPath}`,
  );

  return httpServer;
}
