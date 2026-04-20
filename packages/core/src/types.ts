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

export interface KoaSchemaField {
  name: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  ref?: string;
  default?: string;
  enum?: string;
}

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
  interfaces: KoaInterface[];
  fields: KoaSchemaField[];
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

export interface KoaRaw {
  framework: "koa";
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