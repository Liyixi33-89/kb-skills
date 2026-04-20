# kb-skills

> 将 AI Skills 打包成可通过 npm 安装的 CLI，适用于任意全栈项目。
> 既可独立用于 **React / Vue 2 / Vue 3** 前端或 **Node（Koa / Express）** 后端，也可在全栈 monorepo 中前后端协同使用。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](#%E8%BF%90%E8%A1%8C%E7%8E%AF%E5%A2%83%E8%A6%81%E6%B1%82)

---

## 这是什么？

`kb-skills` 将久经考验的「Skills + 知识库（KB）」方法论
（最初在 [agency-agents](https://github.com/Liyixi33-89/agent-apps) 项目中打磨而成）
封装为一套与框架无关、可移植的 npm 工具链。

它能从你的代码库自动生成一份**五层知识库**，让任何 AI 编码助手都能在 **3 秒内**
定位到路由 / 服务 / 组件 / 状态管理等关键信息。

## 包列表

| 包 | 版本 | 说明 |
|---|---|---|
| [`@kb-skills/core`](./packages/core) | 0.0.1 | 核心引擎（Skill 运行器、KB 写入、进度、校验） |
| [`@kb-skills/cli`](./packages/cli) | 0.0.1 | 命令行工具 `kb-skills` |
| [`@kb-skills/adapter-koa`](./packages/adapter-koa) | 0.0.1 | 面向 Koa + Mongoose 后端的扫描适配器 |
| [`@kb-skills/adapter-react`](./packages/adapter-react) | 0.0.1 | 面向 React 19 + Zustand 前端的扫描适配器 |

即将推出：`adapter-express`、`adapter-vue2`、`adapter-vue3`。

## 快速开始

```bash
# 在任意项目中（React / Vue / Node）
npm i -D @kb-skills/cli @kb-skills/adapter-react
npx kb-skills init
npx kb-skills run doc-code-to-kb
```

## 运行环境要求

- Node.js **>= 18.17**
- pnpm **>= 9**（仅 monorepo 开发时需要）

## 本地开发

```bash
pnpm install
pnpm build
pnpm test
```

## 与 Python 版本的关系

每一份 `SKILL.md` 的权威来源位于
[`agency-agents/apps/skills/`](https://github.com/Liyixi33-89/agent-apps)。
`scripts/sync-skills.ts` 会将这些 `SKILL.md` 同步到
`packages/core/assets/skills/`，从而让 Python 版（面向 AI Agents）
与 npm 版始终保持一致。

## 许可证

[MIT](./LICENSE)