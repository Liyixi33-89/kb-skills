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

/**
 * UI component libraries that the React adapter can detect.
 * Ordered by detection priority (antd > antd-mobile > mui > ...).
 */
export type UiLibraryKind =
  | "antd"
  | "antd-mobile"
  | "material-ui"
  | "chakra-ui"
  | "shadcn"
  | "element-plus"
  | "element-ui"
  | "naive-ui"
  | "vant";

/**
 * Detected UI library metadata.
 * `components` lists every named import extracted from the project source files.
 */
export interface UiLibraryInfo {
  /** Canonical library identifier. */
  name: UiLibraryKind;
  /** Raw version string from package.json (e.g. "^5.0.0"). */
  version?: string;
  /** Deduplicated list of component names actually imported in the project. */
  components: string[];
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
  /** Detected UI component library, if any. */
  uiLibrary?: UiLibraryInfo;
}

// ─── Vue 3 types ─────────────────────────────────────────────────────────────

/**
 * Metadata extracted from a Vue 3 SFC view/page file.
 * Covers both `<script setup>` and Options API `setup()` authoring styles.
 */
export interface Vue3PageInfo extends TsFileInfo {
  /** Component / file stem name, e.g. "UserList". */
  name: string;
  /** `ref()` / `reactive()` variable names declared in setup. */
  refs: string[];
  /** `computed()` variable names. */
  computeds: string[];
  /** Total number of `watch()` / `watchEffect()` calls. */
  watchCount: number;
  /** Deduplicated `api.xxx` call names. */
  apiCalls: string[];
  /** `const handleXxx =` handler names. */
  handlers: string[];
}

/**
 * Metadata extracted from a Vue 3 SFC component file.
 */
export interface Vue3ComponentInfo extends TsFileInfo {
  /** Component name (file stem). */
  name: string;
  /** Props extracted from `defineProps<{ ... }>()` or `defineProps({ ... })`. */
  props: KoaInterfaceField[];
  /** Emit event names from `defineEmits<{ ... }>()` or `defineEmits([...])`. */
  emits: string[];
}

/**
 * A single route entry extracted from `src/router/index.ts`.
 */
export interface Vue3Route {
  path: string;
  component: string;
  /** Optional route name string. */
  name?: string;
}

/**
 * Metadata for a Vue 3 composable file (`src/composables/useXxx.ts`).
 */
export interface Vue3ComposableInfo extends TsFileInfo {
  /** Composable function name (e.g. "useUserData"). */
  name: string;
}

/**
 * Metadata for a Pinia store file (`src/stores/*.ts`).
 */
export interface Vue3StoreInfo extends TsFileInfo {
  /** Store id string passed to `defineStore("id", ...)`, if detectable. */
  storeId?: string;
}

/**
 * Raw payload emitted by `adapter-vue3`.
 *
 * Layout convention: `src/{views,pages,components,composables,stores,api,types,router}`.
 */
export interface Vue3Raw {
  framework: "vue3";
  /** SFC files from `src/views/` and `src/pages/`. */
  views: Vue3PageInfo[];
  /** SFC files from `src/components/`. */
  components: Vue3ComponentInfo[];
  /** Composable files from `src/composables/`. */
  composables: Vue3ComposableInfo[];
  /** Pinia store files from `src/stores/`. */
  stores: Vue3StoreInfo[];
  /** API helper files from `src/api/`. */
  apiFiles: TsFileInfo[];
  /** Type definition files from `src/types/`. */
  typesFiles: TsFileInfo[];
  /** Routes extracted from `src/router/index.ts`. */
  routes: Vue3Route[];
  /** Detected UI component library (Element Plus, Naive UI, etc.). */
  uiLibrary?: UiLibraryInfo;
}

// ─── Vue 2 types ─────────────────────────────────────────────────────────────

/**
 * Metadata extracted from a Vue 2 SFC view/page file.
 * Covers both Options API and `<script>` block authoring styles.
 */
export interface Vue2PageInfo extends TsFileInfo {
  /** Component / file stem name, e.g. "UserList". */
  name: string;
  /** `data()` property names. */
  dataProps: string[];
  /** `computed` property names. */
  computeds: string[];
  /** `watch` property names. */
  watchProps: string[];
  /** Deduplicated `this.$xxx` / `api.xxx` call names. */
  apiCalls: string[];
  /** Method names from the `methods` block. */
  methods: string[];
}

/**
 * Metadata extracted from a Vue 2 SFC component file.
 */
export interface Vue2ComponentInfo extends TsFileInfo {
  /** Component name (file stem or `name:` option). */
  name: string;
  /** Props extracted from `props: { ... }` or `props: [...]`. */
  props: KoaInterfaceField[];
  /** Emit event names from `this.$emit('...')` calls. */
  emits: string[];
}

/**
 * A single route entry extracted from `src/router/index.js`.
 */
export interface Vue2Route {
  path: string;
  component: string;
  /** Optional route name string. */
  name?: string;
}

/**
 * Metadata for a Vue 2 mixin file (`src/mixins/*.js|ts`).
 */
export interface Vue2MixinInfo extends TsFileInfo {
  /** Mixin file stem name. */
  name: string;
}

/**
 * Metadata for a Vuex store file (`src/store/*.js|ts`).
 */
export interface Vue2StoreInfo extends TsFileInfo {
  /** Vuex module namespace, if detectable from `namespaced: true` + file path. */
  namespace?: string;
  /** State property names extracted from `state: { ... }` or `state() { ... }`. */
  stateProps: string[];
  /** Mutation names from `mutations: { ... }`. */
  mutations: string[];
  /** Action names from `actions: { ... }`. */
  actions: string[];
}

/**
 * Raw payload emitted by `adapter-vue2`.
 *
 * Layout convention: `src/{views,pages,components,mixins,store,api,types,router}`.
 */
export interface Vue2Raw {
  framework: "vue2";
  /** SFC files from `src/views/` and `src/pages/`. */
  views: Vue2PageInfo[];
  /** SFC files from `src/components/`. */
  components: Vue2ComponentInfo[];
  /** Mixin files from `src/mixins/`. */
  mixins: Vue2MixinInfo[];
  /** Vuex store files from `src/store/`. */
  stores: Vue2StoreInfo[];
  /** API helper files from `src/api/`. */
  apiFiles: TsFileInfo[];
  /** Type definition files from `src/types/`. */
  typesFiles: TsFileInfo[];
  /** Routes extracted from `src/router/index.js|ts`. */
  routes: Vue2Route[];
  /** Detected UI component library (Element UI, Vant, etc.). */
  uiLibrary?: UiLibraryInfo;
}

export type ScanRaw = KoaRaw | ReactRaw | Vue3Raw | Vue2Raw;

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