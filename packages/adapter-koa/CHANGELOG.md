# @kb-skills/adapter-koa

## 0.0.1

首次发布。

- 扫描 Koa + Mongoose 后端项目
- 检测路由、中间件、Mongoose Model、Service、配置、脚本、DB 连接
- 输出 `KoaRaw` 结构，供 `@kb-skills/core` 的 `writeKb` 消费
- 支持自定义模块名（`createKoaAdapter({ moduleName })`）
