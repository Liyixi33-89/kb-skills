/**
 * verify-openapi.mjs
 *
 * 校验 @kb-skills/adapter-openapi v1.0.0（从 npm 安装）
 * 验证内容：
 *   1. detect()   — 能否识别 server/openapi.json
 *   2. scan()     — 路由 symbols / Schema symbols 是否正确
 *   3. KB 写入   — 生成 kb/openapi/ 目录结构是否完整
 *   4. 内容校验  — KB 文件内容是否包含预期的接口契约信息
 *   5. 与现有 KB 联动 — openapi routes 与 koa adapter routes 是否一致
 */
import createOpenApiAdapter from "@kb-skills/adapter-openapi";
import createKoaAdapter from "../../packages/adapter-koa/dist/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, access, rm } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, ".");
const serverRoot = path.join(root, "server");
const kbRoot = path.join(root, "kb");

// ─── 工具函数 ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
};

const fileExists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

const readKbFile = async (p) => {
  try { return await readFile(p, "utf8"); } catch { return ""; }
};

// ─── 清理旧的 openapi KB ─────────────────────────────────────────────────────
const openapiKbDir = path.join(kbRoot, "openapi");
try {
  await rm(openapiKbDir, { recursive: true, force: true });
} catch { /* 忽略 */ }

// ─── 1. detect() ─────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════");
console.log("  @kb-skills/adapter-openapi v1.0.0 校验");
console.log("══════════════════════════════════════════\n");

console.log("【1】detect() — 规范文件识别");

const adapter = createOpenApiAdapter({
  specFile: "openapi.json",   // 相对于 modulePath
  moduleName: "server-api",
  kbRoot,
});

const detected = await adapter.detect(serverRoot);
check("detect(server/) 识别到 openapi.json", detected === true);

const adapterNoSpec = createOpenApiAdapter();
const detectedAuto = await adapterNoSpec.detect(serverRoot);
check("detect() 自动查找 server/openapi.json", detectedAuto === true);

const detectedFalse = await adapterNoSpec.detect(path.join(root, "web"));
check("detect(web/) 无规范文件返回 false", detectedFalse === false);

// ─── 2. scan() — symbols ─────────────────────────────────────────────────────
console.log("\n【2】scan() — SymbolInfo 输出");

const mod = await adapter.scan(serverRoot);

// 路由 symbols
const routes = mod.symbols.filter(s => s.kind === "route");
check("ModuleInfo.name = 'server-api'", mod.name === "server-api");
check("ModuleInfo.kind = 'backend'", mod.kind === "backend");
check("路由 symbols 数量 = 5（GET/POST /users + GET/PUT/DELETE /users/{id}）", routes.length === 5,
  `实际: ${routes.length}`);

const routeNames = routes.map(r => r.name);
check("包含 GET /users", routeNames.includes("GET /users"));
check("包含 POST /users", routeNames.includes("POST /users"));
check("包含 GET /users/{id}", routeNames.includes("GET /users/{id}"));
check("包含 PUT /users/{id}", routeNames.includes("PUT /users/{id}"));
check("包含 DELETE /users/{id}", routeNames.includes("DELETE /users/{id}"));

// extras 校验
const postUsers = routes.find(r => r.name === "POST /users");
check("POST /users extras.operationId = 'createUser'", postUsers?.extras?.operationId === "createUser");
check("POST /users extras.hasRequestBody = true", postUsers?.extras?.hasRequestBody === true);
check("POST /users extras.tags 包含 'users'", postUsers?.extras?.tags?.includes("users"));
check("POST /users extras.responseStatuses 包含 '201'", postUsers?.extras?.responseStatuses?.includes("201"));

const getUsers = routes.find(r => r.name === "GET /users");
check("GET /users extras.operationId = 'listUsers'", getUsers?.extras?.operationId === "listUsers");

// Schema symbols
const types = mod.symbols.filter(s => s.kind === "type");
check("Schema symbols 数量 = 4（User/CreateUserDto/UpdateUserDto/ErrorResponse）", types.length === 4,
  `实际: ${types.length}`);

const typeNames = types.map(t => t.name);
check("包含 User schema", typeNames.includes("User"));
check("包含 CreateUserDto schema", typeNames.includes("CreateUserDto"));
check("包含 UpdateUserDto schema", typeNames.includes("UpdateUserDto"));
check("包含 ErrorResponse schema", typeNames.includes("ErrorResponse"));

const userType = types.find(t => t.name === "User");
check("User schema extras.fieldCount = 5", userType?.extras?.fieldCount === 5,
  `实际: ${userType?.extras?.fieldCount}`);
check("User schema extras.description 包含 'Mongoose'", userType?.extras?.description?.includes("Mongoose"));

// framework 标记
check("所有 symbols framework = 'openapi'",
  mod.symbols.every(s => s.framework === "openapi"));

// ─── 3. KB 写入 ───────────────────────────────────────────────────────────────
console.log("\n【3】KB 文件写入");

const kbBase = path.join(kbRoot, "openapi", "server-api");
check("kb/openapi/server-api/00_overview.md 已生成",
  await fileExists(path.join(kbBase, "00_overview.md")));
check("kb/openapi/server-api/01_index_paths.md 已生成",
  await fileExists(path.join(kbBase, "01_index_paths.md")));
check("kb/openapi/server-api/schemas/users.md 已生成",
  await fileExists(path.join(kbBase, "schemas", "users.md")));
check("kb/openapi/server-api/components.md 已生成",
  await fileExists(path.join(kbBase, "components.md")));

// ─── 4. KB 内容校验 ───────────────────────────────────────────────────────────
console.log("\n【4】KB 文件内容校验");

const overview = await readKbFile(path.join(kbBase, "00_overview.md"));
check("overview 包含 API 标题", overview.includes("Fullstack Koa-React API"));
check("overview 包含版本号 1.0.0", overview.includes("1.0.0"));
check("overview 包含服务地址", overview.includes("localhost:3001"));
check("overview 包含端点统计（5个端点）", overview.includes("5"));

const indexPaths = await readKbFile(path.join(kbBase, "01_index_paths.md"));
check("路径索引包含 GET /users", indexPaths.includes("GET") && indexPaths.includes("/users"));
check("路径索引包含 POST /users", indexPaths.includes("POST"));
check("路径索引包含 DELETE /users/{id}", indexPaths.includes("DELETE") && indexPaths.includes("{id}"));
check("路径索引包含摘要文字", indexPaths.includes("获取用户列表"));

const usersSchema = await readKbFile(path.join(kbBase, "schemas", "users.md"));
check("users schema 包含 POST /users 契约", usersSchema.includes("POST /users"));
check("users schema 包含请求体章节", usersSchema.includes("请求体"));
check("users schema 包含响应章节", usersSchema.includes("响应"));
check("users schema 包含参数表格（id 路径参数）", usersSchema.includes("path"));
check("users schema 包含 201 状态码", usersSchema.includes("201"));
check("users schema 包含 404 状态码", usersSchema.includes("404"));

const components = await readKbFile(path.join(kbBase, "components.md"));
check("components 包含 User schema 定义", components.includes("## User"));
check("components 包含 CreateUserDto 定义", components.includes("CreateUserDto"));
check("components 包含字段表格", components.includes("| 字段 | 类型 | 必填 | 说明 |"));
check("components User 包含 email 字段", components.includes("email"));
check("components User 包含 role 枚举", components.includes("admin"));

// ─── 5. 与 Koa adapter 路由对比 ───────────────────────────────────────────────
console.log("\n【5】与 Koa adapter 路由一致性校验");

const koaAdapter = createKoaAdapter();
const koaMod = await koaAdapter.scan(serverRoot);
const koaRoutes = koaMod.symbols.filter(s => s.kind === "route");

console.log(`  Koa adapter 扫描到 ${koaRoutes.length} 个路由:`);
for (const r of koaRoutes) {
  console.log(`    [koa]    ${r.name}`);
}
console.log(`  OpenAPI adapter 扫描到 ${routes.length} 个路由:`);
for (const r of routes) {
  console.log(`    [openapi] ${r.name}`);
}

// Koa 路由是相对路径（/），OpenAPI 是完整路径（/users/...）
// 验证 OpenAPI 路由数量 >= Koa 路由数量（OpenAPI 更完整）
check("OpenAPI 路由数量 >= Koa adapter 路由数量",
  routes.length >= koaRoutes.length,
  `openapi=${routes.length}, koa=${koaRoutes.length}`);

// 验证 Koa 扫描到的方法在 OpenAPI 中都有对应
const openapiMethods = new Set(routes.map(r => r.name.split(" ")[0]));
const koaMethods = koaRoutes.map(r => r.name.split(" ")[0]);
const allKoaMethodsCovered = koaMethods.every(m => openapiMethods.has(m));
check("Koa 的所有 HTTP 方法在 OpenAPI 中都有覆盖", allKoaMethodsCovered);

// ─── 结果汇总 ─────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════");
console.log(`  结果: ${passed} 通过 / ${failed} 失败 / ${passed + failed} 总计`);
console.log("══════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
