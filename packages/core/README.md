# @kb-skills/core

Framework-agnostic core primitives for [kb-skills](https://github.com/Liyixi33-89/kb-skills):

- `ScanAdapter` — pluggable code scanners (Koa / Express / React / Vue 2 / Vue 3 / ...)
- `writeKb` — emits the 5-layer Markdown KB from a `ScanResult`
- `SkillRunner` — orchestrates `scan → write → verify`
- `Progress` — tracks per-file completion for long-running, resumable Skill runs
- `Verifier` — validates KB completeness against the scan manifest
- `Logger` — minimal, dependency-light console logger

You rarely depend on this package directly — instead use
[`@kb-skills/cli`](../cli) and one or more `@kb-skills/adapter-*` packages.

## Install

```bash
npm i @kb-skills/core
```

## Peer packages

| Package | Purpose |
|---|---|
| [`@kb-skills/cli`](../cli) | CLI entry point |
| [`@kb-skills/adapter-koa`](../adapter-koa) | Koa + Mongoose / Prisma / TypeORM / Sequelize |
| [`@kb-skills/adapter-express`](../adapter-express) | Express + Mongoose / Prisma / TypeORM / Sequelize |
| [`@kb-skills/adapter-react`](../adapter-react) | React 19 + Zustand |
| [`@kb-skills/adapter-vue3`](../adapter-vue3) | Vue 3 + Pinia |
| [`@kb-skills/adapter-vue2`](../adapter-vue2) | Vue 2 + Vuex |

## Key types

```ts
// Every adapter implements this interface
interface ScanAdapter {
  readonly name: string;
  detect(projectRoot: string): Promise<boolean>;
  scan(modulePath: string): Promise<ModuleInfo>;
}

// Raw payload union — discriminated by `framework`
type ScanRaw = KoaRaw | ReactRaw | Vue3Raw | Vue2Raw;

// UI library detection result
interface UiLibraryInfo {
  name: UiLibraryKind; // "antd" | "element-ui" | "element-plus" | "vant" | ...
  version?: string;
  components: string[];
}
```

See [`src/types.ts`](./src/types.ts) for the complete type definitions.

## License

MIT