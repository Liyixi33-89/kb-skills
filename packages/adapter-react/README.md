# @kb-skills/adapter-react

**English** | [中文](./README.zh-CN.md)

> Scan adapter for **React 19 + Zustand** frontends, powering [`kb-skills`](https://github.com/Liyixi33-89/kb-skills).

Parses your React project and emits a `ModuleInfo` consumed by
[`@kb-skills/core`](../core) to produce the 5-layer Knowledge Base.

It detects:

| Kind | How it's detected |
|---|---|
| **Pages** | `{app}/src/pages/**/*.{tsx,jsx}` — states, effects, handlers, API calls |
| **Components** | `{app}/src/components/**/*.{tsx,jsx}` — props interface |
| **Stores** | `{app}/src/stores/**` (Zustand `create(...)`) |
| **API files** | `{app}/src/{api,services}/**` — exported fetch wrappers |
| **Types** | `{app}/src/types/**` — interfaces + type aliases |
| **Hooks** | `useXxx.ts` in any `src/**/hooks/**` folder |
| **Routes** | `<Route path="..." element={<Page />} />` in `App.tsx` |

## Install

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-react
```

> Peer-depends on `@kb-skills/core` (installed transitively by `@kb-skills/cli`).

## Usage

`kb-skills init` wires the adapter automatically when it detects `react` in
your `package.json`. The generated `kb-skills.config.ts` looks like:

```ts
import { defineConfig } from "@kb-skills/cli/config";
import reactAdapter from "@kb-skills/adapter-react";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "web", path: "./web", adapter: reactAdapter() },
  ],
});
```

### Options

```ts
import { createReactAdapter } from "@kb-skills/adapter-react";

createReactAdapter({
  moduleName: "web", // optional, default: directory basename
});
```

## Output shape

The adapter returns a `ModuleInfo` whose `raw` is a `ReactRaw`:

```ts
interface ReactRaw {
  framework: "react";
  pages:       Array<ReactPageInfo | TsFileInfo>;
  components:  ReactComponentInfo[];
  apiFiles:    TsFileInfo[];
  storeFiles:  TsFileInfo[];
  typesFiles:  TsFileInfo[];
  hooks:       TsFileInfo[];
  routes:      ReactRoute[];
  app?:        TsFileInfo;
}
```

See [`@kb-skills/core` → `types.ts`](../core/src/types.ts) for the full type list.

## Requirements

- Node.js **>= 18.17**
- A React project (Vite / CRA / Next pages-router) with TypeScript or JSX

## License

[MIT](../../LICENSE)
