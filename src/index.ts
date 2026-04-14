#!/usr/bin/env node

import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Server as HttpServer } from "node:http";
import { pathToFileURL } from "node:url";

import { loadConfig, type RuntimeConfig } from "./config.js";
import { closeHttpServer, startHttpServer } from "./http.js";

export async function startStdioServer(
  server: McpServer,
  _config: RuntimeConfig,
) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running on stdio");
}

type ShutdownDependencies = {
  transport: RuntimeConfig["transport"];
  getHttpListener?: () => HttpServer | undefined;
  closeDatabase?: () => Promise<void>;
  exit?: (code: number) => unknown;
};

export function createShutdown({
  transport,
  getHttpListener,
  closeDatabase = async () => {
    const db = await import("./db.js");
    await db.close();
  },
  exit = process.exit,
}: ShutdownDependencies) {
  let shutdownPromise: Promise<void> | undefined;

  return async () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      if (transport === "http") {
        const httpListener = getHttpListener?.();

        if (httpListener) {
          await closeHttpServer(httpListener);
        }
      }

      let exitCode = 0;

      try {
        await closeDatabase();
      } catch (error) {
        exitCode = 1;
        console.error("Failed to close database during shutdown:", error);
      }

      exit(exitCode);
    })();

    return shutdownPromise;
  };
}

export async function main() {
  const config = loadConfig();
  let httpListener: HttpServer | undefined;

  const shutdown = createShutdown({
    transport: config.transport,
    getHttpListener: () => httpListener,
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let server: McpServer;

  try {
    const { createServer } = await import("./bootstrap.js");
    server = await createServer(config.connectionString);
    console.error("Connected to SQL Anywhere database.");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }

  if (config.transport === "stdio") {
    await startStdioServer(server, config);
  } else {
    httpListener = await startHttpServer(server, config);
  }
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
