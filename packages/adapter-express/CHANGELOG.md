# @kb-skills/adapter-express

## 2.0.0

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.2.0

## 1.0.0

### Minor Changes

- Added Sequelize support (MySQL / Postgres / SQLite via Sequelize & sequelize-typescript).

  ## Highlights

  New `scan-sequelize.ts` understands all three real-world Sequelize authoring
  styles and normalizes them into the same `KoaModelFile[]` shape that Prisma
  and TypeORM already emit, so `kb-writer` renders a unified SQL table view
  regardless of which ORM the user picked.

  ### Supported styles

  | Style                                    | Example                                                                                    |
  | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
  | ① Function-style `sequelize.define`      | `sequelize.define("User", { email: DataTypes.STRING }, { tableName: "users" })`            |
  | ② Class-inheritance `Model.init`         | `class User extends Model {}; User.init({...}, { sequelize, tableName })`                  |
  | ③ Decorator-style `sequelize-typescript` | `@Table({ tableName: "users" }) class User extends Model<User> { @Column email!: string }` |

  ### Field-type normalization
  - `DataTypes.STRING` / `DataType.STRING` / bare `STRING` → `{ type: "STRING" }`
  - `DataTypes.STRING(255)` → `{ type: "STRING", length: 255 }`
  - `DataTypes.DECIMAL(10, 2)` → `{ type: "DECIMAL", precision: 10, scale: 2 }`

  ### Relation support
  - `references: { model: "users", key: "id" }` → `many-to-one` with foreignKey
  - `@ForeignKey(() => User)` + `@BelongsTo(() => User)` → `many-to-one`
  - `@HasMany(() => Post)` / `@HasOne` / `@BelongsToMany` → corresponding kind

  ## Behavior changes
  - `adapter-koa` / `adapter-express` `scanServer` gains a fourth branch
    `orm === "sequelize" → scanSequelizeModels(serverRoot)`. Mongoose / Prisma /
    TypeORM projects behave identically.
  - Directory priority: `src/models/` → `src/entities/` → `src/entity/` (Sequelize
    community convention differs from TypeORM — `models/` comes first here).
  - Files without any Sequelize fingerprint (`sequelize` / `Sequelize` / `Model` /
    `@Table`) are skipped — no false positives on unrelated `src/models/*.ts`.

  ## Tests
  - +14 unit/integration tests in `packages/core/tests/sequelize.test.ts`
  - +1 e2e test each in `adapter-koa` and `adapter-express` scan-server-orm suites
  - Full test count: **61/61 passed** (was 45/45 at TypeORM release).

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.1.0

## 0.2.0

### Minor Changes

- 4cec105: Added TypeORM support (MySQL / Postgres / SQLite via TypeORM).

  **`@kb-skills/core`**
  - 新增 `parseTypeormEntity(content, relPath)` —— 解析一段 `.ts` 源码中的所有 `@Entity` 类为 `KoaModelFile[]`。
  - 新增 `scanTypeormEntities(serverRoot)` —— 按优先级扫描 `src/{entities,entity,models}/*.ts` 并聚合结果。
  - 识别能力：`@Entity()` / `@Entity("table")` / `@Entity({ name })`、`@Column()` / `@Column({ type, length, precision, scale, nullable, unique, default, name })`、`@PrimaryGeneratedColumn()` / `@PrimaryGeneratedColumn("uuid")`、`@PrimaryColumn()`、`@ManyToOne` / `@OneToMany` / `@OneToOne` / `@ManyToMany`、`@JoinColumn({ name })`。
  - 解析器使用向后逐个匹配的装饰器收集算法，正确处理跨行 + 嵌套 `{}` 的复杂装饰器参数（如 `@Column({ type: "decimal", precision: 10, scale: 2 })`）。
  - 新增 `scan-typeorm` 桶导出，`@kb-skills/core` 主入口同步透出。

  **`@kb-skills/adapter-koa` / `@kb-skills/adapter-express`**
  - `scanServer` 的 ORM 分支改造为 `prisma | typeorm | mongoose` 三向并列（原先只 `prisma | else`）。
  - 修复既有 bug：当项目 deps 命中非 `mongoose` / `prisma` 的 ORM 时，会错误地运行 Mongoose 扫描器并把 `info.orm` 强制写成 `"mongoose"`——现在非支持的 ORM（例如 Sequelize）会让 `raw.models` 保持为空数组，`kb-writer` 依然会输出骨架式的 Model 索引。
  - 新增 TypeORM 扫描分支：当 `detectOrm()` 返回 `"typeorm"` 时调用 `scanTypeormEntities`，模型按 `src/entities/**.ts` → `src/entity/**.ts` → `src/models/**.ts` 的优先级被采集。

  **兼容性**
  - 所有改动继续保持 additive：Mongoose / Prisma 项目的扫描结果与输出字节级一致。
  - `kb-writer` 在早前版本已支持 `raw.orm === "typeorm"` 的目录树与技术栈文案切换，无需再改。

### Patch Changes

- Updated dependencies [4cec105]
  - @kb-skills/core@0.0.3

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
