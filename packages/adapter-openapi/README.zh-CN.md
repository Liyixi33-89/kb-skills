# @kb-skills/adapter-openapi

[kb-skills](https://github.com/your-org/kb-skills) 的 OpenAPI / Swagger 规范适配器。

解析 `openapi.json` / `swagger.yaml`，将完整的接口契约（请求体、响应体、参数、Schema 组件）注入 KB，让 AI 精确知道每个接口的入参和出参结构。

## 安装

```bash
npm install @kb-skills/adapter-openapi
# 或
pnpm add @kb-skills/adapter-openapi
```

## 使用

### 基础用法 — 自动检测规范文件

```typescript
import createOpenApiAdapter from "@kb-skills/adapter-openapi";

const adapter = createOpenApiAdapter();

// 自动在项目根目录查找 openapi.json / swagger.yaml
const mod = await adapter.scan("/path/to/project");

console.log(mod.symbols.filter(s => s.kind === "route"));
// [
//   { kind: "route", name: "GET /api/users", framework: "openapi", ... },
//   { kind: "route", name: "POST /api/users", framework: "openapi", ... },
//   ...
// ]
```

### 写入 KB 文件

```typescript
import createOpenApiAdapter from "@kb-skills/adapter-openapi";

const adapter = createOpenApiAdapter({
  kbRoot: "./kb",        // 写入 ./kb/openapi/openapi/ 目录
  moduleName: "my-api",  // 自定义模块名
});

await adapter.scan("/path/to/project");
// 生成文件：
//   kb/openapi/my-api/00_overview.md
//   kb/openapi/my-api/01_index_paths.md
//   kb/openapi/my-api/schemas/users.md
//   kb/openapi/my-api/schemas/auth.md
//   kb/openapi/my-api/components.md
```

### 手动指定规范文件路径

```typescript
const adapter = createOpenApiAdapter({
  specFile: "docs/api-spec.yaml",  // 相对于项目根目录
  kbRoot: "./kb",
});
```

## 自动检测的文件名

适配器按以下顺序查找规范文件：

| 路径 | 格式 |
|------|------|
| `openapi.json` | JSON |
| `openapi.yaml` / `openapi.yml` | YAML |
| `swagger.json` | JSON |
| `swagger.yaml` / `swagger.yml` | YAML |
| `api/openapi.json` | JSON |
| `docs/openapi.yaml` | YAML |
| `src/openapi.json` | JSON |

## YAML 支持

YAML 解析使用项目中已安装的 `js-yaml` 或 `yaml` 包。JSON 格式无需额外依赖。

```bash
# 可选：安装 YAML 解析器
pnpm add -D js-yaml
# 或
pnpm add -D yaml
```

## 生成的 KB 结构

```
kb/openapi/<moduleName>/
├── 00_overview.md        # API 标题、版本、服务地址、统计
├── 01_index_paths.md     # 全量端点索引表
├── schemas/
│   ├── users.md          # 按 tag 分组的接口契约详情
│   └── auth.md
└── components.md         # Schema 组件定义
```

每个 schema 文件包含：
- 接口摘要、operationId、鉴权要求
- 参数表格（path / query / header）
- 请求体字段表格
- 各状态码的响应体字段表格

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `specFile` | `string` | 自动检测 | 规范文件路径（相对或绝对） |
| `moduleName` | `string` | `"openapi"` | 模块名，用于 KB 目录命名 |
| `kbRoot` | `string` | — | 设置后自动写入 KB 文件 |

## 与 kb-skills Skill 工作流的联动

扫描后，KB 文件被 `get_route_detail` 和 `find_cross_module_relations` 读取，使 `api-diff` Skill 能够对比 OpenAPI 契约与前端调用点：

```
OpenAPI 规范 → adapter-openapi → KB 文件
                                    ↓
                          get_route_detail（完整契约）
                                    ↓
                          api-diff Skill（前端同步方案）
```

## 典型场景

**后端改了 `/api/users` 的响应结构**：

1. 更新 `openapi.json`
2. 重新运行 `adapter-openapi` 扫描
3. `api-diff` Skill 自动对比新旧契约，生成前端需要同步修改的清单
