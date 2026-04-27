/**
 * dependency-graph.test.ts — 测试符号依赖图谱
 */
import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  queryDependencyGraph,
} from "../src/dependency-graph";
import type { ScanResult } from "../src/types";

// ─── 测试用 ScanResult 工厂 ───────────────────────────────────────────────────

const makeScanResult = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  projectRoot: "/project",
  modules: [],
  relations: [],
  scannedAt: new Date().toISOString(),
  ...overrides,
});

/** 构造一个典型的 Koa 后端 ScanResult：UserModel ← UserService ← UserController */
const makeKoaScanResult = (): ScanResult =>
  makeScanResult({
    modules: [
      {
        name: "server",
        root: "/project/server",
        kind: "backend",
        symbols: [
          { kind: "model", name: "UserModel", file: "src/models/user.ts", exported: true, framework: "koa" },
          { kind: "service", name: "UserService", file: "src/services/user.ts", exported: true, framework: "koa" },
          { kind: "route", name: "UserController", file: "src/routes/users.ts", exported: true, framework: "koa" },
          { kind: "service", name: "AuthService", file: "src/services/auth.ts", exported: true, framework: "koa" },
        ],
        raw: {
          framework: "koa",
          routes: [],
          models: [],
          services: [
            {
              name: "UserService",
              relPath: "src/services/user.ts",
              exports: ["findAll", "create"],
              dependencies: { models: ["UserModel"], services: [], external: [] },
            },
            {
              name: "AuthService",
              relPath: "src/services/auth.ts",
              exports: ["login"],
              dependencies: { models: ["UserModel"], services: ["UserService"], external: [] },
            },
          ],
          middleware: [],
          config: [],
          scripts: [],
          db: [],
        },
      },
    ],
    relations: [
      { from: "UserController", to: "UserService", kind: "calls" },
      { from: "UserController", to: "AuthService", kind: "calls" },
    ],
  });

// ─── buildDependencyGraph ─────────────────────────────────────────────────────

describe("buildDependencyGraph", () => {
  it("空 ScanResult 应返回空图", () => {
    const graph = buildDependencyGraph(makeScanResult());
    expect(graph.size).toBe(0);
  });

  it("应从 symbols 注册所有节点", () => {
    const graph = buildDependencyGraph(makeKoaScanResult());
    expect(graph.has("UserModel")).toBe(true);
    expect(graph.has("UserService")).toBe(true);
    expect(graph.has("UserController")).toBe(true);
    expect(graph.has("AuthService")).toBe(true);
  });

  it("应从 raw.services.dependencies 构建下游边", () => {
    const graph = buildDependencyGraph(makeKoaScanResult());
    const userService = graph.get("UserService")!;
    expect(userService.downstreamEdges.has("UserModel")).toBe(true);
  });

  it("应从 raw.services.dependencies 构建上游边（反向）", () => {
    const graph = buildDependencyGraph(makeKoaScanResult());
    const userModel = graph.get("UserModel")!;
    expect(userModel.upstreamEdges.has("UserService")).toBe(true);
    expect(userModel.upstreamEdges.has("AuthService")).toBe(true);
  });

  it("应从 relations 注册边", () => {
    const graph = buildDependencyGraph(makeKoaScanResult());
    const controller = graph.get("UserController")!;
    expect(controller.downstreamEdges.has("UserService")).toBe(true);
    expect(controller.downstreamEdges.has("AuthService")).toBe(true);
  });

  it("relations 中未在 symbols 注册的符号应自动创建节点", () => {
    const result = makeScanResult({
      relations: [{ from: "A", to: "B", kind: "calls" }],
    });
    const graph = buildDependencyGraph(result);
    expect(graph.has("A")).toBe(true);
    expect(graph.has("B")).toBe(true);
  });
});

// ─── queryDependencyGraph — tree 格式 ────────────────────────────────────────

describe("queryDependencyGraph — tree 格式", () => {
  it("应返回目标符号的基本信息", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", { format: "tree" });
    expect(result).not.toBeNull();
    expect(result!.target.symbol).toBe("UserService");
    expect(result!.target.kind).toBe("service");
  });

  it("大小写不敏感匹配", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "userservice", { format: "tree" });
    expect(result).not.toBeNull();
    expect(result!.target.symbol).toBe("UserService");
  });

  it("downstream 方向应包含 UserModel 作为 children", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "tree",
      direction: "downstream",
      depth: 1,
    });
    expect(result!.tree!.children.some((c) => c.symbol === "UserModel")).toBe(true);
    expect(result!.tree!.parents).toHaveLength(0);
  });

  it("upstream 方向应包含 UserController 作为 parents", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "tree",
      direction: "upstream",
      depth: 1,
    });
    expect(result!.tree!.parents.some((p) => p.symbol === "UserController")).toBe(true);
    expect(result!.tree!.children).toHaveLength(0);
  });

  it("both 方向应同时包含 children 和 parents", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "tree",
      direction: "both",
      depth: 1,
    });
    expect(result!.tree!.children.length).toBeGreaterThan(0);
    expect(result!.tree!.parents.length).toBeGreaterThan(0);
  });

  it("depth=0 时 children 和 parents 应为空", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "tree",
      direction: "both",
      depth: 0,
    });
    expect(result!.tree!.children).toHaveLength(0);
    expect(result!.tree!.parents).toHaveLength(0);
  });

  it("应防止循环引用导致无限递归", () => {
    // A → B → A 循环
    const result = makeScanResult({
      relations: [
        { from: "A", to: "B", kind: "calls" },
        { from: "B", to: "A", kind: "calls" },
      ],
    });
    expect(() =>
      queryDependencyGraph(result, "A", { format: "tree", depth: 5 })
    ).not.toThrow();
  });
});

// ─── queryDependencyGraph — flat 格式 ────────────────────────────────────────

describe("queryDependencyGraph — flat 格式", () => {
  it("应返回扁平列表，包含 direction 和 depth 字段", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "flat",
      direction: "both",
      depth: 2,
    });
    expect(result!.flat).toBeDefined();
    expect(Array.isArray(result!.flat)).toBe(true);

    const downstream = result!.flat!.filter((i) => i.direction === "downstream");
    const upstream = result!.flat!.filter((i) => i.direction === "upstream");
    expect(downstream.length).toBeGreaterThan(0);
    expect(upstream.length).toBeGreaterThan(0);
  });

  it("flat 列表应按 depth 升序排列", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserController", {
      format: "flat",
      direction: "downstream",
      depth: 3,
    });
    const depths = result!.flat!.map((i) => i.depth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]!).toBeGreaterThanOrEqual(depths[i - 1]!);
    }
  });

  it("stats 应正确统计上下游数量", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "flat",
      direction: "both",
      depth: 2,
    });
    expect(result!.stats.downstreamCount).toBeGreaterThan(0);
    expect(result!.stats.upstreamCount).toBeGreaterThan(0);
    expect(result!.stats.totalNodes).toBe(
      result!.stats.downstreamCount + result!.stats.upstreamCount,
    );
  });
});

// ─── queryDependencyGraph — mermaid 格式 ─────────────────────────────────────

describe("queryDependencyGraph — mermaid 格式", () => {
  it("应返回以 'graph TD' 开头的 Mermaid 语法", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "mermaid",
      direction: "both",
      depth: 2,
    });
    expect(result!.mermaid).toBeDefined();
    expect(result!.mermaid!.startsWith("graph TD")).toBe(true);
  });

  it("应包含目标节点的高亮样式", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "mermaid",
    });
    expect(result!.mermaid!).toContain("style UserService");
    expect(result!.mermaid!).toContain("fill:#f96");
  });

  it("应包含边的连接语法 -->", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "UserService", {
      format: "mermaid",
      direction: "downstream",
      depth: 1,
    });
    expect(result!.mermaid!).toContain("-->");
  });

  it("符号名中的特殊字符应被转义为下划线", () => {
    const result = makeScanResult({
      relations: [{ from: "my-service", to: "my-model", kind: "calls" }],
    });
    const graph = queryDependencyGraph(result, "my-service", { format: "mermaid" });
    // 特殊字符 - 应被替换为 _
    expect(graph!.mermaid!).toContain("my_service");
    expect(graph!.mermaid!).toContain("my_model");
  });
});

// ─── 边界情况 ─────────────────────────────────────────────────────────────────

describe("queryDependencyGraph — 边界情况", () => {
  it("不存在的符号应返回 found=false 的结果（非 null）", () => {
    const result = queryDependencyGraph(makeKoaScanResult(), "NonExistentSymbol", {
      format: "flat",
    });
    // queryDependencyGraph 总是返回结果（即使符号不在图中）
    expect(result).not.toBeNull();
    expect(result!.stats.totalNodes).toBe(0);
  });

  it("孤立节点（无依赖无调用者）应返回空 stats", () => {
    const result = makeScanResult({
      modules: [
        {
          name: "server",
          root: "/project",
          kind: "backend",
          symbols: [
            { kind: "config", name: "AppConfig", file: "src/config.ts", exported: true, framework: "koa" },
          ],
        },
      ],
    });
    const graph = queryDependencyGraph(result, "AppConfig", { format: "flat" });
    expect(graph!.stats.totalNodes).toBe(0);
    expect(graph!.flat).toHaveLength(0);
  });
});
