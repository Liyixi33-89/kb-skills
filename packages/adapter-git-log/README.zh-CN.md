# @kb-skills/adapter-git-log

[English](./README.md) | **中文**

> [kb-skills](https://github.com/Liyixi33-89/kb-skills) 的 Git 历史分析适配器。提取提交频率、热点文件、最近变更和贡献者统计，为 AI 的变更影响分析提供**历史维度**。

[![npm version](https://img.shields.io/npm/v/@kb-skills/adapter-git-log.svg)](https://www.npmjs.com/package/@kb-skills/adapter-git-log)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

## 为什么需要它？

`analyze_change_impact` 知道静态依赖图，但不知道：

- 哪些文件最容易出问题？（热点文件 → 高风险）
- 最近改了什么？（最近提交 → 给 AI 提供上下文）
- 谁在维护这个模块？（贡献者 → 知道该找谁）

`adapter-git-log` 填补了这个空白 — **零额外依赖**，纯 `git log` 命令。

## 安装

```bash
npm i -D @kb-skills/adapter-git-log
```

## 使用

### 基础用法

```typescript
import createGitLogAdapter from "@kb-skills/adapter-git-log";

const adapter = createGitLogAdapter();

// 检测目录是否是 git 仓库
const isGit = await adapter.detect("/path/to/project");

// 扫描 git 历史
const mod = await adapter.scan("/path/to/project");
const raw = mod.raw; // GitLogRaw
```

### 写入 KB 文件

```typescript
const adapter = createGitLogAdapter({
  kbRoot: "./kb",
  moduleName: "server",
  sinceDays: 90,
  recentCommitsLimit: 30,
  hotFileTopN: 20,
});

await adapter.scan("/path/to/project");
// 生成文件：
//   kb/git-log/server/00_overview.md
//   kb/git-log/server/01_hot_files.md
//   kb/git-log/server/02_recent_changes.md
//   kb/git-log/server/03_contributors.md
```

### 在 kb-skills.config.ts 中使用

```typescript
import { defineConfig } from "@kb-skills/cli/config";
import koaAdapter from "@kb-skills/adapter-koa";
import reactAdapter from "@kb-skills/adapter-react";
import gitLogAdapter from "@kb-skills/adapter-git-log";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: koaAdapter() },
    { name: "web",    path: "./web",    adapter: reactAdapter() },
    // 将 git 历史作为独立模块
    {
      name: "git-history",
      path: ".",
      adapter: gitLogAdapter({ kbRoot: "./kb", sinceDays: 90 }),
    },
  ],
});
```

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `moduleName` | `string` | `"git-log"` | 模块名，用于 KB 目录命名 |
| `sinceDays` | `number` | `90` | 分析最近 N 天的提交历史 |
| `recentCommitsLimit` | `number` | `30` | 最近提交记录条数 |
| `hotFileTopN` | `number` | `20` | 热点文件排行 Top N |
| `pathFilter` | `string` | `""` | 只分析指定路径下的文件（如 `"src/"`） |
| `kbRoot` | `string` | `""` | 设置后自动写入 KB 文件 |

## 生成的 KB 结构

```
kb/git-log/<moduleName>/
├── 00_overview.md        # 仓库概览：分支、总提交数、热点文件数
├── 01_hot_files.md       # 热点文件排行表（按提交频率）
├── 02_recent_changes.md  # 最近 N 条提交记录（含变更文件列表）
└── 03_contributors.md    # 贡献者统计（含主要维护文件）
```

## 风险等级

热点文件按提交频率分级：

| 风险 | 阈值 | 含义 |
|------|------|------|
| 🔴 高 | ≥ 10 次提交 | 频繁变更，回归风险高 |
| 🟡 中 | 4–9 次提交 | 中等活跃 |
| 🟢 低 | 1–3 次提交 | 相对稳定 |

## 与 OAG 工具的联动

```
git log → adapter-git-log → KB 文件
                                ↓
                    analyze_change_impact
                    （现在知道："这个文件 90 天内改了 15 次 → 高风险"）
                                ↓
                    更准确的风险评估
```

**AI 结合 git-log 数据的推理示例：**

> "你正在修改 `userService.ts`。静态分析显示有 3 个上游调用者。
> Git 历史显示该文件**最近 90 天内变更了 18 次**（🔴 高风险），
> 2 天前由 Alice 最后修改，提交消息为 'fix: race condition in createUser'。
> 建议：修改前先补充测试，并通知 Alice 确认影响范围。"

## 环境要求

- Node.js **>= 18.17**
- 系统中已安装 `git` 并在 PATH 中可访问
- 扫描目录必须在 git 仓库内

## 许可证

[MIT](../../LICENSE)
