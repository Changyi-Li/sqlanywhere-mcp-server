import { describe, it, expect } from "vitest";
import { validateQuery } from "./guardrails.js";

describe("validateQuery", () => {
  const authorizedUsers = ["monitor", "ExtensionsUser", "dbo"];

  describe("Read-only Guard (SELECT/WITH)", () => {
    it("should allow valid SELECT queries", () => {
      const result = validateQuery(
        "SELECT * FROM monitor.Part",
        authorizedUsers,
      );
      expect(result.isValid).toBe(true);
    });

    it("should allow valid WITH queries", () => {
      const result = validateQuery(
        "WITH temp AS (SELECT * FROM monitor.Part) SELECT * FROM temp",
        authorizedUsers,
      );
      expect(result.isValid).toBe(true);
    });

    it("should allow queries with leading whitespace", () => {
      const result = validateQuery("   SELECT 1", authorizedUsers);
      expect(result.isValid).toBe(true);
    });

    it("should reject non-SELECT/WITH queries", () => {
      const queries = [
        "UPDATE monitor.Part SET price = 10",
        "DELETE FROM monitor.Part",
        "INSERT INTO monitor.Part VALUES (1)",
        "DROP TABLE monitor.Part",
        "CREATE TABLE test (id INT)",
      ];
      for (const q of queries) {
        const result = validateQuery(q, authorizedUsers);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain(
          "Only SELECT or WITH queries are allowed",
        );
      }
    });

    it("should reject empty or nonsense queries", () => {
      expect(validateQuery("", authorizedUsers).isValid).toBe(false);
      expect(validateQuery("hello world", authorizedUsers).isValid).toBe(false);
    });
  });

  describe("Dangerous Keywords Guard", () => {
    it("should reject queries with dangerous keywords in the middle", () => {
      const dangerousQueries = [
        "SELECT * FROM monitor.Part; DROP TABLE monitor.Part",
        "SELECT * FROM (DELETE FROM monitor.Part)",
        "SELECT * FROM monitor.Part WHERE id = (UPDATE monitor.Part SET x=1)",
      ];
      // Note: Some of these might be caught by the semicolon guard first,
      // but they should be rejected regardless.
      for (const q of dangerousQueries) {
        const result = validateQuery(q, authorizedUsers);
        expect(result.isValid).toBe(false);
      }
    });

    it("should reject dangerous keywords even in different cases", () => {
      const result = validateQuery(
        "SELECT * FROM monitor.Part -- insert something",
        authorizedUsers,
      );
      // Wait, the regex \bkw\b might catch 'insert' even in comments.
      // This is a safety feature, though it might be slightly aggressive.
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Dangerous keyword 'INSERT' detected");
    });

    it("should allow words that contain dangerous keywords as substrings", () => {
      // 'Application' contains 'alter' (wait, no)
      // 'Created' contains 'create'
      // The \b boundary should prevent this.
      const result = validateQuery(
        "SELECT CreatedAt FROM monitor.Part",
        authorizedUsers,
      );
      expect(result.isValid).toBe(true);
    });
  });

  describe("Multiple Statements Guard", () => {
    it("should reject multiple statements separated by semicolons", () => {
      const result = validateQuery("SELECT 1; SELECT 2", authorizedUsers);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Multiple SQL statements are not allowed");
    });

    it("should allow a single statement with a trailing semicolon", () => {
      const result = validateQuery("SELECT 1;", authorizedUsers);
      expect(result.isValid).toBe(true);
    });

    it("should allow a single statement with trailing whitespace after semicolon", () => {
      const result = validateQuery("SELECT 1;   ", authorizedUsers);
      expect(result.isValid).toBe(true);
    });
  });

  describe("Authorized Owners Guard", () => {
    it("should allow access to authorized owners", () => {
      const queries = [
        "SELECT * FROM monitor.Part",
        "SELECT * FROM ExtensionsUser.Data",
        "SELECT * FROM dbo.Tables",
        'SELECT * FROM "monitor".Part',
        "SELECT * FROM MONitor.Part",
      ];
      for (const q of queries) {
        const result = validateQuery(q, authorizedUsers);
        expect(result.isValid, `Query failed: ${q}`).toBe(true);
      }
    });

    it("should reject access to unauthorized owners", () => {
      const queries = [
        "SELECT * FROM sys.sysuser",
        "SELECT * FROM secret.data",
        "SELECT * FROM monitor.Part JOIN other.table ON 1=1",
      ];
      for (const q of queries) {
        const result = validateQuery(q, authorizedUsers);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("is not authorized");
      }
    });

    it("should allow queries without explicit owners", () => {
      const result = validateQuery("SELECT * FROM Part", authorizedUsers);
      expect(result.isValid).toBe(true);
    });

    it("should reject system tables without explicit owners (implied sys)", () => {
      const result = validateQuery("SELECT * FROM SYSTABLE", authorizedUsers);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("sys (implied)");
    });

    it("should handle JOINs with owners", () => {
      const q =
        "SELECT * FROM monitor.Part JOIN dbo.Orders ON monitor.Part.id = dbo.Orders.part_id";
      const result = validateQuery(q, authorizedUsers);
      expect(result.isValid).toBe(true);
    });

    it("should reject if any owner in a JOIN is unauthorized", () => {
      const q =
        "SELECT * FROM monitor.Part JOIN sys.sysuser ON monitor.Part.id = sys.sysuser.id";
      const result = validateQuery(q, authorizedUsers);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("sys");
    });

    it("should reject unauthorized owners in comma-separated tables", () => {
      const q = "SELECT * FROM monitor.Part, sys.sysuser";
      const result = validateQuery(q, authorizedUsers);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("sys");
    });

    it("should handle mixed case and quotes for owners", () => {
      const result = validateQuery('SELECT * FROM "Dbo".Part', authorizedUsers);
      expect(result.isValid).toBe(true);
    });
  });
});
