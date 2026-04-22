# kb-skills

> 将 AI Skills 打包成可通过 npm 安装的 CLI，适用于任意全栈项目。  
> 支持 **React / Vue 2 / Vue 3 / Next.js / Nuxt** 前端，以及 **Node（Koa / Express）** 后端，可在全栈 monorepo 中前后端协同使用。

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
| [`@kb-skills/core`](./packages/core) | `0.2.0` | 核心引擎（Skill 运行器、KB 写入、进度、校验） |
| [`@kb-skills/cli`](./packages/cli) | `0.0.5` | 命令行工具 `kb-skills` |
| [`@kb-skills/adapter-koa`](./packages/adapter-koa) | `2.0.0` | Koa + Mongoose / Prisma / TypeORM / Sequelize 后端 |
| [`@kb-skills/adapter-express`](./packages/adapter-express) | `2.0.0` | Express + Mongoose / Prisma / TypeORM / Sequelize 后端 |
| [`@kb-skills/adapter-react`](./packages/adapter-react) | `2.0.0` | React 19 + Zustand 前端（支持 Ant Design） |
| [`@kb-skills/adapter-vue3`](./packages/adapter-vue3) | `2.0.0` | Vue 3 + Pinia 前端（支持 Element Plus / Naive UI） |
| [`@kb-skills/adapter-vue2`](./packages/adapter-vue2) | `1.0.0` | Vue 2 + Vuex 前端（支持 Element UI / Vant） |

---

## 📥 安装方式

### 方式 1：全栈 monorepo（推荐）

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-react
# 或 Vue 3 全栈
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-vue3
# 或 Vue 2 遗留项目
npm i -D @kb-skills/cli @kb-skills/adapter-koa @kb-skills/adapter-vue2
```

### 方式 2：纯前端项目

```bash
# React
npm i -D @kb-skills/cli @kb-skills/adapter-react
# Vue 3
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
# Vue 2
npm i -D @kb-skills/cli @kb-skills/adapter-vue2
```

### 方式 3：纯后端项目

```bash
# Koa
npm i -D @kb-skills/cli @kb-skills/adapter-koa
# Express
npm i -D @kb-skills/cli @kb-skills/adapter-express
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
- 🔍 检测技术栈（React / Vue 2 / Vue 3 / Koa / Express / Next.js / Nuxt）
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

---

## 🧩 适配器一览

### 后端适配器

| 适配器 | 框架 | ORM 支持 |
|---|---|---|
| `@kb-skills/adapter-koa` | Koa | Mongoose · Prisma · TypeORM · Sequelize |
| `@kb-skills/adapter-express` | Express | Mongoose · Prisma · TypeORM · Sequelize |

### 前端适配器

| 适配器 | 框架 | UI 库检测 |
|---|---|---|
| `@kb-skills/adapter-react` | React 19 | Ant Design · Ant Design Mobile · MUI · Chakra UI |
| `@kb-skills/adapter-vue3` | Vue 3 + Pinia | Element Plus · Naive UI · Ant Design |
| `@kb-skills/adapter-vue2` | Vue 2 + Vuex | Element UI · Vant · Ant Design |

### 自动检测规则

`kb-skills init` 读取 `package.json` 依赖，按以下优先级自动选择适配器：

```
koa → express → next(→ react adapter) → nuxt(→ vue3 adapter)
→ react → vue2 → vue3
```

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
├── server/<name>/
│   ├── 00_project_map.md        # 后端全景
│   ├── 01_index_api.md          # 路由索引
│   ├── 02_index_model.md        # Model 索引（含 ORM 字段）
│   ├── 03_index_service.md      # Service 索引
│   ├── 04_index_config.md       # 配置 & 中间件
│   ├── api/<route>.md           # 路由详情
│   ├── services/<service>.md    # Service 详情
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