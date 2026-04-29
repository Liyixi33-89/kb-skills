import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createOpenApiAdapter from "../src/index";

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

// 最小化的 OpenAPI 3.0 规范（JSON 格式，无需 yaml 解析器）
const minimalSpec = {
  openapi: "3.0.3",
  info: { title: "Test API", version: "1.0.0", description: "测试接口" },
  servers: [{ url: "http://localhost:3000", description: "本地开发" }],
  tags: [
    { name: "users", description: "用户管理" },
    { name: "auth", description: "认证" },
  ],
  paths: {
    "/api/users": {
      get: {
        operationId: "listUsers",
        summary: "获取用户列表",
        tags: ["users"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" }, description: "页码" },
          { name: "limit", in: "query", schema: { type: "integer" }, description: "每页数量" },
        ],
        responses: {
          "200": {
            description: "成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/User" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createUser",
        summary: "创建用户",
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserDto" },
            },
          },
        },
        responses: {
          "201": { description: "创建成功" },
          "400": { description: "参数错误" },
        },
      },
    },
    "/api/users/{id}": {
      get: {
        operationId: "getUserById",
        summary: "获取单个用户",
        tags: ["users"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "用户 ID" },
        ],
        responses: {
          "200": {
            description: "成功",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "404": { description: "用户不存在" },
        },
      },
      delete: {
        operationId: "deleteUser",
        summary: "删除用户",
        tags: ["users"],
        deprecated: true,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "删除成功" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        operationId: "login",
        summary: "用户登录",
        tags: ["auth"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginDto" },
            },
          },
        },
        responses: {
          "200": {
            description: "登录成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "401": { description: "认证失败" },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: "object",
        description: "用户实体",
        required: ["id", "name", "email"],
        properties: {
          id: { type: "string", description: "用户 ID" },
          name: { type: "string", description: "用户名" },
          email: { type: "string", format: "email", description: "邮箱" },
          role: { type: "string", enum: ["admin", "user"], description: "角色" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateUserDto: {
        type: "object",
        description: "创建用户请求体",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "user"], default: "user" },
        },
      },
      LoginDto: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};

describe("adapter-openapi", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-openapi-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  // ─── detect ──────────────────────────────────────────────────────────

  it("detect: 找到 openapi.json 时返回 true", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("detect: 找到 swagger.json 时返回 true", async () => {
    await writeJson(path.join(tmp, "swagger.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("detect: 找到 docs/openapi.json 时返回 true", async () => {
    await writeJson(path.join(tmp, "docs", "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("detect: 无规范文件时返回 false", async () => {
    const adapter = createOpenApiAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("detect: 手动指定 specFile 时优先使用", async () => {
    await writeJson(path.join(tmp, "custom-api.json"), minimalSpec);
    const adapter = createOpenApiAdapter({ specFile: "custom-api.json" });
    expect(await adapter.detect(tmp)).toBe(true);
  });

  // ─── scan: symbols ────────────────────────────────────────────────────

  it("scan: 正确解析路由 symbols（kind=route）", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    const mod = await adapter.scan(tmp);

    const routes = mod.symbols.filter((s) => s.kind === "route");
    // GET /api/users, POST /api/users, GET /api/users/{id}, DELETE /api/users/{id}, POST /api/auth/login
    expect(routes).toHaveLength(5);
    expect(routes.map((r) => r.name)).toContain("GET /api/users");
    expect(routes.map((r) => r.name)).toContain("POST /api/users");
    expect(routes.map((r) => r.name)).toContain("GET /api/users/{id}");
    expect(routes.map((r) => r.name)).toContain("DELETE /api/users/{id}");
    expect(routes.map((r) => r.name)).toContain("POST /api/auth/login");
  });

  it("scan: 正确解析 Schema symbols（kind=type）", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    const mod = await adapter.scan(tmp);

    const types = mod.symbols.filter((s) => s.kind === "type");
    expect(types).toHaveLength(3); // User, CreateUserDto, LoginDto
    expect(types.map((t) => t.name)).toContain("User");
    expect(types.map((t) => t.name)).toContain("CreateUserDto");
    expect(types.map((t) => t.name)).toContain("LoginDto");
  });

  it("scan: route symbol 包含正确的 extras 信息", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    const mod = await adapter.scan(tmp);

    const postUsers = mod.symbols.find((s) => s.name === "POST /api/users");
    expect(postUsers).toBeDefined();
    expect(postUsers!.extras?.operationId).toBe("createUser");
    expect(postUsers!.extras?.tags).toContain("users");
    expect(postUsers!.extras?.hasRequestBody).toBe(true);
    expect(postUsers!.extras?.responseStatuses).toContain("201");
  });

  it("scan: deprecated 接口在 extras 中标记", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    const mod = await adapter.scan(tmp);

    const deleteUser = mod.symbols.find((s) => s.name === "DELETE /api/users/{id}");
    expect(deleteUser!.extras?.deprecated).toBe(true);
  });

  it("scan: type symbol 包含 fieldCount 信息", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter();
    const mod = await adapter.scan(tmp);

    const userType = mod.symbols.find((s) => s.name === "User");
    expect(userType!.extras?.fieldCount).toBe(5); // id, name, email, role, createdAt
    expect(userType!.extras?.description).toBe("用户实体");
  });

  it("scan: ModuleInfo 基本属性正确", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const adapter = createOpenApiAdapter({ moduleName: "my-api" });
    const mod = await adapter.scan(tmp);

    expect(mod.name).toBe("my-api");
    expect(mod.kind).toBe("backend");
    expect(mod.root).toBe(tmp);
  });

  // ─── scan: KB 写入 ────────────────────────────────────────────────────

  it("scan: 指定 kbRoot 时自动写入 KB 文件", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const kbRoot = path.join(tmp, "kb");
    const adapter = createOpenApiAdapter({ kbRoot });
    await adapter.scan(tmp);

    const { access } = await import("node:fs/promises");
    // 验证 KB 文件已生成
    await expect(access(path.join(kbRoot, "openapi", "openapi", "00_overview.md"))).resolves.toBeUndefined();
    await expect(access(path.join(kbRoot, "openapi", "openapi", "01_index_paths.md"))).resolves.toBeUndefined();
    await expect(access(path.join(kbRoot, "openapi", "openapi", "components.md"))).resolves.toBeUndefined();
  });

  it("scan: KB 路径索引包含所有端点", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const kbRoot = path.join(tmp, "kb");
    const adapter = createOpenApiAdapter({ kbRoot });
    await adapter.scan(tmp);

    const { readFile: rf } = await import("node:fs/promises");
    const indexContent = await rf(
      path.join(kbRoot, "openapi", "openapi", "01_index_paths.md"),
      "utf8",
    );
    expect(indexContent).toContain("GET");
    expect(indexContent).toContain("/api/users");
    expect(indexContent).toContain("POST");
    expect(indexContent).toContain("/api/auth/login");
    expect(indexContent).toContain("获取用户列表"); // summary 字段
  });

  it("scan: KB 按 tag 生成 schema 文件", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const kbRoot = path.join(tmp, "kb");
    const adapter = createOpenApiAdapter({ kbRoot });
    await adapter.scan(tmp);

    const { access } = await import("node:fs/promises");
    await expect(
      access(path.join(kbRoot, "openapi", "openapi", "schemas", "users.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(kbRoot, "openapi", "openapi", "schemas", "auth.md")),
    ).resolves.toBeUndefined();
  });

  it("scan: KB schema 文件包含请求体字段表格", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const kbRoot = path.join(tmp, "kb");
    const adapter = createOpenApiAdapter({ kbRoot });
    await adapter.scan(tmp);

    const { readFile: rf } = await import("node:fs/promises");
    const usersSchema = await rf(
      path.join(kbRoot, "openapi", "openapi", "schemas", "users.md"),
      "utf8",
    );
    // 应包含 POST /api/users 的请求体字段
    expect(usersSchema).toContain("POST /api/users");
    expect(usersSchema).toContain("请求体");
  });

  it("scan: KB components.md 包含 Schema 定义", async () => {
    await writeJson(path.join(tmp, "openapi.json"), minimalSpec);
    const kbRoot = path.join(tmp, "kb");
    const adapter = createOpenApiAdapter({ kbRoot });
    await adapter.scan(tmp);

    const { readFile: rf } = await import("node:fs/promises");
    const components = await rf(
      path.join(kbRoot, "openapi", "openapi", "components.md"),
      "utf8",
    );
    expect(components).toContain("User");
    expect(components).toContain("CreateUserDto");
    expect(components).toContain("LoginDto");
    // 应包含字段表格
    expect(components).toContain("| 字段 | 类型 | 必填 | 说明 |");
  });

  // ─── scan: 错误处理 ───────────────────────────────────────────────────

  it("scan: 无规范文件时抛出有意义的错误", async () => {
    const adapter = createOpenApiAdapter();
    await expect(adapter.scan(tmp)).rejects.toThrow("未找到 OpenAPI 规范文件");
  });

  it("scan: 手动指定不存在的 specFile 时抛出错误", async () => {
    const adapter = createOpenApiAdapter({ specFile: "not-exist.json" });
    await expect(adapter.scan(tmp)).rejects.toThrow();
  });
});
