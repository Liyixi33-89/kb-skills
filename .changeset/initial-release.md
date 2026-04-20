---
"@kb-skills/core": minor
"@kb-skills/cli": minor
"@kb-skills/adapter-koa": minor
"@kb-skills/adapter-react": minor
---

Initial public release of the `kb-skills` monorepo:

- `@kb-skills/core` — Skill runner, KB writer, progress tracker, verifier, logger
- `@kb-skills/cli` — `kb-skills init / list / run / status / verify`
- `@kb-skills/adapter-koa` — Koa + Mongoose scan adapter
- `@kb-skills/adapter-react` — React 19 + Zustand scan adapter

Together they reproduce the Python "Skills + KB" toolkit as an npm-installable
CLI, letting any fullstack project generate a 5-layer Knowledge Base for AI
coding assistants.
