# @kb-skills/mcp-server

> 将 kb-skills 知识库通过 **MCP（Model Context Protocol）** 协议暴露给 AI 编码助手。  
> 支持 **Cursor / Claude Desktop / Windsurf / Copilot Chat** 等任意 MCP 兼容工具。

[![npm version](https://img.shields.io/npm/v/@kb-skills/mcp-server.svg)](https://www.npmjs.com/package/@kb-skills/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](#运行环境要求)

---

## 这是什么？

`@kb-skills/mcp-server` 是 `kb-skills` 工具链的 MCP 服务端。

它把 `@kb-skills/core` 已有的所有能力（符号搜索、模块全景、路由详情、KB 文件读取、Skill 管理、覆盖率验证、重新扫描）通过标准 MCP 协议暴露出去，让 AI 工具可以**主动查询**你的项目知识库，而不是被动读取静态文件。

```
AI 工具（Cursor / Claude Desktop）
    │  MCP Protocol
    ▼
@kb-skills/mcp-server
    │  复用
    ▼
@kb-skills/core（扫描 / KB / 验证 / Skills）
    │  读写
    ▼
项目源码 + kb/*.md
```

---

## 前置条件

使用 `@kb-skills/mcp-server` 之前，你的项目必须已经完成 `kb-skills` 的初始化：

```bash
# 1. 安装 CLI 和适配器
npm i -D @kb-skills/cli @kb-skills/adapter-react @kb-skills/adapter-koa

# 2. 初始化（生成 kb-skills.config.ts）
npx kb-skills init

# 3. 生成知识库
npx kb-skills run doc-code-to-kb
```

> 如果你的项目还没有 `kb-skills.config.ts`，MCP Server 启动时会报错退出。

---

## 安装

```bash
npm i -D @kb-skills/mcp-server
```

或者直接用 `npx`（无需安装）：

```bash
npx @kb-skills/mcp-server
```

---

## 快速配置

### Cursor

在项目根目录创建（或编辑）`.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "kb-skills": {
      "command": "npx",
      "args": ["@kb-skills/mcp-server"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

> `cwd` 填你项目的**绝对路径**（`kb-skills.config.ts` 所在目录）。

### Claude Desktop

编辑 `claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/`，Windows: `%APPDATA%\Claude\`）：

```json
{
  "mcpServers": {
    "kb-skills": {
      "command": "npx",
      "args": [
        "@kb-skills/mcp-server",
        "--cwd",
        "/path/to/your/project"
      ]
    }
  }
}
```

### Windsurf / 其他 MCP 客户端

配置方式与 Cursor 相同，填入以下信息：

| 字段 | 值 |
|------|-----|
| command | `npx` |
| args | `["@kb-skills/mcp-server", "--cwd", "/path/to/your/project"]` |
| transport | `stdio` |

---

## 命令行参数

```bash
npx @kb-skills/mcp-server [options]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--cwd <dir>` | 项目根目录（`kb-skills.config.ts` 所在位置） | `process.cwd()` |
| `--config <path>` | 指定配置文件路径 | 自动查找 |
| `--http` | 启用 HTTP 模式（替代 stdio） | 关闭 |
| `--port <n>` | HTTP 模式端口 | `3456` |

### 示例

```bash
# stdio 模式（给 Cursor / Claude Desktop）
npx @kb-skills/mcp-server --cwd /my/project

# HTTP 模式（给 CI / 其他 HTTP 客户端）
npx @kb-skills/mcp-server --http --port 3456 --cwd /my/project

# 指定配置文件
npx @kb-skills/mcp-server --config ./config/kb-skills.config.ts
```

---

## 可用 MCP Tools（9 个）

> **v1.1.0 新增**：`search_semantic`（语义搜索）、`run_scan` 支持增量模式、KB 文件 YAML Front Matter 元数据

AI 工具连接后可以调用以下 Tools：

### `search_symbol` — 符号搜索

在项目中搜索路由、服务、组件、Model 等符号，支持模糊匹配。

```
参数：
  query   string   搜索关键词（大小写不敏感）
  kind?   enum     符号类型：route / service / model / middleware /
                             page / component / store / api / type / config
  module? string   限定模块名称
  limit?  number   最多返回条数，默认 20
```

**示例提问**：`帮我找一下 UserService 的实现` → AI 调用 `search_symbol({ query: "UserService", kind: "service" })`

---

### `get_module_map` — 模块全景

返回所有模块的基本信息和 `00_project_map.md` 内容，帮助 AI 快速理解项目整体结构。

```
参数：
  module? string   指定模块名称，不传则返回所有模块
```

---

### `get_route_detail` — 路由详情

按路由路径查找详情，返回对应的 KB 文档内容和源码文件路径。

```
参数：
  route   string   路由路径，如 /api/users 或 /dashboard，支持模糊匹配
  module? string   限定模块名称
```

**示例提问**：`/api/users 这个接口是干什么的` → AI 调用 `get_route_detail({ route: "/api/users" })`

---

### `get_kb_file` — 读取 KB 文件

直接读取 KB 目录下的任意文件内容。

```
参数：
  path  string   相对于 kbRoot 的文件路径
                 如 server/api/users.md 或 frontend/web/01_index_page.md
```

---

### `list_skills` — 列出所有 Skills

列出所有内置 Skills 的名称和描述（无参数）。

---

### `get_skill` — 获取 Skill 内容

获取指定 Skill 的完整 `SKILL.md` 内容，包含详细的 AI 工作流提示词。

```
参数：
  name  string   Skill 名称，如 doc-code-to-kb / bug-fix / code-review
```

---

### `get_kb_status` — KB 覆盖率状态

返回 KB 进度统计和验证报告（无参数）。

```
返回：
  progress.total        总文件数
  progress.done         已完成数
  progress.progressPct  完成百分比
  verify.status         pass / fail / error
  verify.missingFiles   缺失文件列表
  verify.recommendation 修复建议
```

---

### `run_scan` — 触发重新扫描

重新扫描项目代码，刷新 KB 文件和内存缓存。代码有较大变更时使用。

> **v1.1.0 升级**：支持增量模式，只重扫发生变更的模块，大幅提升扫描速度。

```
参数：
  force?  boolean                    是否强制全量重扫，默认 false
  mode?   "full" | "incremental"     扫描模式，默认 "incremental"
```

**返回示例（增量模式）**：
```json
{
  "mode": "incremental",
  "message": "增量扫描完成：3 个模块，247 个符号，变更模块：server",
  "changedModules": ["server"],
  "diffSummary": {
    "added": 1,
    "modified": 2,
    "deleted": 0,
    "unchanged": 312
  }
}
```

---

### `search_semantic` — 语义搜索 ✨ NEW in v1.1.0

基于 **TF-IDF + 余弦相似度** 的本地语义搜索，无需外部 API Key，完全本地运行。

相比 `search_symbol`（精确名称匹配），`search_semantic` 支持**自然语言查询**，能理解意图而非仅匹配关键词。

```
参数：
  query   string   自然语言查询，如"处理用户登录的服务"
  topK?   number   返回结果数量，默认 10
  module? string   限定模块名称
```

**示例提问**：`找一下处理用户权限验证的相关代码` → AI 调用 `search_semantic({ query: "用户权限验证" })`

**返回示例**：
```json
{
  "results": [
    {
      "title": "AuthService",
      "module": "server",
      "score": 0.312,
      "summary": "负责用户身份验证、JWT Token 生成与校验...",
      "meta": {
        "symbol": "AuthService",
        "kind": "service",
        "file": "src/services/auth.service.ts",
        "dependencies": ["UserModel", "JwtService"]
      }
    }
  ],
  "total": 3,
  "query": "用户权限验证",
  "indexedFiles": 48
}
```

> **与 `search_symbol` 的区别**：
> | | `search_symbol` | `search_semantic` |
> |---|---|---|
> | 匹配方式 | 精确名称/类型匹配 | 自然语言语义匹配 |
> | 适用场景 | 知道符号名称 | 描述功能意图 |
> | 速度 | 极快 | 快（本地向量计算） |
> | 需要 API | 否 | 否 |

---

## 缓存机制

MCP Server 内置两层缓存：

### 1. ScanResult 内存缓存

避免每次 Tool 调用都重新扫描：

- **懒加载**：启动时不扫描，首次 Tool 调用时触发
- **TTL**：默认 30 分钟，可通过环境变量覆盖：
  ```bash
  KB_SKILLS_CACHE_TTL_MS=3600000 npx @kb-skills/mcp-server  # 1 小时
  ```
- **手动刷新**：调用 `run_scan` Tool 可立即刷新缓存

### 2. 增量扫描缓存（v1.1.0 新增）

持久化到 `.kb-skills/scan-cache.json`，记录每个源文件的 `mtime + 文件大小 hash`：

- **第一次扫描**：全量扫描，生成缓存文件
- **后续扫描**：只对 hash 变更的文件所在模块触发重扫
- **无变更时**：直接返回缓存，耗时 < 200ms
- **语义索引**：`search_semantic` 的向量索引在 `run_scan` 后自动失效重建

---

## HTTP 模式（CI / 自动化）

```bash
npx @kb-skills/mcp-server --http --port 3456 --cwd /my/project
```

启动后提供两个端点：

| 端点 | 说明 |
|------|------|
| `POST /mcp` | MCP 协议端点（StreamableHTTP transport） |
| `GET /health` | 健康检查，返回 `{ "status": "ok" }` |

---

## 程序化使用

```ts
import { createKbSkillsServer, loadMcpContext } from "@kb-skills/mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const ctx = await loadMcpContext("/path/to/project");
const server = createKbSkillsServer(ctx);
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 运行环境要求

- Node.js **>= 18.17**
- 项目已完成 `kb-skills init` 和 `kb-skills run doc-code-to-kb`

---

## 许可证

[MIT](../../LICENSE)
