import odbc from "odbc";

let connection: odbc.Connection | null = null;

export async function connect(
  connectionString: string,
): Promise<odbc.Connection> {
  if (connection) {
    return connection;
  }
  try {
    connection = await odbc.connect(connectionString);
    return connection;
  } catch (error) {
    throw new Error(
      `Failed to connect to ODBC: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function query<T = any>(
  sql: string,
  parameters: any[] = [],
): Promise<T[]> {
  if (!connection) {
    throw new Error("Not connected to database.");
  }

  try {
    const result = await connection.query(sql, parameters);
    // The result object from odbc is an array of rows.
    // We convert BigInt values to strings to prevent JSON serialization errors.
    return Array.from(result).map((row: any) => {
      const processedRow: any = {};
      for (const key in row) {
        const val = row[key];
        processedRow[key] = typeof val === "bigint" ? val.toString() : val;
      }
      return processedRow;
    }) as T[];
  } catch (error) {
    throw new Error(
      `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function close(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
}
