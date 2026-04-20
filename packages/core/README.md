# @kb-skills/core

Framework-agnostic core primitives for [kb-skills](https://github.com/Liyixi33-89/kb-skills):

- `ScanAdapter` — pluggable code scanners (Koa / React / Vue / ...)
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

- [`@kb-skills/cli`](../cli)
- [`@kb-skills/adapter-koa`](../adapter-koa)
- [`@kb-skills/adapter-react`](../adapter-react)

## License

MIT