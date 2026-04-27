# @kb-skills/cli

**English** | [中文](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/cli/README.zh-CN.md)

Command-line interface for [kb-skills](https://github.com/Liyixi33-89/kb-skills).

## Install

```bash
npm i -D @kb-skills/cli
# plus one or more adapters:
npm i -D @kb-skills/adapter-react      # React 19 + Zustand
npm i -D @kb-skills/adapter-vue3       # Vue 3 + Pinia
npm i -D @kb-skills/adapter-vue2       # Vue 2 + Vuex
npm i -D @kb-skills/adapter-koa        # Koa backend
npm i -D @kb-skills/adapter-express    # Express backend
```

## Commands

| Command | Description |
|---|---|
| `kb-skills init` | Scaffold `kb-skills.config.ts` + KB skeleton |
| `kb-skills list` | List bundled Skills (23 total) |
| `kb-skills run <skill>` | Run a Skill (e.g. `doc-code-to-kb`, `bug-fix`) |
| `kb-skills status` | Show KB generation progress |
| `kb-skills verify` | Verify KB coverage |

## Config file

`kb-skills.config.ts` lives at your project root:

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

### Vue 2 legacy project

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

## Quick start

```bash
# 1. Install
npm i -D @kb-skills/cli @kb-skills/adapter-react @kb-skills/adapter-koa

# 2. Scaffold (auto-detects stack, writes kb-skills.config.ts + kb/00_project_constitution.md)
npx kb-skills init

# 3. Generate the 5-layer Knowledge Base
npx kb-skills run doc-code-to-kb

# 4. Inspect progress any time
npx kb-skills status

# 5. Verify KB completeness (CI-friendly, exits non-zero on gaps)
npx kb-skills verify
```

## Stack auto-detection

`kb-skills init` reads `package.json` and picks adapters automatically:

| Detected dep | Stack | Adapter used |
|---|---|---|
| `koa` | Koa | `adapter-koa` |
| `express` | Express | `adapter-express` |
| `next` | Next.js | `adapter-react` |
| `nuxt` / `@nuxt/kit` | Nuxt | `adapter-vue3` |
| `react` | React | `adapter-react` |
| `vue ^2.x` / `vue-template-compiler` | Vue 2 | `adapter-vue2` |
| `vue ^3.x` | Vue 3 | `adapter-vue3` |

## Command details

### `kb-skills init`

Options:

- `-y, --yes` — skip interactive prompts, accept defaults
- `--cwd <dir>` — run against a specific directory (default: `process.cwd()`)

### `kb-skills run <skill>`

Runs a Skill from `@kb-skills/core/assets/skills/`. Common Skills:

| Skill | Purpose |
|---|---|
| `doc-code-to-kb` | Scan your code → produce the 5-layer KB |
| `kb-qa` | Ask questions against the KB |
| `bug-fix` / `refactor` / `code-review` | Developer-assist Skills |
| `gen-frontend-code` / `gen-backend-code` | Code generation |
| `prd-brd-to-prd` / `prd-to-backend-design` / `prd-to-frontend-design` | PM flows |

Use `kb-skills list` to see every Skill bundled with your installed version.

### `kb-skills verify`

Exits with code `1` when any KB file listed in `kb/progress.md` is still
`⬜`. Safe to put in CI.

## License

MIT