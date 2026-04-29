# @kb-skills/adapter-git-log

**English** | [中文](./README.zh-CN.md)

> Git history adapter for [kb-skills](https://github.com/Liyixi33-89/kb-skills). Extracts commit frequency, hot files, recent changes and contributor stats — giving AI a **historical dimension** for change-impact analysis.

[![npm version](https://img.shields.io/npm/v/@kb-skills/adapter-git-log.svg)](https://www.npmjs.com/package/@kb-skills/adapter-git-log)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

## Why?

`analyze_change_impact` knows the static dependency graph. But it doesn't know:

- Which files break most often? (hot files → high risk)
- What changed recently? (recent commits → context for AI)
- Who owns this module? (contributors → who to ask)

`adapter-git-log` fills that gap — **zero extra dependencies**, pure `git log`.

## Installation

```bash
npm i -D @kb-skills/adapter-git-log
```

## Usage

### Basic

```typescript
import createGitLogAdapter from "@kb-skills/adapter-git-log";

const adapter = createGitLogAdapter();

// Detects if the directory is a git repo
const isGit = await adapter.detect("/path/to/project");

// Scan git history
const mod = await adapter.scan("/path/to/project");
const raw = mod.raw; // GitLogRaw
```

### With KB output

```typescript
const adapter = createGitLogAdapter({
  kbRoot: "./kb",
  moduleName: "server",
  sinceDays: 90,
  recentCommitsLimit: 30,
  hotFileTopN: 20,
});

await adapter.scan("/path/to/project");
// Generates:
//   kb/git-log/server/00_overview.md
//   kb/git-log/server/01_hot_files.md
//   kb/git-log/server/02_recent_changes.md
//   kb/git-log/server/03_contributors.md
```

### In kb-skills.config.ts

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
    // Add git history as a separate module
    {
      name: "git-history",
      path: ".",
      adapter: gitLogAdapter({ kbRoot: "./kb", sinceDays: 90 }),
    },
  ],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `moduleName` | `string` | `"git-log"` | Module name for KB directory |
| `sinceDays` | `number` | `90` | Analyze commits from the last N days |
| `recentCommitsLimit` | `number` | `30` | Max recent commits to include |
| `hotFileTopN` | `number` | `20` | Top N hot files to track |
| `pathFilter` | `string` | `""` | Only analyze files under this path (e.g. `"src/"`) |
| `kbRoot` | `string` | `""` | If set, writes KB files automatically |

## Generated KB structure

```
kb/git-log/<moduleName>/
├── 00_overview.md        # Repo stats: branch, total commits, hot file count
├── 01_hot_files.md       # Hot file ranking table (commit frequency)
├── 02_recent_changes.md  # Recent N commits with changed file lists
└── 03_contributors.md    # Contributor stats with top files
```

## Risk levels

Hot files are classified by commit frequency:

| Risk | Threshold | Meaning |
|------|-----------|---------|
| 🔴 High | ≥ 10 commits | Frequently changed, high regression risk |
| 🟡 Medium | 4–9 commits | Moderately active |
| 🟢 Low | 1–3 commits | Stable |

## Integration with OAG tools

```
git log → adapter-git-log → KB files
                                ↓
                    analyze_change_impact
                    (now knows: "this file changed 15 times in 90 days → HIGH RISK")
                                ↓
                    More accurate risk assessment
```

**Example AI reasoning with git-log data:**

> "You're modifying `userService.ts`. Static analysis shows 3 upstream callers.
> Git history shows this file changed **18 times in the last 90 days** (🔴 HIGH risk)
> and was last modified 2 days ago by Alice with message 'fix: race condition in createUser'.
> Recommend: write tests before modifying, and notify Alice."

## Requirements

- Node.js **>= 18.17**
- `git` must be installed and available in PATH
- The scanned directory must be inside a git repository

## License

[MIT](../../LICENSE)
