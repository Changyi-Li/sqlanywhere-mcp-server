import type { IncomingMessage } from "node:http";

export function checkBearerAuth(req: IncomingMessage, expectedToken: string): boolean {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return false;
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return false;
  }

  return parts[1] === expectedToken;
}

export const authorizeBearerToken = checkBearerAuth;
