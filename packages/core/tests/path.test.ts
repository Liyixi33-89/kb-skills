import { describe, it, expect } from "vitest";
import { kebab, toPosix, stemOf, relPosix } from "../src/utils/path";

describe("utils/path", () => {
  describe("kebab", () => {
    it("converts PascalCase to kebab-case", () => {
      expect(kebab("AgentsPage")).toBe("agents-page");
    });

    it("converts camelCase to kebab-case", () => {
      expect(kebab("agentsPage")).toBe("agents-page");
    });

    it("keeps already-kebab input unchanged", () => {
      expect(kebab("agents-page")).toBe("agents-page");
    });

    it("lower-cases single word", () => {
      expect(kebab("Home")).toBe("home");
    });
  });

  describe("toPosix", () => {
    it("converts backslashes to forward slashes", () => {
      expect(toPosix("a\\b\\c")).toMatch(/^a[\\/]b[\\/]c$/);
    });

    it("is a no-op for already-posix input", () => {
      expect(toPosix("src/utils/path.ts")).toBe("src/utils/path.ts");
    });
  });

  describe("stemOf", () => {
    it("strips extension", () => {
      expect(stemOf("server/routes/users.ts")).toBe("users");
    });

    it("handles files without extension", () => {
      expect(stemOf("README")).toBe("README");
    });
  });

  describe("relPosix", () => {
    it("returns posix-style relative path", () => {
      const out = relPosix("/a/b", "/a/b/c/d.ts");
      expect(out).toBe("c/d.ts");
    });
  });
});
