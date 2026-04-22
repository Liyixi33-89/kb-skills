/**
 * @kb-skills/adapter-vue2 — Scan adapter for Vue 2 + Vuex frontends.
 *
 * Supports Options API authoring style (`.vue` SFCs with `<script>` blocks).
 * Detects Element UI, Vant, and other Vue 2 ecosystem UI libraries.
 *
 * Project layout convention:
 *   src/{views,pages,components,mixins,store,api,types,router}
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  listFiles,
  walkFiles,
  relPosix,
  scanTsFile,
  readText,
  type KoaInterfaceField,
  type ModuleInfo,
  type ScanAdapter,
  type SymbolInfo,
  type TsFileInfo,
  type UiLibraryInfo,
  type UiLibraryKind,
  type Vue2ComponentInfo,
  type Vue2MixinInfo,
  type Vue2PageInfo,
  type Vue2Raw,
  type Vue2Route,
  type Vue2StoreInfo,
} from "@kb-skills/core";

export interface Vue2AdapterOptions {
  /** Optional override for the module name (default: "web"). */
  moduleName?: string;
}

// ─── constants ───────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  "dist",
  "build",
  ".codebuddy",
  ".vscode",
  ".idea",
  ".cache",
  "coverage",
  "tmp",
  "temp",
  "public",
]);

/**
 * Vue 2 ecosystem UI library detection map.
 * Ordered by priority — first match wins.
 */
const VUE2_UI_LIBRARY_MAP: Array<{ pkg: string; kind: UiLibraryKind; importSource: string }> = [
  { pkg: "element-ui",          kind: "element-ui",    importSource: "element-ui" },
  { pkg: "element-plus",        kind: "element-plus",  importSource: "element-plus" },
  { pkg: "vant",                kind: "vant",          importSource: "vant" },
  { pkg: "antd",                kind: "antd",          importSource: "antd" },
  { pkg: "antd-mobile",         kind: "antd-mobile",   importSource: "antd-mobile" },
  { pkg: "@mui/material",       kind: "material-ui",   importSource: "@mui/material" },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract all named imports from a given import source in source content.
 * Only returns PascalCase names (component names).
 */
const extractNamedImports = (content: string, importSource: string): string[] => {
  const escaped = importSource.replace(/[/\\@.-]/g, "\\$&");
  const re = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']${escaped}["']`,
    "gs",
  );
  const names: string[] = [];
  for (const m of content.matchAll(re)) {
    for (const raw of m[1]!.split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
      if (name && /^[A-Z]/.test(name)) names.push(name);
    }
  }
  return names;
};

/**
 * Extract the content of the `<script>` or `<script setup>` block from a Vue 2 SFC.
 *
 * Priority:
 *   1. `<script setup>` — Vue 2.7 built-in Composition API syntax sugar
 *   2. Plain `<script>` — Options API or `@vue/composition-api` setup()
 *
 * Returns empty string if neither block is found.
 */
const extractScriptBlock = (sfcContent: string): string => {
  // Vue 2.7+: <script setup lang="ts"> / <script setup>
  const setupMatch = sfcContent.match(/<script\s+setup(?:\s[^>]*)?>([^]*?)<\/script>/i);
  if (setupMatch) return setupMatch[1]!;
  // Options API or @vue/composition-api setup()
  const scriptMatch = sfcContent.match(/<script(?:\s[^>]*)?>([^]*?)<\/script>/i);
  return scriptMatch ? scriptMatch[1]! : "";
};

/**
 * Detect whether a script block uses Composition API style.
 * True when the block contains a top-level `setup()` method or is a `<script setup>` block.
 */
const isCompositionApiScript = (script: string, isScriptSetup: boolean): boolean => {
  if (isScriptSetup) return true;
  // setup() { ... } inside export default { ... }
  return /\bsetup\s*\(/.test(script);
};

/**
 * Extract Composition API variable names from a setup() / <script setup> block.
 * Collects: ref(), reactive(), computed() declarations and handleXxx handlers.
 */
const extractCompositionApiProps = (
  script: string,
): { refs: string[]; computeds: string[]; handlers: string[] } => {
  // Extract the setup() body if it's inside export default { setup() { ... } }
  // Otherwise use the whole script (for <script setup>)
  const setupBodyMatch = script.match(/\bsetup\s*\([^)]*\)\s*\{/);
  let body = script;
  if (setupBodyMatch) {
    const start = setupBodyMatch.index! + setupBodyMatch[0].length;
    let depth = 1;
    let i = start;
    while (i < script.length && depth > 0) {
      if (script[i] === "{") depth++;
      else if (script[i] === "}") depth--;
      i++;
    }
    body = script.slice(start, i - 1);
  }

  const refs: string[] = [];
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*(?:ref|reactive)\s*[<(]/g)) {
    refs.push(m[1]!);
  }

  const computeds: string[] = [];
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*computed\s*\(/g)) {
    computeds.push(m[1]!);
  }

  const handlers: string[] = [];
  for (const m of body.matchAll(/const\s+(handle\w+)\s*=/g)) {
    handlers.push(m[1]!);
  }

  return { refs, computeds, handlers };
};

/**
 * Extract the raw content of a top-level Options API block by name.
 * Uses brace-counting to handle nested `{}` (e.g. method bodies).
 *
 * Handles:
 *   option: { ... }
 *   option() { return { ... } }
 */
const extractOptionBlockContent = (script: string, option: string): string => {
  // Find the opening brace of the option block
  const re = new RegExp(`\\b${option}\\s*(?:\\(\\s*\\)\\s*\\{[^{]*\\{|:\\s*\\{)`);
  const m = re.exec(script);
  if (!m) return "";

  // Walk forward from the opening brace, counting depth
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < script.length && depth > 0) {
    if (script[i] === "{") depth++;
    else if (script[i] === "}") depth--;
    i++;
  }
  return script.slice(start, i - 1);
};

/**
 * Extract top-level property/method names from an Options API block.
 * Supports both `key: value` and method shorthand `key(args) { }`.
 */
const extractOptionBlock = (script: string, option: string): string[] => {
  const block = extractOptionBlockContent(script, option);
  if (!block) return [];

  const names: string[] = [];
  // Walk the block at depth=0 only, collecting top-level keys
  let depth = 0;
  let pos = 0;
  while (pos < block.length) {
    const ch = block[pos]!;
    if (ch === "{" || ch === "(" || ch === "[") { depth++; pos++; continue; }
    if (ch === "}" || ch === ")" || ch === "]") { depth--; pos++; continue; }
    if (depth === 0) {
      // Try to match an identifier at this position
      const identMatch = /^(\w+)\s*[:([]/.exec(block.slice(pos));
      if (identMatch) {
        names.push(identMatch[1]!);
        pos += identMatch[1]!.length;
        continue;
      }
    }
    pos++;
  }
  return names;
};

// ─── SFC view/page scanner ────────────────────────────────────────────────────

const scanVue2View = async (file: string): Promise<Vue2PageInfo | null> => {
  const sfcContent = await readText(file);
  if (sfcContent === null) return null;

  // Detect <script setup> (Vue 2.7 syntax sugar)
  const isScriptSetup = /<script\s+setup(?:\s[^>]*)?>/.test(sfcContent);
  const script = extractScriptBlock(sfcContent);

  const base: TsFileInfo = {
    file,
    imports: [],
    exports: [],
    functions: [],
    components: [],
    interfaces: [],
    types: [],
    hooks: [],
    constants: [],
  };

  let dataProps: string[];
  let computeds: string[];
  let watchProps: string[];
  let methods: string[];

  if (isCompositionApiScript(script, isScriptSetup)) {
    // ── Composition API path ─────────────────────────────────────────────
    // Vue 2.7 <script setup> or @vue/composition-api setup() block
    const comp = extractCompositionApiProps(script);
    // Map Composition API concepts to Vue2PageInfo fields:
    //   refs      → dataProps  (reactive state)
    //   computeds → computeds
    //   handlers  → methods
    dataProps  = comp.refs;
    computeds  = comp.computeds;
    watchProps = [...script.matchAll(/\bwatch(?:Effect)?\s*\(/g)].map((_, i) => `watch_${i}`);
    methods    = comp.handlers;
  } else {
    // ── Options API path ─────────────────────────────────────────────────
    dataProps  = extractOptionBlock(script, "data");
    computeds  = extractOptionBlock(script, "computed");
    watchProps = extractOptionBlock(script, "watch");
    methods    = extractOptionBlock(script, "methods");
  }

  // api calls: this.$xxx or api.xxx (both styles)
  const apiCalls = [
    ...new Set([
      ...[...script.matchAll(/this\.\$(\w+)\s*\(/g)].map((m) => m[1]!),
      ...[...script.matchAll(/api\.(\w+)/g)].map((m) => m[1]!),
    ]),
  ];

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    dataProps,
    computeds,
    watchProps,
    apiCalls,
    methods,
  };
};

// ─── SFC component scanner ────────────────────────────────────────────────────

const scanVue2Component = async (file: string): Promise<Vue2ComponentInfo | null> => {
  const sfcContent = await readText(file);
  if (sfcContent === null) return null;

  const script = extractScriptBlock(sfcContent);

  const base: TsFileInfo = {
    file,
    imports: [],
    exports: [],
    functions: [],
    components: [],
    interfaces: [],
    types: [],
    hooks: [],
    constants: [],
  };

  // Props: props: ['label', 'disabled'] or props: { label: { type: String }, ... }
  const props: KoaInterfaceField[] = [];

  // Array style: props: ['label', 'disabled']
  const propsArrayMatch = script.match(/\bprops\s*:\s*\[([^\]]+)\]/);
  if (propsArrayMatch) {
    for (const m of propsArrayMatch[1]!.matchAll(/['"](\w+)['"]/g)) {
      props.push({ name: m[1]!, optional: true, type: "unknown" });
    }
  }

  // Object style: props: { label: { type: String, required: true }, ... }
  // Use brace-counting to extract the full props block
  const propsObjRe = /\bprops\s*:\s*\{/;
  const propsObjStart = propsObjRe.exec(script);
  if (!propsArrayMatch && propsObjStart) {
    const blockStart = propsObjStart.index + propsObjStart[0].length;
    let depth = 1;
    let i = blockStart;
    while (i < script.length && depth > 0) {
      if (script[i] === "{") depth++;
      else if (script[i] === "}") depth--;
      i++;
    }
    const propsBlock = script.slice(blockStart, i - 1);

    // Walk top-level keys in propsBlock
    let pos = 0;
    let blockDepth = 0;
    while (pos < propsBlock.length) {
      const ch = propsBlock[pos]!;
      if (ch === "{" || ch === "(" || ch === "[") { blockDepth++; pos++; continue; }
      if (ch === "}" || ch === ")" || ch === "]") { blockDepth--; pos++; continue; }
      if (blockDepth === 0) {
        const identMatch = /^(\w+)\s*:/.exec(propsBlock.slice(pos));
        if (identMatch) {
          const propName = identMatch[1]!;
          // Find the value block for this prop
          const afterColon = pos + identMatch[0].length;
          const valueStr = propsBlock.slice(afterColon, afterColon + 200);
          const required = /required\s*:\s*true/.test(valueStr);
          props.push({ name: propName, optional: !required, type: "unknown" });
          pos += identMatch[1]!.length;
          continue;
        }
      }
      pos++;
    }
  }

  // Emits: this.$emit('event-name', ...)
  const emits = [
    ...new Set([...script.matchAll(/this\.\$emit\s*\(\s*['"`](\w[\w-]*)['"`]/g)].map((m) => m[1]!)),
  ];

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    props,
    emits,
  };
};

// ─── mixin scanner ────────────────────────────────────────────────────────────

const scanVue2Mixin = async (file: string): Promise<Vue2MixinInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  return { ...base, name: path.basename(file, path.extname(file)) };
};

// ─── Vuex store scanner ───────────────────────────────────────────────────────

const scanVue2Store = async (file: string): Promise<Vue2StoreInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;

  const content = await readText(file);
  if (!content) return { ...base, stateProps: [], mutations: [], actions: [] };

  // namespace
  const namespaced = /namespaced\s*:\s*true/.test(content);
  const namespace = namespaced ? path.basename(path.dirname(file)) : undefined;

  // state properties
  const stateProps = extractOptionBlock(content, "state");

  // mutations
  const mutations = extractOptionBlock(content, "mutations");

  // actions
  const actions = extractOptionBlock(content, "actions");

  return { ...base, namespace, stateProps, mutations, actions };
};

// ─── router scanner ───────────────────────────────────────────────────────────

const extractVue2Routes = (content: string): Vue2Route[] => {
  const routes: Vue2Route[] = [];
  const routeBlockRe = /\{\s*(?:[^{}]*?)\bpath\s*:\s*["'`]([^"'`]+)["'`](?:[^{}]*?)\}/gs;
  for (const m of content.matchAll(routeBlockRe)) {
    const block = m[0]!;
    const pathVal = m[1]!;

    const compDirect = block.match(/\bcomponent\s*:\s*([A-Z]\w+)/);
    const compImport = block.match(/import\s*\(\s*["'`][^"'`]*\/([A-Za-z]\w*)\.vue["'`]/);
    const component = compDirect?.[1] ?? compImport?.[1] ?? "";

    const nameMatch = block.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
    const name = nameMatch?.[1];

    if (component) {
      routes.push({ path: pathVal, component, ...(name ? { name } : {}) });
    }
  }
  return routes;
};

// ─── UI library detection ─────────────────────────────────────────────────────

const detectVue2UiLibrary = async (
  projectRoot: string,
): Promise<UiLibraryInfo | undefined> => {
  let pkg: Record<string, string> = {};
  try {
    const raw = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    pkg = { ...(raw.dependencies ?? {}), ...(raw.devDependencies ?? {}) };
  } catch {
    return undefined;
  }

  const matched = VUE2_UI_LIBRARY_MAP.find((entry) => entry.pkg in pkg);
  if (!matched) return undefined;

  const src = path.join(projectRoot, "src");
  const componentSet = new Set<string>();

  for (const f of await walkFiles(src, [".vue", ".ts", ".js"], IGNORE_DIRS)) {
    const content = await readText(f);
    if (!content) continue;
    for (const name of extractNamedImports(content, matched.importSource)) {
      componentSet.add(name);
    }
  }

  return {
    name: matched.kind,
    version: pkg[matched.pkg],
    components: [...componentSet].sort(),
  };
};

// ─── main project scanner ─────────────────────────────────────────────────────

const scanVue2Project = async (projectRoot: string): Promise<Vue2Raw> => {
  const src = path.join(projectRoot, "src");
  const raw: Vue2Raw = {
    framework: "vue2",
    views: [],
    components: [],
    mixins: [],
    stores: [],
    apiFiles: [],
    typesFiles: [],
    routes: [],
  };

  // views — src/views/ (primary) + src/pages/ (compatibility)
  for (const dir of [path.join(src, "views"), path.join(src, "pages")]) {
    for (const f of await walkFiles(dir, [".vue"], IGNORE_DIRS)) {
      const info = await scanVue2View(f);
      if (info) {
        info.relPath = relPosix(projectRoot, f);
        raw.views.push(info);
      }
    }
  }

  // components — src/components/
  for (const f of await listFiles(path.join(src, "components"), [".vue"])) {
    const info = await scanVue2Component(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.components.push(info);
    }
  }

  // mixins — src/mixins/
  for (const f of await listFiles(path.join(src, "mixins"), [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue2Mixin(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.mixins.push(info);
    }
  }

  // store — src/store/ (Vuex)
  for (const f of await walkFiles(path.join(src, "store"), [".ts", ".js"], IGNORE_DIRS)) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue2Store(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.stores.push(info);
    }
  }

  // api files — src/api/
  for (const f of await listFiles(path.join(src, "api"), [".ts", ".js"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.apiFiles.push(info);
    }
  }

  // types files — src/types/
  for (const f of await listFiles(path.join(src, "types"), [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.typesFiles.push(info);
    }
  }

  // router — src/router/index.ts|js
  for (const routerFile of [
    path.join(src, "router", "index.ts"),
    path.join(src, "router", "index.js"),
  ]) {
    const content = await readText(routerFile);
    if (content !== null) {
      raw.routes = extractVue2Routes(content);
      break;
    }
  }

  // UI library detection
  const uiLibrary = await detectVue2UiLibrary(projectRoot);
  if (uiLibrary) raw.uiLibrary = uiLibrary;

  return raw;
};

// ─── symbol flattening ────────────────────────────────────────────────────────

const flattenToSymbols = (raw: Vue2Raw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];

  for (const v of raw.views) {
    symbols.push({
      kind: "page",
      name: v.name,
      file: v.relPath ?? v.file,
      exported: true,
      framework: "vue2",
    });
  }

  for (const c of raw.components) {
    symbols.push({
      kind: "component",
      name: c.name,
      file: c.relPath ?? c.file,
      exported: true,
      framework: "vue2",
    });
  }

  for (const s of raw.stores) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "store",
        name: exp,
        file: s.relPath ?? s.file,
        exported: true,
        framework: "vue2",
      });
    }
  }

  for (const a of raw.apiFiles) {
    for (const exp of a.exports) {
      symbols.push({
        kind: "api",
        name: exp,
        file: a.relPath ?? a.file,
        exported: true,
        framework: "vue2",
      });
    }
  }

  for (const t of raw.typesFiles) {
    for (const iface of t.interfaces) {
      symbols.push({
        kind: "type",
        name: iface.name,
        file: t.relPath ?? t.file,
        exported: true,
        framework: "vue2",
      });
    }
  }

  for (const mixin of raw.mixins) {
    symbols.push({
      kind: "config",
      name: mixin.name,
      file: mixin.relPath ?? mixin.file,
      exported: true,
      framework: "vue2",
    });
  }

  return symbols;
};

// ─── adapter factory ──────────────────────────────────────────────────────────

const createVue2Adapter = (options: Vue2AdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "web";

  return {
    name: "vue2",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        // vue-template-compiler is Vue 2 exclusive
        if ("vue-template-compiler" in deps) return true;
        const vueVersion = deps["vue"];
        if (!vueVersion) return false;
        // Accept ^2.x, ~2.x, 2.x.x, >=2.0.0, etc.
        return /^[\^~>=]*2\./.test(vueVersion);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanVue2Project(modulePath);
      return {
        name: moduleName,
        root: modulePath,
        kind: "frontend",
        symbols: flattenToSymbols(raw),
        raw,
      };
    },
  };
};

export default createVue2Adapter;
export { createVue2Adapter };
