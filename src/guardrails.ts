export const DEFAULT_AUTHORIZED_USERS = ["monitor", "ExtensionsUser"];

export function getAuthorizedUsers(): string[] {
  const envValue = process.env.SQLANYWHERE_AUTHORIZED_USERS;
  if (envValue) {
    return envValue
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }
  return DEFAULT_AUTHORIZED_USERS;
}

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export function validateQuery(
  query: string,
  authorizedUsers: string[],
): ValidationResult {
  const trimmedQuery = query.trim();
  const upperQuery = trimmedQuery.toUpperCase();

  // 1. Guard: Only SELECT or WITH queries are allowed
  const isReadQuery = /^\s*(SELECT|WITH)\s/i.test(upperQuery);
  if (!isReadQuery) {
    return {
      isValid: false,
      error: "Error: Only SELECT or WITH queries are allowed for safety.",
    };
  }

  // 2. Guard: Dangerous SQL words
  const dangerousKeywords = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "RENAME",
    "GRANT",
    "REVOKE",
    "ATTACH",
    "DETACH",
    "MERGE",
    "EXECUTE",
    "CALL",
    "BACKUP",
    "RESTORE",
    "LOAD",
    "UNLOAD",
  ];
  for (const kw of dangerousKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(upperQuery)) {
      return {
        isValid: false,
        error: `Error: Dangerous keyword '${kw}' detected. Only read-only SELECT queries are permitted.`,
      };
    }
  }

  // 3. Guard: Multiple statements (semicolon check)
  const firstSemicolon = trimmedQuery.indexOf(";");
  if (
    firstSemicolon !== -1 &&
    firstSemicolon < trimmedQuery.length - 1 &&
    trimmedQuery.substring(firstSemicolon + 1).trim().length > 0
  ) {
    return {
      isValid: false,
      error: "Error: Multiple SQL statements are not allowed for safety.",
    };
  }

  // 4. Guard: AUTHORIZED_USERS owner checks
  if (authorizedUsers.length > 0) {
    // Find all [owner.]table references in FROM/JOIN clauses
    const fromJoinRegex =
      /\b(FROM|JOIN)\s+(?:([a-zA-Z0-9_"]+)\.)?([a-zA-Z0-9_"]+)/gi;
    let match;
    const unauthorizedOwners = new Set<string>();

    while ((match = fromJoinRegex.exec(trimmedQuery)) !== null) {
      const owner = match[2];
      if (owner) {
        const cleanOwner = owner.replace(/"/g, "").toLowerCase();
        const authorizedLower = authorizedUsers.map((u) => u.toLowerCase());
        if (!authorizedLower.includes(cleanOwner)) {
          unauthorizedOwners.add(cleanOwner);
        }
      }
    }

    if (unauthorizedOwners.size > 0) {
      return {
        isValid: false,
        error: `Error: Access to owners [${Array.from(unauthorizedOwners).join(", ")}] is not authorized. Authorized owners: ${authorizedUsers.join(", ")}`,
      };
    }
  }

  return { isValid: true };
}
