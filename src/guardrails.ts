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
    const authorizedLower = authorizedUsers.map((u) => u.toLowerCase());
    const unauthorizedOwners = new Set<string>();

    // Strip comments to avoid false positives
    const queryWithoutComments = trimmedQuery.replace(
      /(--.*)|(\/\*[\s\S]*?\*\/)/g,
      " ",
    );

    // Tokenize roughly to identify keywords and identifiers
    // This handles quoted identifiers, common SQL keywords, and operators
    const tokenRegex =
      /"[^"]*"|'[^']*'|\b(?:FROM|JOIN|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|INTERSECT|EXCEPT|ON|USING|SELECT|AS|WITH|APPLY|TABLE|VALUES)\b|[().,;.]|[^\s().,;.]+/gi;
    const matches = queryWithoutComments.matchAll(tokenRegex);
    const tokenList = Array.from(matches).map((m) => m[0]);

    const tableStartKeywords = ["FROM", "JOIN", "APPLY"];
    const tableEndKeywords = [
      "WHERE",
      "GROUP",
      "ORDER",
      "HAVING",
      "LIMIT",
      "UNION",
      "INTERSECT",
      "EXCEPT",
      "ON",
      "USING",
      "SELECT",
      "WITH",
      "VALUES",
      "(",
      ")",
      ";",
    ];

    let inTableContext = false;
    let expectingTable = false;

    for (let i = 0; i < tokenList.length; i++) {
      const token = tokenList[i].toUpperCase();

      // Start of a table reference section
      if (tableStartKeywords.includes(token)) {
        inTableContext = true;
        expectingTable = true;
        continue;
      }

      // End of a table reference section (transitioning to WHERE, ON, or nested query)
      if (tableEndKeywords.includes(token)) {
        inTableContext = false;
        expectingTable = false;
        continue;
      }

      // Comma in FROM clause continues the list of tables
      if (token === ",") {
        if (inTableContext) {
          expectingTable = true;
        }
        continue;
      }

      // If we are expecting a table name, it may be [owner.]table
      if (expectingTable) {
        let owner: string | null = null;
        let tableName = tokenList[i];

        // Check for owner.table pattern
        if (i + 1 < tokenList.length && tokenList[i + 1] === ".") {
          owner = tokenList[i];
          if (i + 2 < tokenList.length) {
            tableName = tokenList[i + 2];
            i += 2; // Jump over dot and tableName
          } else {
            i += 1; // Jump over dot
          }
        }

        if (owner) {
          const cleanOwner = owner.replace(/"/g, "").toLowerCase();
          if (!authorizedLower.includes(cleanOwner)) {
            unauthorizedOwners.add(cleanOwner);
          }
        } else if (tableName) {
          // If no owner, check if it's a system table (starts with sys)
          const cleanTable = tableName.replace(/"/g, "").toLowerCase();
          if (
            cleanTable.startsWith("sys") &&
            !authorizedLower.includes("sys")
          ) {
            unauthorizedOwners.add("sys (implied)");
          }
        }

        // We've processed the table reference; subsequent tokens might be aliases
        // until we hit a comma or a terminal keyword.
        expectingTable = false;
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
