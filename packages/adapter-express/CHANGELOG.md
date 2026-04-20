# @kb-skills/adapter-express

## 0.0.1

首次发布。

- 扫描 Express + Mongoose 后端项目
- 检测路由（支持 `app.METHOD` / `router.METHOD` / `app.route().METHOD` 三种写法）、中间件、Mongoose Model、Service、配置、脚本、DB 连接
- 输出 `KoaRaw` 结构（`framework: "express"`），供 `@kb-skills/core` 的 `writeKb` 消费
- 支持自定义模块名（`createExpressAdapter({ moduleName })`）
