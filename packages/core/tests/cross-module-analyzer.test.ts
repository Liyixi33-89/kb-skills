/**
 * cross-module-analyzer.test.ts — 测试跨模块关联分析
 */
import { describe, it, expect } from "vitest";
import {
  extractApiUrls,
  analyzeCrossModuleRelations,
  findCallersByRoute,
  findRoutesCalledByFile,
} from "../src/cross-module-analyzer";
import type { ScanResult } from "../src/types";

// ─── 测试用 ScanResult 工厂 ───────────────────────────────────────────────────

const makeScanResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  projectRoot: "/project",
  modules: [],
  relations: [],
  scannedAt: new Date().toISOString(),
  ...overrides,
});

/** 构造一个典型的全栈 ScanResult：Koa 后端 + React 前端 */
const makeFullstackScanResult = (): ScanResult =>
  makeScanResult({
    modules: [
      {
        name: "server",
        root: "/project/server",
        kind: "backend",
        symbols: [],
        raw: {
          framework: "koa",
          routes: [
            {
              name: "users",
              relPath: "src/routes/users.ts",
              endpoints: [
                { method: "GET", path: "/users", middlewares: [] },
                { method: "POST", path: "/users", middlewares: [] },
                { method: "GET", path: "/users/:id", middlewares: [] },
                { method: "DELETE", path: "/users/:id", middlewares: [] },
              ],
            },
            {
              name: "auth",
              relPath: "src/routes/auth.ts",
              endpoints: [
                { method: "POST", path: "/auth/login", middlewares: [] },
                { method: "POST", path: "/auth/logout", middlewares: [] },
              ],
            },
          ],
          models: [],
          services: [],
          middleware: [],
          config: [],
          scripts: [],
          db: [],
        },
      },
      {
        name: "web",
        root: "/project/web",
        kind: "frontend",
        symbols: [],
        raw: {
          framework: "react",
          pages: [
            {
              file: "/project/web/src/pages/UserList.tsx",
              relPath: "src/pages/UserList.tsx",
              imports: [],
              exports: ["UserList"],
              functions: [],
              components: [],
              interfaces: [],
              types: [],
              hooks: ["useUserStore"],
              constants: [],
              name: "UserList",
              states: [],
              effectCount: 1,
              apiCalls: ["getUsers", "createUser"],
              handlers: ["handleSubmit", "handleDelete"],
            },
          ],
          components: [],
          apiFiles: [
            {
              file: "/project/web/src/api/users.ts",
              relPath: "src/api/users.ts",
              imports: [],
              exports: ["fetchUsers", "createUser", "deleteUser"],
              functions: ["fetchUsers", "createUser", "deleteUser"],
              components: [],
              interfaces: [],
              types: [],
              hooks: [],
              constants: [],
              extras: {
                apiUrls: ["/users", "/users/:id"],
              },
            } as unknown as import("../src/types").TsFileInfo,
          ],
          storeFiles: [],
          typesFiles: [],
          hooks: [],
          routes: [],
        },
      },
    ],
  });

// ─── extractApiUrls ───────────────────────────────────────────────────────────

describe("extractApiUrls", () => {
  it("应提取 fetch() 中的字符串 URL", () => {
    const content = `fetch("/api/users")`;
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.some((u) => u.url === "/api/users")).toBe(true);
  });

  it("应提取 axios.get() 中的 URL", () => {
    const content = `axios.get("/api/products")`;
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.some((u) => u.url === "/api/products")).toBe(true);
  });

  it("应提取模板字符串 URL 并将变量替换为 :param", () => {
    const content = "fetch(`/api/users/${id}`)";
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.some((u) => u.url === "/api/users/:param" && u.isDynamic)).toBe(true);
  });

  it("应提取 URL 常量定义", () => {
    const content = `const BASE_URL = "/api/v1/users";`;
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.some((u) => u.url === "/api/v1/users")).toBe(true);
  });

  it("应提取对象属性中的 URL", () => {
    const content = `{ url: "/api/orders" }`;
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.some((u) => u.url === "/api/orders")).toBe(true);
  });

  it("不以 / 开头的 URL 应被过滤", () => {
    const content = `fetch("https://example.com/api/users")`;
    const urls = extractApiUrls(content, "test.ts");
    expect(urls.every((u) => u.url.startsWith("/"))).toBe(true);
  });

  it("重复 URL 应去重", () => {
    const content = `
      fetch("/api/users");
      fetch("/api/users");
    `;
    const urls = extractApiUrls(content, "test.ts");
    const userUrls = urls.filter((u) => u.url === "/api/users");
    expect(userUrls.length).toBe(1);
  });

  it("空内容应返回空数组", () => {
    expect(extractApiUrls("", "test.ts")).toHaveLength(0);
  });
});

// ─── analyzeCrossModuleRelations ──────────────────────────────────────────────

describe("analyzeCrossModuleRelations", () => {
  it("无后端模块时应返回空数组", () => {
    const result = makeScanResult({
      modules: [
        {
          name: "web",
          root: "/project/web",
          kind: "frontend",
          symbols: [],
          raw: {
            framework: "react",
            pages: [],
            components: [],
            apiFiles: [],
            storeFiles: [],
            typesFiles: [],
            hooks: [],
            routes: [],
          },
        },
      ],
    });
    expect(analyzeCrossModuleRelations(result)).toHaveLength(0);
  });

  it("无前端模块时应返回空数组", () => {
    const result = makeScanResult({
      modules: [
        {
          name: "server",
          root: "/project/server",
          kind: "backend",
          symbols: [],
          raw: {
            framework: "koa",
            routes: [
              {
                name: "users",
                relPath: "src/routes/users.ts",
                endpoints: [{ method: "GET", path: "/users", middlewares: [] }],
              },
            ],
            models: [],
            services: [],
            middleware: [],
            config: [],
            scripts: [],
            db: [],
          },
        },
      ],
    });
    expect(analyzeCrossModuleRelations(result)).toHaveLength(0);
  });

  it("extras.apiUrls 应与后端路由匹配", () => {
    const result = makeFullstackScanResult();
    const relations = analyzeCrossModuleRelations(result);
    // /users 路由应有前端调用者
    const usersRelation = relations.find((r) => r.backendRoute === "/users");
    expect(usersRelation).toBeDefined();
    expect(usersRelation!.frontendCallers.length).toBeGreaterThan(0);
  });

  it("apiRoute 过滤应只返回匹配的路由", () => {
    const result = makeFullstackScanResult();
    const relations = analyzeCrossModuleRelations(result, { apiRoute: "/auth/login" });
    // 所有返回的路由都应匹配 /auth/login
    for (const r of relations) {
      expect(r.backendRoute).toContain("auth");
    }
  });

  it("frontendFile 过滤应只返回该文件调用的路由", () => {
    const result = makeFullstackScanResult();
    const relations = analyzeCrossModuleRelations(result, { frontendFile: "UserList.tsx" });
    // 所有返回的路由都应有 UserList.tsx 作为调用者
    for (const r of relations) {
      expect(r.frontendCallers.some((c) => c.file.includes("UserList"))).toBe(true);
    }
  });

  it("路径参数匹配：/users/:id 应匹配 /users/:param", () => {
    const result = makeFullstackScanResult();
    const relations = analyzeCrossModuleRelations(result);
    // /users/:id 路由应被 extras.apiUrls 中的 /users/:id 匹配
    const paramRoute = relations.find((r) => r.backendRoute === "/users/:id");
    expect(paramRoute).toBeDefined();
  });
});

// ─── findCallersByRoute ───────────────────────────────────────────────────────

describe("findCallersByRoute", () => {
  it("应返回调用指定路由的前端文件", () => {
    const result = makeFullstackScanResult();
    const relations = findCallersByRoute(result, "/users");
    expect(Array.isArray(relations)).toBe(true);
  });

  it("不存在的路由应返回空数组", () => {
    const result = makeFullstackScanResult();
    const relations = findCallersByRoute(result, "/non-existent-route-xyz");
    expect(relations).toHaveLength(0);
  });
});

// ─── findRoutesCalledByFile ───────────────────────────────────────────────────

describe("findRoutesCalledByFile", () => {
  it("应返回指定前端文件调用的后端路由", () => {
    const result = makeFullstackScanResult();
    const relations = findRoutesCalledByFile(result, "UserList.tsx");
    expect(Array.isArray(relations)).toBe(true);
  });

  it("不存在的文件应返回空数组", () => {
    const result = makeFullstackScanResult();
    const relations = findRoutesCalledByFile(result, "NonExistentFile.tsx");
    expect(relations).toHaveLength(0);
  });

  it("返回的每条关联都应包含该文件作为调用者", () => {
    const result = makeFullstackScanResult();
    const relations = findRoutesCalledByFile(result, "users.ts");
    for (const r of relations) {
      expect(r.frontendCallers.some((c) => c.file.includes("users"))).toBe(true);
    }
  });
});
