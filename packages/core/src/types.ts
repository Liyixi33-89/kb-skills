/**
 * Core type contracts for kb-skills.
 *
 * These are the stable interfaces every adapter and CLI command depends on.
 * Do NOT break them without bumping the major version.
 */

/** Kind of symbol an adapter can emit. Extensible via string literal unions. */
export type SymbolKind =
  | "route"
  | "service"
  | "model"
  | "middleware"
  | "page"
  | "component"
  | "store"
  | "api"
  | "type"
  | "config";

export interface SymbolInfo {
  kind: SymbolKind;
  name: string;
  file: string;
  signature?: string;
  exported: boolean;
  framework: string;
  extras?: Record<string, unknown>;
}

export type ModuleKind = "frontend" | "backend";

/**
 * ORM flavours understood by the backend model scanner.
 *
 * The set is intentionally open — adapters declare it on `KoaRaw.orm` and
 * `KoaModelFile.orm` so `kb-writer` can render ORM-specific tables.
 */
export type OrmKind = "mongoose" | "prisma" | "typeorm" | "sequelize";

// ─── Adapter-specific raw payloads (used by kb-writer to emit detailed KB) ───

export interface KoaEndpoint {
  method: string;
  path: string;
  middlewares: string[];
}

export interface KoaRouteFile {
  name: string;
  relPath: string;
  endpoints: KoaEndpoint[];
}

/**
 * Relation metadata for a SQL foreign-key style field (Prisma / TypeORM /
 * Sequelize). `ref` remains the Mongoose-style single-string back-ref, so
 * Mongoose scanners can keep using it untouched.
 */
export interface ModelFieldRelation {
  kind: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  target: string;
  foreignKey?: string;
}

/**
 * Unified field descriptor covering Mongoose Schemas and SQL ORMs.
 *
 * All SQL-specific members are optional so Mongoose adapters emitting the
 * legacy shape (`{ name, type, required, unique, ref, default, enum }`) stay
 * fully forward-compatible with this type.
 */
export interface ModelField {
  name: string;
  type?: string;
  // Common / Mongoose semantics
  required?: boolean;
  unique?: boolean;
  ref?: string;
  default?: string;
  enum?: string;
  // SQL semantics (all optional)
  length?: number;
  precision?: number;
  scale?: number;
  primary?: boolean;
  autoIncrement?: boolean;
  columnName?: string;
  nullable?: boolean;
  relation?: ModelFieldRelation;
}

/**
 * @deprecated Use `ModelField` instead. Kept as an alias so existing adapters
 * can migrate incrementally.
 */
export type KoaSchemaField = ModelField;

export interface KoaInterfaceField {
  name: string;
  optional: boolean;
  type: string;
}

export interface KoaInterface {
  name: string;
  fields: KoaInterfaceField[];
}

export interface KoaModelFile {
  name: string;
  relPath: string;
  modelName?: string;
  /** Which ORM this model was extracted from. Defaults to "mongoose" when omitted. */
  orm?: OrmKind;
  /** SQL table name (Prisma `@@map` / TypeORM `@Entity("name")` / Sequelize `tableName`). */
  tableName?: string;
  interfaces: KoaInterface[];
  fields: ModelField[];
}

export interface KoaServiceFile {
  name: string;
  relPath: string;
  exports: string[];
  dependencies: {
    models: string[];
    services: string[];
    external: string[];
  };
}

export interface KoaMiddlewareFile {
  name: string;
  relPath: string;
  exports: string[];
}

export interface TsFileInfo {
  file: string;
  relPath?: string;
  imports: Array<{ names: string[]; source: string; type?: "named" | "default" }>;
  exports: string[];
  functions: string[];
  components: string[];
  interfaces: KoaInterface[];
  types: Array<{ name: string; value: string }>;
  hooks: string[];
  constants: string[];
}

/**
 * Backend raw payload.
 *
 * Historically named `KoaRaw` because Koa was the first supported framework,
 * but the shape is intentionally generic: any Node/TS backend whose project
 * layout is `src/{routes,services,models,middleware,config,scripts,db}` can
 * emit this payload. The `framework` discriminator tells `kb-writer` how to
 * label the technology stack in the generated KB.
 */
export interface KoaRaw {
  framework: "koa" | "express";
  /**
   * ORM used to persist models. Defaults to "mongoose" when omitted so
   * existing payloads keep working. Populated by the adapter's `scan()`.
   */
  orm?: OrmKind;
  routes: KoaRouteFile[];
  models: KoaModelFile[];
  services: KoaServiceFile[];
  middleware: KoaMiddlewareFile[];
  config: TsFileInfo[];
  scripts: TsFileInfo[];
  db: TsFileInfo[];
  entry?: TsFileInfo;
}

export interface ReactPageInfo extends TsFileInfo {
  name: string;
  states: Array<{ name: string; setter: string; type: string; initial: string }>;
  effectCount: number;
  apiCalls: string[];
  handlers: string[];
}

export interface ReactComponentInfo extends TsFileInfo {
  name: string;
  props: KoaInterfaceField[];
}

export interface ReactRoute {
  path: string;
  component: string;
}

export interface ReactRaw {
  framework: "react";
  pages: Array<ReactPageInfo | TsFileInfo>;
  components: ReactComponentInfo[];
  apiFiles: TsFileInfo[];
  storeFiles: TsFileInfo[];
  typesFiles: TsFileInfo[];
  hooks: TsFileInfo[];
  routes: ReactRoute[];
  app?: TsFileInfo;
}

export type ScanRaw = KoaRaw | ReactRaw;

export interface ModuleInfo {
  name: string;
  root: string;
  kind: ModuleKind;
  symbols: SymbolInfo[];
  /** Adapter-specific raw payload used by kb-writer. */
  raw?: ScanRaw;
}

export type RelationKind = "calls" | "renders" | "imports" | "routes-to";

export interface Relation {
  from: string;
  to: string;
  kind: RelationKind;
}

export interface ScanResult {
  projectRoot: string;
  modules: ModuleInfo[];
  relations: Relation[];
  scannedAt: string;
}

export interface ScanAdapter {
  readonly name: string;
  detect(projectRoot: string): Promise<boolean>;
  scan(modulePath: string, options?: unknown): Promise<ModuleInfo>;
}

export interface SkillMeta {
  name: string;
  description: string;
  content: string;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  debug(msg: string): void;
}

export interface SkillContext {
  projectRoot: string;
  kbRoot: string;
  modules: Array<{
    name: string;
    path: string;
    adapter: ScanAdapter;
  }>;
  logger: Logger;
}