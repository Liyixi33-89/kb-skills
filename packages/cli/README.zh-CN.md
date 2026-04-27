# @kb-skills/cli

[English](./README.md) | **中文**

[kb-skills](https://github.com/Liyixi33-89/kb-skills) 命令行工具。

## 安装

```bash
npm i -D @kb-skills/cli
# 以及一个或多个适配器：
npm i -D @kb-skills/adapter-react      # React 19 + Zustand
npm i -D @kb-skills/adapter-vue3       # Vue 3 + Pinia
npm i -D @kb-skills/adapter-vue2       # Vue 2 + Vuex
npm i -D @kb-skills/adapter-koa        # Koa 后端
npm i -D @kb-skills/adapter-express    # Express 后端
```

## 命令列表

| 命令 | 说明 |
|---|---|
| `kb-skills init` | 生成 `kb-skills.config.ts` + KB 骨架 |
| `kb-skills list` | 列出所有内置 Skills（共 23 个） |
| `kb-skills run <skill>` | 运行指定 Skill（如 `doc-code-to-kb`、`bug-fix`） |
| `kb-skills status` | 显示 KB 生成进度 |
| `kb-skills verify` | 验证 KB 覆盖率 |

## 配置文件

`kb-skills.config.ts` 位于项目根目录：

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

### Vue 3 + Express

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

### Vue 2 遗留项目

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

## 快速开始

```bash
# 1. 安装
npm i -D @kb-skills/cli @kb-skills/adapter-react @kb-skills/adapter-koa

# 2. 初始化（自动检测技术栈，生成 kb-skills.config.ts + kb/00_project_constitution.md）
npx kb-skills init

# 3. 生成五层知识库
npx kb-skills run doc-code-to-kb

# 4. 随时查看进度
npx kb-skills status

# 5. 验证 KB 完整性（CI 友好，有缺口时以非零退出码退出）
npx kb-skills verify
```

## 技术栈自动检测

`kb-skills init` 读取 `package.json` 并自动选择适配器：

| 检测到的依赖 | 技术栈 | 使用的适配器 |
|---|---|---|
| `koa` | Koa | `adapter-koa` |
| `express` | Express | `adapter-express` |
| `next` | Next.js | `adapter-react` |
| `nuxt` / `@nuxt/kit` | Nuxt | `adapter-vue3` |
| `react` | React | `adapter-react` |
| `vue ^2.x` / `vue-template-compiler` | Vue 2 | `adapter-vue2` |
| `vue ^3.x` | Vue 3 | `adapter-vue3` |

## 命令详情

### `kb-skills init`

选项：

- `-y, --yes` — 跳过交互式提示，接受默认值
- `--cwd <dir>` — 在指定目录下运行（默认：`process.cwd()`）

### `kb-skills run <skill>`

运行 `@kb-skills/core/assets/skills/` 中的 Skill。常用 Skills：

| Skill | 用途 |
|---|---|
| `doc-code-to-kb` | 扫描代码 → 生成五层 KB |
| `kb-qa` | 基于 KB 回答问题 |
| `bug-fix` / `refactor` / `code-review` | 开发辅助 Skills |
| `gen-frontend-code` / `gen-backend-code` | 代码生成 |
| `prd-brd-to-prd` / `prd-to-backend-design` / `prd-to-frontend-design` | 产品经理流程 |

使用 `kb-skills list` 查看当前安装版本中所有内置 Skills。

### `kb-skills verify`

当 `kb/progress.md` 中列出的任意 KB 文件仍为 `⬜` 时，以退出码 `1` 退出。可安全集成到 CI 流程中。

## 许可证

MIT
