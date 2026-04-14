import type { IncomingMessage } from "node:http";

import { describe, expect, it, vi } from "vitest";

const { expectedToken } = vi.hoisted(() => ({
  expectedToken: "test-token",
}));

vi.mock("node:http", async () => await vi.importActual("node:http"));

import { checkBearerAuth } from "./auth.js";

function createRequest(authorization?: string): IncomingMessage {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as IncomingMessage;
}

describe("checkBearerAuth", () => {
  it("returns false when the authorization header is missing", () => {
    expect(checkBearerAuth(createRequest(), expectedToken)).toBe(false);
  });

  it("returns false when the token does not match exactly", () => {
    expect(checkBearerAuth(createRequest("Bearer test-token-extra"), expectedToken)).toBe(
      false,
    );
  });

  it("returns true for a matching bearer token", () => {
    expect(checkBearerAuth(createRequest("Bearer test-token"), expectedToken)).toBe(true);
  });

  it("treats the bearer scheme as case-insensitive and the token as case-sensitive", () => {
    expect(checkBearerAuth(createRequest("bearer test-token"), expectedToken)).toBe(true);
    expect(checkBearerAuth(createRequest("Bearer Test-Token"), expectedToken)).toBe(false);
  });

  it("returns false for malformed authorization headers", () => {
    expect(checkBearerAuth(createRequest("BearerTest-token"), expectedToken)).toBe(false);
  });
});
