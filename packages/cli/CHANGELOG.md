# @kb-skills/cli

## 0.0.5

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.2.0

## 0.0.4

### Patch Changes

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

- Updated dependencies
  - @kb-skills/core@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [4cec105]
  - @kb-skills/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.0.2

## 0.0.1

首次发布。

- `kb-skills init` — 自动检测技术栈并生成 `kb-skills.config.ts`
- `kb-skills list` — 列出所有 Skill
- `kb-skills run <skill>` — 执行指定 Skill
- `kb-skills status` — 查看 KB 生成进度
- `kb-skills verify` — 完整性校验（CI 友好）
- `defineConfig` 辅助类型由 `@kb-skills/cli/config` 导出
