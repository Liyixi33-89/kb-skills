# @kb-skills/core

[English](./README.md) | **中文**

[kb-skills](https://github.com/Liyixi33-89/kb-skills) 的框架无关核心原语：

- `ScanAdapter` — 可插拔代码扫描器（Koa / Express / React / Vue 2 / Vue 3 / ...）
- `writeKb` — 从 `ScanResult` 输出五层 Markdown 知识库
- `SkillRunner` — 编排 `scan → write → verify` 流程
- `Progress` — 追踪长时间运行、可恢复的 Skill 任务的逐文件完成情况
- `Verifier` — 根据扫描清单验证 KB 完整性
- `Logger` — 轻量、无额外依赖的控制台日志工具

通常你不需要直接依赖此包，而是使用 [`@kb-skills/cli`](../cli) 和一个或多个 `@kb-skills/adapter-*` 包。

## 安装

```bash
npm i @kb-skills/core
```

## 配套包

| 包 | 用途 |
|---|---|
| [`@kb-skills/cli`](../cli) | CLI 入口 |
| [`@kb-skills/adapter-koa`](../adapter-koa) | Koa + Mongoose / Prisma / TypeORM / Sequelize |
| [`@kb-skills/adapter-express`](../adapter-express) | Express + Mongoose / Prisma / TypeORM / Sequelize |
| [`@kb-skills/adapter-react`](../adapter-react) | React 19 + Zustand |
| [`@kb-skills/adapter-vue3`](../adapter-vue3) | Vue 3 + Pinia |
| [`@kb-skills/adapter-vue2`](../adapter-vue2) | Vue 2 + Vuex |

## 核心类型

```ts
// 每个适配器都实现此接口
interface ScanAdapter {
  readonly name: string;
  detect(projectRoot: string): Promise<boolean>;
  scan(modulePath: string): Promise<ModuleInfo>;
}

// Raw payload 联合类型 — 通过 `framework` 字段区分
type ScanRaw = KoaRaw | ReactRaw | Vue3Raw | Vue2Raw;

// UI 组件库检测结果
interface UiLibraryInfo {
  name: UiLibraryKind; // "antd" | "element-ui" | "element-plus" | "vant" | ...
  version?: string;
  components: string[];
}
```

完整类型定义请参见 [`src/types.ts`](./src/types.ts)。

## 许可证

MIT
