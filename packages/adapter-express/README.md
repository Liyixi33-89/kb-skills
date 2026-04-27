# @kb-skills/adapter-express

**English** | [中文](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/adapter-express/README.zh-CN.md)

> Scan adapter for **Express + Mongoose** backends, powering [`kb-skills`](https://github.com/Liyixi33-89/kb-skills).

Parses your Express project and emits a `ModuleInfo` consumed by
[`@kb-skills/core`](../core) to produce the 5-layer Knowledge Base.

It detects:

| Kind | How it's detected |
|---|---|
| **Routes** | `app.get/post/put/patch/delete/...(...)`, `router.METHOD(...)`, and `app.route("...").get(...).post(...)` chains in `server/src/routes/**` |
| **Middlewares** | Inline `requireAuth / requireAdmin / requireRole` + `middleware/**` |
| **Models** | Mongoose `Schema` + TS `interface` in `server/src/models/**` |
| **Services** | Exports in `server/src/services/**` + cross-module imports |
| **Config / scripts / db** | `server/src/{config,scripts,db}/**.ts` |

## Install

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-express
```

> This package has a **peer dependency** on `@kb-skills/core`.
> `@kb-skills/cli` installs it transitively, so you rarely add it yourself.

## Usage

`kb-skills init` wires the adapter automatically when it detects `express` in
your `package.json`. The generated `kb-skills.config.ts` looks like:

```ts
import { defineConfig } from "@kb-skills/cli/config";
import expressAdapter from "@kb-skills/adapter-express";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: expressAdapter() },
  ],
});
```

### Options

```ts
import { createExpressAdapter } from "@kb-skills/adapter-express";

createExpressAdapter({
  moduleName: "api", // optional, default: "server"
});
```

## Output shape

The adapter returns a `ModuleInfo` whose `raw` is a `KoaRaw` with
`framework: "express"`. The payload shape is intentionally shared with
`adapter-koa` because Koa and Express backends converge on the same project
layout:

```ts
interface KoaRaw {
  framework: "koa" | "express";
  routes:     KoaRouteFile[];
  models:     KoaModelFile[];
  services:   KoaServiceFile[];
  middleware: KoaMiddlewareFile[];
  config:     TsFileInfo[];
  scripts:    TsFileInfo[];
  db:         TsFileInfo[];
  entry?:     TsFileInfo;
}
```

See [`@kb-skills/core` → `types.ts`](../core/src/types.ts) for the full type list.

## Requirements

- Node.js **>= 18.17**
- An Express project using `express` (works with `Router()`, `app.route()`, and
  classic `app.METHOD(...)` style)

## License

[MIT](../../LICENSE)
