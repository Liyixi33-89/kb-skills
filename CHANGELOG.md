# Changelog

本仓库按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范维护。
遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

后续版本的条目由 [Changesets](https://github.com/changesets/changesets) 自动生成；
本文件仅用于记录首次发布之前的状态和里程碑。

## [0.0.1] - 2026-04-20

首次公开发布，包含以下五个 npm 包：

### Added

- **`@kb-skills/core`** — 核心引擎
  - Skill 运行器（`runDocCodeToKb`）
  - 知识库写入（`writeKb`）
  - 进度跟踪（`initProgress` / `markDone` / `readStatus`）
  - 五层 KB 校验（`verifyKb`）
  - 零依赖 Logger、路径 / 文件系统工具
- **`@kb-skills/cli`** — 命令行
  - `kb-skills init` — 自动检测技术栈并生成 `kb-skills.config.ts`
  - `kb-skills list` — 列出已安装的所有 Skill
  - `kb-skills run <skill>` — 执行任意 Skill
  - `kb-skills status` — 查看 KB 生成进度
  - `kb-skills verify` — CI 友好的完整性校验（退出码 1 表示有缺口）
- **`@kb-skills/adapter-koa`** — Koa + Mongoose 后端扫描适配器
- **`@kb-skills/adapter-express`** — Express 4/5 后端扫描适配器
- **`@kb-skills/adapter-react`** — React 19 + Zustand 前端扫描适配器
- **22 个内置 Skill**：`doc-code-to-kb`、`kb-qa`、`bug-fix`、`refactor`、
  `code-review`、`prd-brd-to-prd`、`prd-to-backend-design`、
  `prd-to-frontend-design`、`prd-to-ui-spec`、`gen-backend-code`、
  `gen-frontend-code`、`gen-test-code`、`gen-demo-html`、`api-doc-gen`、
  `brd-normalize`、`story-split`、`sprint-report`、`changelog-gen`、
  `design-review`、`deploy-check`、`db-migration`、`tech-debt-tracker`、
  `pipeline-orchestrator`
- **工程化**：pnpm workspace、tsup 构建、Vitest、ESLint 9 flat config、
  TypeScript Project References、Changesets 发版、GitHub Actions CI/Release

[0.0.1]: https://github.com/Liyixi33-89/kb-skills/releases/tag/v0.0.1
