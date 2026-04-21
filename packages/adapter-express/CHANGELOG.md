# @kb-skills/adapter-express

## 0.1.0

### Minor Changes

- Added Prisma / MySQL support.

  **`@kb-skills/core`**
  - 新增 `OrmKind` 类型（`"mongoose" | "prisma" | "typeorm" | "sequelize"`）。
  - 新增 `ModelField` 统一字段描述，覆盖 Mongoose 与 SQL ORM 语义（保留 `KoaSchemaField` 为 `@deprecated` 别名，完全向后兼容）。
  - `KoaRaw` 新增可选字段 `orm?: OrmKind`；`KoaModelFile` 新增可选字段 `orm?: OrmKind` / `tableName?: string`。
  - 新增工具集 `utils/orm/`：
    - `detectOrm(deps)` —— 基于 `package.json` 依赖推断 ORM
    - `readDepsFromPackageJson(root)` —— 合并 `dependencies` + `devDependencies`
    - `parsePrismaSchema(content, relPath)` —— 解析 `schema.prisma` 文本为 `KoaModelFile[]`
    - `scanPrismaSchemaFile(serverRoot)` —— 读取并解析 `prisma/schema.prisma`
  - `kb-writer` 按 `raw.orm` 分路渲染：
    - SQL 项目的 `02_index_model.md` 改用新表头（`PK / 自增 / 唯一 / 可空 / 长度 / 默认值 / 关联`）
    - `00_project_map.md` 的技术栈标题与目录树随 ORM 切换（Prisma 显示 `prisma/schema.prisma`，TypeORM 预留 `src/entities/`）
    - `04_index_config.md` 的数据库说明文案随 ORM 切换

  **`@kb-skills/adapter-koa` / `@kb-skills/adapter-express`**
  - `scanServer` 启动时调用 `detectOrm()`，结果写入 `raw.orm`。
  - 当 ORM 为 `"prisma"` 时自动扫描 `prisma/schema.prisma` 取代 `src/models/**.ts` 的 Mongoose 扫描逻辑；Mongoose 项目行为保持不变。
  - Prisma 解析器识别 `@id` / `@unique` / `@default(...)` / `@default(autoincrement())` / `@db.VarChar(n)` / `@db.Decimal(p, s)` / `@map(...)` / `@@map(...)` / `@relation(fields: [...], references: [...])`。

  **兼容性**
  - 所有新增字段均为可选，现有 Mongoose 项目的扫描结果与输出保持字节级一致。
  - `KoaSchemaField` 保留为类型别名，下游消费者无需改动。

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.0.2

## 0.0.1

首次发布。

- 扫描 Express + Mongoose 后端项目
- 检测路由（支持 `app.METHOD` / `router.METHOD` / `app.route().METHOD` 三种写法）、中间件、Mongoose Model、Service、配置、脚本、DB 连接
- 输出 `KoaRaw` 结构（`framework: "express"`），供 `@kb-skills/core` 的 `writeKb` 消费
- 支持自定义模块名（`createExpressAdapter({ moduleName })`）
