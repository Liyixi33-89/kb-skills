# @kb-skills/adapter-react

[English](./README.md) | **中文**

> **React 19 + Zustand** 前端扫描适配器，为 [`kb-skills`](https://github.com/Liyixi33-89/kb-skills) 提供支持。

解析你的 React 项目并输出 `ModuleInfo`，供 [`@kb-skills/core`](../core) 生成五层知识库。

支持检测以下内容：

| 类型 | 检测方式 |
|---|---|
| **页面** | `{app}/src/pages/**/*.{tsx,jsx}` — state、effect、handler、API 调用 |
| **组件** | `{app}/src/components/**/*.{tsx,jsx}` — props interface |
| **Store** | `{app}/src/stores/**`（Zustand `create(...)`） |
| **API 文件** | `{app}/src/{api,services}/**` — 导出的 fetch 封装 |
| **类型** | `{app}/src/types/**` — interface + type alias |
| **Hooks** | 任意 `src/**/hooks/**` 目录下的 `useXxx.ts` |
| **路由** | `App.tsx` 中的 `<Route path="..." element={<Page />} />` |

## 安装

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-react
```

> 对 `@kb-skills/core` 有对等依赖（由 `@kb-skills/cli` 自动传递安装）。

## 使用方式

当 `kb-skills init` 检测到 `package.json` 中包含 `react` 时，会自动接入此适配器。生成的 `kb-skills.config.ts` 如下：

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

### 配置项

```ts
import { createReactAdapter } from "@kb-skills/adapter-react";

createReactAdapter({
  moduleName: "web", // 可选，默认值：目录名
});
```

## 输出结构

适配器返回一个 `ModuleInfo`，其 `raw` 字段类型为 `ReactRaw`：

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

完整类型定义请参见 [`@kb-skills/core` → `types.ts`](../core/src/types.ts)。

## 环境要求

- Node.js **>= 18.17**
- 使用 TypeScript 或 JSX 的 React 项目（Vite / CRA / Next pages-router）

## 许可证

[MIT](../../LICENSE)
