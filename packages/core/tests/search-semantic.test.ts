/**
 * search-semantic.test.ts — 测试 TF-IDF 语义搜索核心逻辑
 *
 * 由于 search-semantic.ts 依赖 McpContext（kbRoot），
 * 这里通过临时目录模拟真实 KB 文件结构来测试。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { searchSemantic, invalidateSemanticIndex } from "../../mcp-server/src/tools/search-semantic";
import type { McpContext } from "../../mcp-server/src/context";

// ─── 测试用临时目录 ───────────────────────────────────────────────────────────

let tmpDir: string;
let mockCtx: McpContext;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `kb-semantic-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  mockCtx = {
    projectRoot: tmpDir,
    kbRoot: tmpDir,
    configFile: path.join(tmpDir, "kb-skills.config.ts"),
    modules: [],
    rawConfig: { modules: [] },
  };
});

afterEach(async () => {
  invalidateSemanticIndex(tmpDir);
  await rm(tmpDir, { recursive: true, force: true });
});

const writeKbFile = async (
  dir: string,
  relPath: string,
  content: string,
): Promise<void> => {
  const fullPath = path.join(dir, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
};

// ─── 测试用 KB 文件内容 ───────────────────────────────────────────────────────

const USER_SERVICE_KB = `---
symbol: UserService
kind: service
file: src/services/user.service.ts
module: server
dependencies: ["UserModel", "EmailService"]
calledBy: ["UserController"]
exports: ["createUser", "getUserById", "updateUser", "deleteUser"]
updatedAt: 2026-04-27T14:00:00.000Z
---
# UserService

## 概述

用户服务，处理用户注册、登录、权限验证等业务逻辑。

## 方法列表

- createUser：创建新用户
- getUserById：按 ID 查询用户
- updateUser：更新用户信息
- deleteUser：删除用户
`;

const ORDER_SERVICE_KB = `---
symbol: OrderService
kind: service
file: src/services/order.service.ts
module: server
dependencies: ["OrderModel", "UserService", "PaymentService"]
calledBy: ["OrderController"]
exports: ["createOrder", "getOrderById", "cancelOrder"]
updatedAt: 2026-04-27T14:00:00.000Z
---
# OrderService

## 概述

订单服务，处理订单创建、支付、取消等业务逻辑。

## 方法列表

- createOrder：创建订单
- getOrderById：查询订单详情
- cancelOrder：取消订单
`;

const AUTH_SERVICE_KB = `---
symbol: AuthService
kind: service
file: src/services/auth.service.ts
module: server
dependencies: ["UserService", "JwtService"]
calledBy: ["AuthController", "AuthMiddleware"]
exports: ["login", "logout", "verifyToken", "refreshToken"]
updatedAt: 2026-04-27T14:00:00.000Z
---
# AuthService

## 概述

认证服务，处理用户登录、JWT Token 生成与验证、权限校验。

## 方法列表

- login：用户登录，返回 JWT Token
- logout：用户登出，清除 Token
- verifyToken：验证 JWT Token 有效性
- refreshToken：刷新 Token
`;

const USER_PAGE_KB = `---
symbol: UserListPage
kind: page
file: src/pages/UserList.tsx
module: frontend
dependencies: ["UserService", "useUserStore"]
calledBy: []
exports: ["UserListPage"]
updatedAt: 2026-04-27T14:00:00.000Z
---
# UserListPage

## 概述

用户列表页面，展示所有用户信息，支持搜索、分页、批量操作。

## 状态

- users：用户列表数据
- loading：加载状态
- pagination：分页信息
`;

// ─── 测试用例 ─────────────────────────────────────────────────────────────────

describe("searchSemantic — TF-IDF 语义搜索", () => {
  beforeEach(async () => {
    // 写入测试 KB 文件
    await writeKbFile(tmpDir, "server/services/user-service.md", USER_SERVICE_KB);
    await writeKbFile(tmpDir, "server/services/order-service.md", ORDER_SERVICE_KB);
    await writeKbFile(tmpDir, "server/services/auth-service.md", AUTH_SERVICE_KB);
    await writeKbFile(tmpDir, "frontend/pages/user-list.md", USER_PAGE_KB);
  });

  it("应返回结果并包含 indexedFiles 数量", async () => {
    const result = await searchSemantic(mockCtx, { query: "用户服务" });
    expect(result.indexedFiles).toBe(4);
    expect(result.query).toBe("用户服务");
  });

  it("查询「用户登录」应优先返回 AuthService", async () => {
    const result = await searchSemantic(mockCtx, { query: "用户登录 JWT Token 认证" });
    expect(result.results.length).toBeGreaterThan(0);
    // AuthService 应在前两名
    const topTitles = result.results.slice(0, 2).map((r) => r.title);
    expect(topTitles.some((t) => t.includes("Auth"))).toBe(true);
  });

  it("查询「订单支付」应优先返回 OrderService", async () => {
    const result = await searchSemantic(mockCtx, { query: "订单支付取消" });
    expect(result.results.length).toBeGreaterThan(0);
    const topTitle = result.results[0]!.title;
    expect(topTitle).toContain("Order");
  });

  it("topK 参数应限制返回数量", async () => {
    const result = await searchSemantic(mockCtx, { query: "服务", topK: 2 });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it("module 过滤应只返回指定模块的结果", async () => {
    const result = await searchSemantic(mockCtx, { query: "用户", module: "frontend" });
    for (const item of result.results) {
      expect(item.module).toBe("frontend");
    }
  });

  it("结果应包含 score、summary、relativePath 字段", async () => {
    const result = await searchSemantic(mockCtx, { query: "用户服务" });
    if (result.results.length > 0) {
      const first = result.results[0]!;
      expect(typeof first.score).toBe("number");
      expect(first.score).toBeGreaterThan(0);
      expect(first.score).toBeLessThanOrEqual(1);
      expect(typeof first.summary).toBe("string");
      expect(first.summary.length).toBeGreaterThan(0);
      expect(typeof first.relativePath).toBe("string");
    }
  });

  it("有 Front Matter 的文件应解析出 meta 字段", async () => {
    const result = await searchSemantic(mockCtx, { query: "UserService 用户" });
    const withMeta = result.results.find((r) => r.meta !== undefined);
    expect(withMeta).toBeDefined();
    expect(withMeta!.meta!.symbol).toBeTruthy();
    expect(withMeta!.meta!.kind).toBeTruthy();
    expect(Array.isArray(withMeta!.meta!.dependencies)).toBe(true);
  });

  it("无匹配结果时应返回空数组", async () => {
    const result = await searchSemantic(mockCtx, { query: "xyzabc123notexist" });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("kbRoot 不存在时应返回空结果", async () => {
    const emptyCtx = { ...mockCtx, kbRoot: "/nonexistent/path/xyz" };
    const result = await searchSemantic(emptyCtx, { query: "用户" });
    expect(result.results).toEqual([]);
    expect(result.indexedFiles).toBe(0);
  });

  it("invalidateSemanticIndex 应清除缓存，下次重建索引", async () => {
    // 第一次查询，建立索引
    const r1 = await searchSemantic(mockCtx, { query: "用户" });
    expect(r1.indexedFiles).toBe(4);

    // 清除缓存
    invalidateSemanticIndex(tmpDir);

    // 新增一个文件
    await writeKbFile(tmpDir, "server/services/payment-service.md", `# PaymentService\n\n支付服务`);

    // 再次查询，应重建索引并包含新文件
    const r2 = await searchSemantic(mockCtx, { query: "支付" });
    expect(r2.indexedFiles).toBe(5);
  });
});
