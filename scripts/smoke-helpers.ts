import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

export const FAKE_CONNECTION_STRING = "Driver={Mock SQL Anywhere};Server=mock-host;Database=mock-db;Uid=mock;Pwd=mock;";
export const MOCK_HTTP_BEARER_TOKEN = "mock-smoke-token";
export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const EXPECTED_TOOL_NAMES = [
  "sqlanywhere_test_connection",
  "sqlanywhere_execute_query",
  "sqlanywhere_list_tables",
  "sqlanywhere_list_views",
  "sqlanywhere_get_table_schema",
  "sqlanywhere_get_view_schema",
] as const;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function createClientMetadata() {
  return {
    name: "smoke-client",
    version: "1.0.0",
  };
}

export function createInitializeParams() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: createClientMetadata(),
  };
}

export async function getAvailablePort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", reject);
      resolve();
    });
  });

  const address = probe.address();
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  assert(address !== null && typeof address !== "string", "Failed to allocate a TCP port.");
  return address.port;
}

export async function writeEvidence(name: string, payload: unknown) {
  const evidenceDir = ".sisyphus/evidence";
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    `${evidenceDir}/${name}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function shouldSkipLiveSmoke(): boolean {
  return process.env.RUN_SQLANYWHERE_LIVE_SMOKE !== "1";
}

export async function waitForHttpServer(url: string, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Timed out waiting for HTTP server at ${url}`);
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function spawnNodeScript(
  args: string[],
  env: Record<string, string | undefined>,
): ChildProcess {
  return spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function collectProcessOutput(child: ChildProcess) {
  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });

  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return {
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

export async function stopChildProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill("SIGKILL");

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    const timeout = setTimeout(resolve, 2_000);
    timeout.unref();
  });
}

export function withErrorContext(message: string, error: unknown) {
  if (error instanceof Error) {
    return new Error(`${message}: ${error.message}`);
  }

  return new Error(`${message}: ${String(error)}`);
}
