# kb-skills

> 将 AI Skills 打包成可通过 npm 安装的 CLI，适用于任意全栈项目。
> 既可独立用于 **React / Vue 2 / Vue 3** 前端或 **Node（Koa / Express）** 后端，也可在全栈 monorepo 中前后端协同使用。

[![npm version](https://img.shields.io/npm/v/@kb-skills/cli.svg)](https://www.npmjs.com/package/@kb-skills/cli)
[![npm downloads](https://img.shields.io/npm/dm/@kb-skills/cli.svg)](https://www.npmjs.com/package/@kb-skills/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](#%E8%BF%90%E8%A1%8C%E7%8E%AF%E5%A2%83%E8%A6%81%E6%B1%82)

---

## 这是什么？

`kb-skills` 将久经考验的「Skills + 知识库（KB）」方法论
（最初在 [agency-agents](https://github.com/Liyixi33-89/agent-apps) 项目中打磨而成）
封装为一套与框架无关、可移植的 npm 工具链。

它能从你的代码库自动生成一份**五层知识库**，让任何 AI 编码助手都能在 **3 秒内**
定位到路由 / 服务 / 组件 / 状态管理等关键信息。

---

## 📦 包列表

| 包 | 版本 | 说明 |
|---|---|---|
| [`@kb-skills/core`](./packages/core) | 0.0.1 | 核心引擎（Skill 运行器、KB 写入、进度、校验） |
| [`@kb-skills/cli`](./packages/cli) | 0.0.1 | 命令行工具 `kb-skills` |
| [`@kb-skills/adapter-koa`](./packages/adapter-koa) | 0.0.1 | 面向 Koa + Mongoose 后端的扫描适配器 |
| [`@kb-skills/adapter-react`](./packages/adapter-react) | 0.0.1 | 面向 React 19 + Zustand 前端的扫描适配器 |

即将推出：`adapter-express`、`adapter-vue2`、`adapter-vue3`。

---

## 📥 安装方式

### 方式 1：全局安装（推荐 CLI 使用）

```bash
# npm
npm install -g @kb-skills/cli

# pnpm
pnpm add -g @kb-skills/cli

# yarn
yarn global add @kb-skills/cli
```

安装后全局可用 `kb-skills` 命令：

```bash
kb-skills --version
kb-skills --help
```

### 方式 2：项目内安装（推荐团队协作）

```bash
# 进入你的前端/后端项目
cd your-project

# 作为 devDependency 安装
pnpm add -D @kb-skills/cli @kb-skills/core
```

然后在 `package.json` 里加 script：

```json
{
  "scripts": {
    "kb:init": "kb-skills init",
    "kb:scan": "kb-skills scan",
    "kb:build": "kb-skills build"
  }
}
```

### 方式 3：临时使用（不安装）

```bash
npx @kb-skills/cli init
pnpm dlx @kb-skills/cli scan
```

---

## 🚀 快速开始（3 步上手）

### Step 1：初始化配置

进入你的项目根目录，执行：

```bash
kb-skills init
```

这会自动：

- 🔍 检测你的技术栈（React / Vue / Koa / Express 等）
- 📝 生成 `.kb-skills/config.json` 配置文件
- 📂 创建知识库输出目录

### Step 2：扫描项目

```bash
kb-skills scan
```

扫描范围包括：

- 组件、Hook、工具函数
- 路由、接口定义
- 类型声明（`.d.ts`）
- 项目依赖与技术栈

### Step 3：构建知识库

```bash
kb-skills build
```

生成标准化的知识库文档到 `.kb-skills/output/` 目录。

---

## 🧩 按技术栈适配

kb-skills 针对不同技术栈提供专用适配器：

| 技术栈 | 适配器包 | 安装命令 |
|---|---|---|
| React | `@kb-skills/adapter-react` | `pnpm add -D @kb-skills/adapter-react` |
| Koa | `@kb-skills/adapter-koa` | `pnpm add -D @kb-skills/adapter-koa` |

**自动加载**：`kb-skills init` 会根据检测到的技术栈自动推荐并安装对应适配器，无需手动配置。

---

## ⚙️ 配置文件说明

`.kb-skills/config.json` 示例：

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scan": {
    "include": ["src/**/*.{ts,tsx,js,jsx}"],
    "exclude": ["**/*.test.ts", "**/node_modules/**"]
  },
  "adapters": ["@kb-skills/adapter-react"],
  "output": {
    "dir": ".kb-skills/output",
    "format": "markdown"
  }
}
```

---

## 📋 常用命令速查

```bash
kb-skills init              # 初始化项目
kb-skills scan              # 扫描项目结构
kb-skills build             # 生成知识库
kb-skills verify            # 校验配置与产物
kb-skills --help            # 查看所有命令
kb-skills <cmd> --help      # 查看子命令帮助
```

---

## 🖥️ 运行环境要求

- Node.js **>= 18.17**
- pnpm **>= 9**（仅 monorepo 开发时需要）

---

## 🛠️ 本地开发

```bash
pnpm install
pnpm build
pnpm test
```

---

## 🔗 资源链接

- 📦 npm: <https://www.npmjs.com/package/@kb-skills/cli>
- 🏠 GitHub: <https://github.com/Liyixi33-89/kb-skills>
- 🐛 Issues: <https://github.com/Liyixi33-89/kb-skills/issues>
- 📖 Docs: <https://github.com/Liyixi33-89/kb-skills#readme>

---

## 🔄 与 Python 版本的关系

每一份 `SKILL.md` 的权威来源位于
[`agency-agents/apps/skills/`](https://github.com/Liyixi33-89/agent-apps)。
`scripts/sync-skills.ts` 会将这些 `SKILL.md` 同步到
`packages/core/assets/skills/`，从而让 Python 版（面向 AI Agents）
与 npm 版始终保持一致。

---

## 📄 许可证

[MIT](./LICENSE)