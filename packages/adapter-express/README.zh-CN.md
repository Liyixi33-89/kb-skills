# @kb-skills/adapter-express

[English](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/adapter-express/README.md) | **中文**

> **Express + Mongoose** 后端扫描适配器，为 [`kb-skills`](https://github.com/Liyixi33-89/kb-skills) 提供支持。

解析你的 Express 项目并输出 `ModuleInfo`，供 [`@kb-skills/core`](../core) 生成五层知识库。

支持检测以下内容：

| 类型 | 检测方式 |
|---|---|
| **路由** | `server/src/routes/**` 中的 `app.get/post/put/patch/delete/...(...)`, `router.METHOD(...)` 以及 `app.route("...").get(...).post(...)` 链式调用 |
| **中间件** | 内联的 `requireAuth / requireAdmin / requireRole` + `middleware/**` |
| **模型** | `server/src/models/**` 中的 Mongoose `Schema` + TS `interface` |
| **服务** | `server/src/services/**` 中的导出 + 跨模块引用 |
| **配置 / 脚本 / 数据库** | `server/src/{config,scripts,db}/**.ts` |

## 安装

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-express
```

> 本包对 `@kb-skills/core` 有**对等依赖**。  
> `@kb-skills/cli` 会自动传递安装，通常无需手动添加。

## 使用方式

当 `kb-skills init` 检测到 `package.json` 中包含 `express` 时，会自动接入此适配器。生成的 `kb-skills.config.ts` 如下：

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

### 配置项

```ts
import { createExpressAdapter } from "@kb-skills/adapter-express";

createExpressAdapter({
  moduleName: "api", // 可选，默认值："server"
});
```

## 输出结构

适配器返回一个 `ModuleInfo`，其 `raw` 字段类型为 `KoaRaw`（`framework: "express"`）。  
Express 和 Koa 后端项目结构相似，因此共用同一 payload 结构：

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

完整类型定义请参见 [`@kb-skills/core` → `types.ts`](../core/src/types.ts)。

## 环境要求

- Node.js **>= 18.17**
- 使用 `express` 的项目（支持 `Router()`、`app.route()` 和经典 `app.METHOD(...)` 风格）

## 许可证

[MIT](../../LICENSE)
