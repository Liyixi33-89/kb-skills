# @kb-skills/adapter-koa

> Scan adapter for **Koa + Mongoose** backends, powering [`kb-skills`](https://github.com/Liyixi33-89/kb-skills).

Parses your Koa project and emits a `ModuleInfo` consumed by
[`@kb-skills/core`](../core) to produce the 5-layer Knowledge Base.

It detects:

| Kind | How it's detected |
|---|---|
| **Routes** | `router.get/post/put/patch/delete("...")` in `server/src/routes/**` |
| **Middlewares** | Inline `requireAuth / requireAdmin / requireRole` + `middleware/**` |
| **Models** | Mongoose `Schema` + TS `interface` in `server/src/models/**` |
| **Services** | Exports in `server/src/services/**` + cross-module imports |
| **Config / scripts / db** | `server/src/{config,scripts,db}/**.ts` |

## Install

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-koa
```

> This package has a **peer dependency** on `@kb-skills/core`.
> `@kb-skills/cli` installs it transitively, so you rarely add it yourself.

## Usage

`kb-skills init` wires the adapter automatically when it detects `koa` in your
`package.json`. The generated `kb-skills.config.ts` looks like:

```ts
import { defineConfig } from "@kb-skills/cli/config";
import koaAdapter from "@kb-skills/adapter-koa";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "server", path: "./server", adapter: koaAdapter() },
  ],
});
```

### Options

```ts
import { createKoaAdapter } from "@kb-skills/adapter-koa";

createKoaAdapter({
  moduleName: "api", // optional, default: "server"
});
```

## Output shape

The adapter returns a `ModuleInfo` whose `raw` is a `KoaRaw`:

```ts
interface KoaRaw {
  framework: "koa";
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
- A Koa project that uses `@koa/router` or `koa-router`

## License

[MIT](../../LICENSE)
