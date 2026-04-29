# kb-skills

> 将 AI Skills 打包成可通过 npm 安装的 CLI，适用于任意全栈项目。  
> 支持 **React / Vue 2 / Vue 3 / Next.js / Nuxt** 前端，以及 **Node（Koa / Express / NestJS）** 后端，可在全栈 monorepo 中前后端协同使用。

[![npm version](https://img.shields.io/npm/v/@kb-skills/cli.svg)](https://www.npmjs.com/package/@kb-skills/cli)
[![npm downloads](https://img.shields.io/npm/dm/@kb-skills/cli.svg)](https://www.npmjs.com/package/@kb-skills/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](#运行环境要求)

---

## 这是什么？

`kb-skills` 将久经考验的「Skills + 知识库（KB）」方法论封装为一套与框架无关、可移植的 npm 工具链。

它能从你的代码库自动生成一份**五层知识库**，让任何 AI 编码助手都能在 **3 秒内**定位到路由 / 服务 / 组件 / 状态管理等关键信息。

---

## 📦 包列表

| 包 | 版本 | 说明 |
|---|---|---|
| [`@kb-skills/core`](./packages/core) | `1.5.0` | 核心引擎（Skill 运行器、KB 写入、依赖图谱、跨模块分析、Skill 工作流） |
| [`@kb-skills/cli`](./packages/cli) | `0.2.0` | 命令行工具 `kb-skills` |
| [`@kb-skills/adapter-koa`](./packages/adapter-koa) | `2.0.1` | Koa + Mongoose / Prisma / TypeORM / Sequelize 后端 |
| [`@kb-skills/adapter-express`](./packages/adapter-express) | `2.0.1` | Express + Mongoose / Prisma / TypeORM / Sequelize 后端 |
| [`@kb-skills/adapter-nestjs`](./packages/adapter-nestjs) | `1.0.1` | **NestJS** + Mongoose / Prisma / TypeORM / Sequelize 后端 |
| [`@kb-skills/adapter-react`](./packages/adapter-react) | `2.1.0` | React 19 / **Next.js 13+** + Zustand 前端（支持 Ant Design） |
| [`@kb-skills/adapter-vue3`](./packages/adapter-vue3) | `2.1.0` | Vue 3 / **Nuxt 3** + Pinia 前端（支持 Element Plus / Naive UI） |
| [`@kb-skills/adapter-vue2`](./packages/adapter-vue2) | `1.0.1` | Vue 2 + Vuex 前端（支持 Element UI / Vant） |
| [`@kb-skills/adapter-react-native`](./packages/adapter-react-native) | `1.1.0` | **React Native** / Expo 移动端（支持 Zustand） |
| [`@kb-skills/adapter-openapi`](./packages/adapter-openapi) | `1.0.0` | **OpenAPI / Swagger** 规范解析，将接口契约注入 KB |
| [`@kb-skills/adapter-git-log`](./packages/adapter-git-log) | `1.0.0` | **Git 历史**分析，提取热点文件、变更频率、贡献者统计 |
| [`@kb-skills/mcp-server`](./packages/mcp-server) | `1.5.0` | **MCP Server** — 将 KB 通过 MCP 协议暴露给 Cursor / Claude Desktop / Windsurf |

---

## 📥 安装方式

### 方式 1：全栈 monorepo（推荐）

```bash
# React + Koa
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-react
# Vue 3 + Koa
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-vue3
# NestJS（全栈，adapter-nestjs 自动识别）
npm i -D @kb-skills/cli @kb-skills/adapter-nestjs
# Next.js（全栈，adapter-react 自动识别）
npm i -D @kb-skills/cli @kb-skills/adapter-react
# Nuxt 3（全栈，adapter-vue3 自动识别）
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
# Vue 2 遗留项目
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-vue2
# React Native / Expo
npm i -D @kb-skills/cli @kb-skills/adapter-react-native
```

### 方式 2：纯前端 / 全栈框架项目

```bash
# React SPA
npm i -D @kb-skills/cli @kb-skills/adapter-react
# Next.js（App Router / Pages Router 均支持）
npm i -D @kb-skills/cli @kb-skills/adapter-react
# Vue 3 SPA
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
# Nuxt 3（文件路由 / 自动导入均支持）
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
# Vue 2
npm i -D @kb-skills/cli @kb-skills/adapter-vue2
# React Native / Expo
npm i -D @kb-skills/cli @kb-skills/adapter-react-native
```

### 方式 3：纯后端项目

```bash
# Koa
npm i -D @kb-skills/cli @kb-skills/adapter-koa
# Express
npm i -D @kb-skills/cli @kb-skills/adapter-express
# NestJS
npm i -D @kb-skills/cli @kb-skills/adapter-nestjs
```

### 方式 5：补充 OpenAPI 接口契约（可选）

```bash
# 解析 openapi.json / swagger.yaml，将请求体/响应体结构注入 KB
npm i -D @kb-skills/adapter-openapi
```

### 方式 6：补充 Git 历史维度（可选）

```bash
# 提取热点文件、变更频率、贡献者统计，增强变更影响分析
npm i -D @kb-skills/adapter-git-log
```

### 方式 4：临时使用（不安装）

```bash
npx @kb-skills/cli init
```

---

## 🚀 快速开始（5 步上手）

### Step 1：安装

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-react @kb-skills/adapter-koa
```

### Step 2：初始化配置

```bash
npx kb-skills init
```

自动完成：
- 🔍 检测技术栈（React / Vue 2 / Vue 3 / Koa / Express / **NestJS** / Next.js / Nuxt / **React Native**）
- 📝 生成 `kb-skills.config.ts`
- 📂 创建 `kb/00_project_constitution.md`

### Step 3：生成五层知识库

```bash
npx kb-skills run doc-code-to-kb
```

### Step 4：查看进度

```bash
npx kb-skills status
```

### Step 5：验证覆盖率（CI 友好）

```bash
npx kb-skills verify   # 有缺口时以非零退出码退出
```

---

## ⚙️ 配置文件

`kb-skills.config.ts` 放在项目根目录：

```ts
import { defineConfig } from "@kb-skills/cli/config";
import koaAdapter    from "@kb-skills/adapter-koa";
import reactAdapter  from "@kb-skills/adapter-react";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: koaAdapter() },
    { name: "web",    path: "./web",    adapter: reactAdapter() },
  ],
});
```

### Vue 3 全栈示例

```ts
import { defineConfig } from "@kb-skills/cli/config";
import expressAdapter from "@kb-skills/adapter-express";
import vue3Adapter    from "@kb-skills/adapter-vue3";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: expressAdapter() },
    { name: "web",    path: "./web",    adapter: vue3Adapter() },
  ],
});
```

### Vue 2 遗留项目示例

```ts
import { defineConfig } from "@kb-skills/cli/config";
import koaAdapter  from "@kb-skills/adapter-koa";
import vue2Adapter from "@kb-skills/adapter-vue2";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: koaAdapter() },
    { name: "web",    path: "./web",    adapter: vue2Adapter() },
  ],
});
```

### NestJS 全栈示例

> `adapter-nestjs` 自动识别 `@nestjs/core` / `@nestjs/common` 依赖，递归扫描 `*.controller.ts`、`*.service.ts`、`*.module.ts`、`*.dto.ts`、`*.guard.ts` 等文件。

```ts
import { defineConfig } from "@kb-skills/cli/config";
import nestAdapter from "@kb-skills/adapter-nestjs";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    // NestJS 是全栈框架，只需一个模块
    { name: "server", path: ".", adapter: nestAdapter() },
  ],
});
```

### Next.js 全栈示例

> `adapter-react` 自动识别 `next` 依赖，扫描 `app/`（App Router）和根 `pages/`（Pages Router）。

```ts
import { defineConfig } from "@kb-skills/cli/config";
import reactAdapter from "@kb-skills/adapter-react";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    // Next.js 是全栈框架，只需一个模块
    { name: "web", path: ".", adapter: reactAdapter() },
  ],
});
```

### Nuxt 3 全栈示例

> `adapter-vue3` 自动识别 `nuxt` 依赖，扫描根目录 `pages/`、`components/`、`composables/`、`stores/`、`utils/`。

```ts
import { defineConfig } from "@kb-skills/cli/config";
import vue3Adapter from "@kb-skills/adapter-vue3";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    // Nuxt 3 是全栈框架，只需一个模块
    { name: "web", path: ".", adapter: vue3Adapter() },
  ],
});
```

### React Native / Expo 示例

> `adapter-react-native` 自动识别 `react-native` / `expo` 依赖，扫描 `src/screens/`、`src/navigation/`、`src/components/`、`src/store/`、`src/api/`。

```ts
import { defineConfig } from "@kb-skills/cli/config";
import rnAdapter from "@kb-skills/adapter-react-native";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "app", path: ".", adapter: rnAdapter() },
  ],
});
```

---

## 🧩 适配器一览

### 后端适配器

| 适配器 | 框架 | ORM 支持 |
|---|---|---|
| `@kb-skills/adapter-koa` | Koa | Mongoose · Prisma · TypeORM · Sequelize |
| `@kb-skills/adapter-express` | Express | Mongoose · Prisma · TypeORM · Sequelize |
| `@kb-skills/adapter-nestjs` | **NestJS** | Mongoose · Prisma · TypeORM · Sequelize |

### 前端适配器

| 适配器 | 框架 | UI 库检测 |
|---|---|---|
| `@kb-skills/adapter-react` | React 19 · **Next.js 13+** | Ant Design · Ant Design Mobile · MUI · Chakra UI |
| `@kb-skills/adapter-vue3` | Vue 3 · **Nuxt 3** + Pinia | Element Plus · Naive UI · Ant Design |
| `@kb-skills/adapter-vue2` | Vue 2 + Vuex | Element UI · Vant · Ant Design |
| `@kb-skills/adapter-react-native` | **React Native** · **Expo** | — |

### 增强适配器（可选）

| 适配器 | 用途 | 说明 |
|---|---|---|
| `@kb-skills/adapter-openapi` | 接口契约 | 解析 `openapi.json` / `swagger.yaml`，将请求体/响应体结构注入 KB |
| `@kb-skills/adapter-git-log` | 历史维度 | 提取热点文件、变更频率、贡献者统计，增强 `analyze_change_impact` 准确率 |

### 自动检测规则

`kb-skills init` 读取 `package.json` 依赖，按以下优先级自动选择适配器：

```
koa → express → nestjs → next(→ react adapter) → nuxt(→ vue3 adapter)
→ react-native(→ react-native adapter) → react → vue2 → vue3
```

> **Monorepo glob 支持**：`packages/*`、`apps/*` 等通配符 workspace 路径现已自动展开，无需手动列举子包。

---

## 📋 命令速查

| 命令 | 说明 |
|---|---|
| `kb-skills init` | 初始化配置 + KB 骨架 |
| `kb-skills list` | 列出所有内置 Skills（23 个） |
| `kb-skills run <skill>` | 运行 Skill（如 `doc-code-to-kb`、`bug-fix`） |
| `kb-skills status` | 查看 KB 生成进度 |
| `kb-skills verify` | 验证 KB 覆盖率（CI 友好） |

### 常用 Skills

| Skill | 用途 |
|---|---|
| `doc-code-to-kb` | 扫描代码 → 生成五层 KB |
| `kb-qa` | 基于 KB 回答问题 |
| `bug-fix` | 辅助 Bug 修复 |
| `code-review` | 代码审查 |
| `refactor` | 重构建议 |
| `gen-frontend-code` | 生成前端代码 |
| `gen-backend-code` | 生成后端代码 |
| `prd-brd-to-prd` | BRD → PRD 转换 |
| `prd-to-backend-design` | PRD → 后端设计 |
| `prd-to-frontend-design` | PRD → 前端设计 |

---

## 📁 生成的知识库结构

```
kb/
├── 00_project_constitution.md   # 项目宪法（手动维护）
├── server/<name>/               # Koa / Express 后端
│   ├── 00_project_map.md        # 后端全景
│   ├── 01_index_api.md          # 路由索引
│   ├── 02_index_model.md        # Model 索引（含 ORM 字段）
│   ├── 03_index_service.md      # Service 索引
│   ├── 04_index_config.md       # 配置 & 中间件
│   ├── api/<route>.md           # 路由详情
│   ├── services/<service>.md    # Service 详情
│   └── changelog.md
├── server/<name>/               # NestJS 后端（7 层）
│   ├── 00_project_map.md        # 模块全景
│   ├── 01_index_api.md          # Controller + 端点索引
│   ├── 02_index_model.md        # Model 索引（含 ORM 字段）
│   ├── 03_index_service.md      # Service 索引
│   ├── 04_index_provider.md     # Guard / Interceptor / Pipe / Filter
│   ├── 05_index_dto.md          # DTO 索引
│   ├── 06_index_module.md       # Module 依赖关系
│   ├── api/<controller>.md      # Controller 详情
│   └── changelog.md
└── frontend/<name>/
    ├── 00_project_map.md        # 前端全景（含 UI 库）
    ├── 01_index_page.md         # 页面 / 视图索引
    ├── 02_index_component.md    # 组件索引
    ├── 03_index_api.md          # 前端 API 封装
    ├── 04_index_store.md        # 状态管理（Zustand / Pinia / Vuex）
    ├── 05_index_types.md        # 类型定义
    ├── pages/<page>.md          # 页面详情（React）
    └── changelog.md
```

---

## 🤖 MCP Server（AI 工具直连）

`@kb-skills/mcp-server` 将知识库通过 **MCP（Model Context Protocol）** 协议暴露给 AI 编码助手，让 Cursor / Claude Desktop / Windsurf 可以**主动查询**你的项目，而不是被动读取静态文件。

### 安装

```bash
npm i -D @kb-skills/mcp-server
```

### 配置 Cursor

在项目根目录创建 `.cursor/mcp.json`：

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

### 配置 Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "kb-skills": {
      "command": "npx",
      "args": ["@kb-skills/mcp-server", "--cwd", "/path/to/your/project"]
    }
  }
}
```

### 可用 Tools（13 个）

**RAG 检索类（9 个）**

| Tool | 说明 |
|------|------|
| `search_symbol` | 按名称/类型搜索路由、服务、组件、Model 等符号 |
| `search_semantic` | 自然语言语义搜索（TF-IDF，零依赖） |
| `get_module_map` | 获取项目模块全景（含 `00_project_map.md`） |
| `get_route_detail` | 按路由路径查找 KB 文档和源码位置 |
| `get_kb_file` | 直接读取任意 KB 文件内容 |
| `list_skills` | 列出所有内置 Skills |
| `get_skill` | 获取指定 Skill 的完整提示词 |
| `get_kb_status` | 查看 KB 覆盖率和验证报告 |
| `run_scan` | 触发重新扫描（支持增量模式），刷新缓存 |

**OAG 分析类（4 个）**

| Tool | 说明 |
|------|------|
| `get_dependency_graph` | 查询符号依赖图谱（上游/下游，支持 Mermaid 输出） |
| `find_cross_module_relations` | 查询前后端跨模块关联（后端路由 ↔ 前端调用点） |
| `execute_skill_workflow` | 执行 Skill 多步骤工作流（自动编排 Tool 调用链） |
| `analyze_change_impact` | 变更影响分析（结合依赖图谱 + Git 历史评估风险） |

> 详细文档见 [`packages/mcp-server/README.md`](./packages/mcp-server/README.md)

---

## 🖥️ 运行环境要求

- Node.js **>= 18.17**
- pnpm **>= 9**（仅 monorepo 开发时需要）

---

## 🛠️ 本地开发

```bash
git clone https://github.com/Liyixi33-89/kb-skills.git
cd kb-skills
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

---

## 🚢 发版流程

详见 [**RELEASING.md**](./RELEASING.md)。

---

## 🔗 资源链接

- 📦 npm: <https://www.npmjs.com/package/@kb-skills/cli>
- 🏠 GitHub: <https://github.com/Liyixi33-89/kb-skills>
- 🐛 Issues: <https://github.com/Liyixi33-89/kb-skills/issues>

---

## 📄 许可证

[MIT](./LICENSE)