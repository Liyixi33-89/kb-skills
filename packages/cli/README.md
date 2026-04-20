# @kb-skills/cli

Command-line interface for [kb-skills](https://github.com/Liyixi33-89/kb-skills).

## Install

```bash
npm i -D @kb-skills/cli
# plus one or more adapters:
npm i -D @kb-skills/adapter-react   # React
npm i -D @kb-skills/adapter-koa     # Koa / Node
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
import koaAdapter from "@kb-skills/adapter-koa";
import reactAdapter from "@kb-skills/adapter-react";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server/src", adapter: koaAdapter() },
    { name: "web",    path: "./web/src",    adapter: reactAdapter() },
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
| `prd-brd-to-prd` / `prd-to-backend-design` / `prd-to-frontend-design` | PM flows |

Use `kb-skills list` to see every Skill bundled with your installed version.

### `kb-skills verify`

Exits with code `1` when any KB file listed in `kb/progress.md` is still
`⬜`. Safe to put in CI.

## License

MIT