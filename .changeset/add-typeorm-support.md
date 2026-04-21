---
"@kb-skills/core": patch
"@kb-skills/adapter-koa": minor
"@kb-skills/adapter-express": minor
---

Added TypeORM support (MySQL / Postgres / SQLite via TypeORM).

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
