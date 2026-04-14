import type { Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const { closeMock, dbCloseMock } = vi.hoisted(() => ({
  closeMock: vi.fn(),
  dbCloseMock: vi.fn(),
}));

vi.mock("./db.js", () => ({
  close: dbCloseMock,
}));

vi.mock("./bootstrap.js", () => ({
  createServer: vi.fn(),
}));

vi.mock("./http.js", async () => {
  const actual = await vi.importActual<typeof import("./http.js")>("./http.js");

  return {
    ...actual,
    closeHttpServer: vi.fn(actual.closeHttpServer),
    startHttpServer: vi.fn(),
  };
});

import { createShutdown } from "./index.js";
import { closeHttpServer } from "./http.js";

function createHttpListener(): HttpServer {
  return {
    close: closeMock,
  } as unknown as HttpServer;
}

describe("lifecycle shutdown", () => {
  afterEach(() => {
    closeMock.mockReset();
    dbCloseMock.mockReset();
    dbCloseMock.mockResolvedValue(undefined);
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("closes the HTTP listener before closing the database and only shuts down once", async () => {
    const events: string[] = [];
    const httpListener = createHttpListener();

    closeMock.mockImplementation((callback?: (error?: Error) => void) => {
      events.push("http-close");
      callback?.();
      return httpListener;
    });

    dbCloseMock.mockImplementation(async () => {
      events.push("db-close");
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const shutdown = createShutdown({
      transport: "http",
      getHttpListener: () => httpListener,
    });

    await shutdown();
    await shutdown();

    expect(events).toEqual(["http-close", "db-close"]);
    expect(closeHttpServer).toHaveBeenCalledTimes(1);
    expect(dbCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("logs an actionable error and still exits when database shutdown fails in HTTP mode", async () => {
    const shutdownError = new Error("database is busy");
    const httpListener = createHttpListener();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    closeMock.mockImplementation((callback?: (error?: Error) => void) => {
      callback?.();
      return httpListener;
    });

    dbCloseMock.mockRejectedValue(shutdownError);

    const shutdown = createShutdown({
      transport: "http",
      getHttpListener: () => httpListener,
    });

    await shutdown();

    expect(closeHttpServer).toHaveBeenCalledTimes(1);
    expect(dbCloseMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to close database during shutdown:",
      shutdownError,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("closes the database once for stdio shutdown without touching HTTP cleanup", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const shutdown = createShutdown({
      transport: "stdio",
    });

    await shutdown();

    expect(closeHttpServer).not.toHaveBeenCalled();
    expect(dbCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
