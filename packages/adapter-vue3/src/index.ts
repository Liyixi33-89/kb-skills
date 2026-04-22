/**
 * @kb-skills/adapter-vue3 — Scan adapter for Vue 3 + Pinia frontends.
 *
 * Supports both `<script setup>` (Composition API) and Options API authoring
 * styles. Detects Element Plus, Naive UI, and other Vue-ecosystem UI libraries.
 *
 * Project layout convention:
 *   src/{views,pages,components,composables,stores,api,types,router}
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
  type Vue3ComposableInfo,
  type Vue3ComponentInfo,
  type Vue3PageInfo,
  type Vue3Raw,
  type Vue3Route,
  type Vue3StoreInfo,
} from "@kb-skills/core";

export interface Vue3AdapterOptions {
  /** Optional override for the module name (default: "web"). */
  moduleName?: string;
}

// ─── constants ──────────────────────────────────────────────────────────────

const VUE3_PKG_HINT = "vue";

/** Nuxt 3 项目特征：有 nuxt / @nuxt/core / @nuxt/kit 依赖 */
const isNuxt = (deps: Record<string, string>): boolean =>
  "nuxt" in deps || "@nuxt/core" in deps || "@nuxt/kit" in deps;

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
  ".nuxt",
  ".output",
  "public",
]);

/**
 * Vue-ecosystem UI library detection map.
 * Ordered by priority — first match wins.
 */
const VUE_UI_LIBRARY_MAP: Array<{ pkg: string; kind: UiLibraryKind; importSource: string }> = [
  { pkg: "element-plus",        kind: "element-plus",  importSource: "element-plus" },
  { pkg: "naive-ui",            kind: "naive-ui",       importSource: "naive-ui" },
  { pkg: "antd",                kind: "antd",           importSource: "antd" },
  { pkg: "antd-mobile",         kind: "antd-mobile",    importSource: "antd-mobile" },
  { pkg: "@mui/material",       kind: "material-ui",    importSource: "@mui/material" },
  { pkg: "@chakra-ui/react",    kind: "chakra-ui",      importSource: "@chakra-ui/react" },
];

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract all named imports from a given import source in source content.
 * Handles single-line and multi-line import statements.
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
 * Extract the content of the first `<script>` or `<script setup>` block
 * from a Vue SFC string. Returns empty string if not found.
 */
const extractScriptBlock = (sfcContent: string): string => {
  // Prefer <script setup> over plain <script>
  const setupMatch = sfcContent.match(/<script\s+setup(?:\s[^>]*)?>([^]*?)<\/script>/i);
  if (setupMatch) return setupMatch[1]!;
  const scriptMatch = sfcContent.match(/<script(?:\s[^>]*)?>([^]*?)<\/script>/i);
  return scriptMatch ? scriptMatch[1]! : "";
};

// ─── SFC view/page scanner ──────────────────────────────────────────────────

const scanVue3View = async (file: string): Promise<Vue3PageInfo | null> => {
  const sfcContent = await readText(file);
  if (sfcContent === null) return null;

  const script = extractScriptBlock(sfcContent);

  // Write script to a virtual .ts path for scanTsFile — we pass the raw script
  // content directly via a temp approach: build TsFileInfo manually from script.
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

  // ref() / reactive() variable names
  const refs: string[] = [];
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*(?:ref|reactive)\s*[<(]/g)) {
    refs.push(m[1]!);
  }

  // computed() variable names
  const computeds: string[] = [];
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*computed\s*\(/g)) {
    computeds.push(m[1]!);
  }

  // watch / watchEffect count
  const watchCount = [...script.matchAll(/\bwatch(?:Effect)?\s*\(/g)].length;

  // api.xxx calls
  const apiCalls = [
    ...new Set([...script.matchAll(/api\.(\w+)/g)].map((m) => m[1]!)),
  ];

  // const handleXxx = handlers
  const handlers: string[] = [];
  for (const m of script.matchAll(/const\s+(handle\w+)\s*=/g)) {
    handlers.push(m[1]!);
  }

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    refs,
    computeds,
    watchCount,
    apiCalls,
    handlers,
  };
};

// ─── SFC component scanner ──────────────────────────────────────────────────

const scanVue3Component = async (file: string): Promise<Vue3ComponentInfo | null> => {
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

  // Props: defineProps<{ label: string; disabled?: boolean }>()
  // or defineProps({ label: String, disabled: Boolean })
  const props: KoaInterfaceField[] = [];

  // TypeScript generic style: defineProps<{ ... }>()
  const tsPropsMatch = script.match(/defineProps\s*<\s*\{([^}]+)\}\s*>/s);
  if (tsPropsMatch) {
    for (const fm of tsPropsMatch[1]!.matchAll(/(\w+)(\?)?:\s*([^;\n,]+)/g)) {
      props.push({
        name: fm[1]!,
        optional: Boolean(fm[2]),
        type: fm[3]!.trim().replace(/[;,]$/, ""),
      });
    }
  }

  // Emits: defineEmits<{ (e: 'click'): void; (e: 'change', val: string): void }>()
  // or defineEmits(['click', 'change'])
  const emits: string[] = [];

  // Array style: defineEmits(['click', 'change'])
  const emitsArrayMatch = script.match(/defineEmits\s*\(\s*\[([^\]]+)\]/);
  if (emitsArrayMatch) {
    for (const m of emitsArrayMatch[1]!.matchAll(/['"](\w[\w-]*)['"]|`(\w[\w-]*)`/g)) {
      emits.push(m[1] ?? m[2]!);
    }
  }

  // TypeScript generic style: defineEmits<{ (e: 'click'): void }>()
  const emitsTsMatch = script.match(/defineEmits\s*<\s*\{([^}]+)\}\s*>/s);
  if (emitsTsMatch) {
    for (const m of emitsTsMatch[1]!.matchAll(/\(e:\s*['"](\w[\w-]*)['"]|`(\w[\w-]*)`/g)) {
      const name = m[1] ?? m[2]!;
      if (!emits.includes(name)) emits.push(name);
    }
  }

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    props,
    emits,
  };
};

// ─── composable scanner ─────────────────────────────────────────────────────

const scanVue3Composable = async (file: string): Promise<Vue3ComposableInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  const stem = path.basename(file, path.extname(file));
  return { ...base, name: stem };
};

// ─── Pinia store scanner ─────────────────────────────────────────────────────

const scanVue3Store = async (file: string): Promise<Vue3StoreInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  const content = await readText(file);
  let storeId: string | undefined;
  if (content) {
    const m = content.match(/defineStore\s*\(\s*["'`]([^"'`]+)["'`]/);
    if (m) storeId = m[1]!;
  }
  return { ...base, storeId };
};

// ─── router scanner ──────────────────────────────────────────────────────────

const extractVue3Routes = (content: string): Vue3Route[] => {
  const routes: Vue3Route[] = [];
  // Match route objects: { path: '/foo', name: 'foo', component: FooView }
  // or { path: '/foo', component: () => import('./views/Foo.vue') }
  const routeBlockRe = /\{\s*(?:[^{}]*?)\bpath\s*:\s*["'`]([^"'`]+)["'`](?:[^{}]*?)\}/gs;
  for (const m of content.matchAll(routeBlockRe)) {
    const block = m[0]!;
    const pathVal = m[1]!;

    // component: FooView  or  component: () => import('./views/FooView.vue')
    const compDirect = block.match(/\bcomponent\s*:\s*([A-Z]\w+)/);
    const compImport = block.match(/import\s*\(\s*["'`][^"'`]*\/([A-Za-z]\w*)\.vue["'`]/);
    const component = compDirect?.[1] ?? compImport?.[1] ?? "";

    // name: 'foo'
    const nameMatch = block.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
    const name = nameMatch?.[1];

    if (component) {
      routes.push({ path: pathVal, component, ...(name ? { name } : {}) });
    }
  }
  return routes;
};

// ─── UI library detection ────────────────────────────────────────────────────

const detectVue3UiLibrary = async (
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

  const matched = VUE_UI_LIBRARY_MAP.find((entry) => entry.pkg in pkg);
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

// ─── main project scanner ────────────────────────────────────────────────────

const scanVue3Project = async (projectRoot: string): Promise<Vue3Raw> => {
  const src = path.join(projectRoot, "src");

  // 检测是否为 Nuxt 项目
  let nuxtDetected = false;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    nuxtDetected = isNuxt(deps);
  } catch { /* ignore */ }

  const raw: Vue3Raw = {
    framework: "vue3",
    isNuxt: nuxtDetected || undefined,
    views: [],
    components: [],
    composables: [],
    stores: [],
    apiFiles: [],
    typesFiles: [],
    routes: [],
  };

  // ── Nuxt: 根目录 pages/ ───────────────────────────────────────────────
  // Nuxt 约定：pages/ 在项目根目录，不在 src/ 下
  const nuxtPagesDir = path.join(projectRoot, "pages");
  for (const f of await walkFiles(nuxtPagesDir, [".vue"], IGNORE_DIRS)) {
    const info = await scanVue3View(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.views.push(info);
    }
  }

  // ── Nuxt: 根目录 components/ ─────────────────────────────────────────
  const nuxtComponentsDir = path.join(projectRoot, "components");
  for (const f of await listFiles(nuxtComponentsDir, [".vue"])) {
    const info = await scanVue3Component(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.components.push(info);
    }
  }

  // ── Nuxt: 根目录 composables/ ────────────────────────────────────────
  const nuxtComposablesDir = path.join(projectRoot, "composables");
  for (const f of await listFiles(nuxtComposablesDir, [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue3Composable(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.composables.push(info);
    }
  }

  // ── Nuxt: 根目录 stores/ ─────────────────────────────────────────────
  const nuxtStoresDir = path.join(projectRoot, "stores");
  for (const f of await listFiles(nuxtStoresDir, [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue3Store(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.stores.push(info);
    }
  }

  // views — src/views/ (primary) + src/pages/ (compatibility)
  for (const dir of [path.join(src, "views"), path.join(src, "pages")]) {
    for (const f of await walkFiles(dir, [".vue"], IGNORE_DIRS)) {
      const info = await scanVue3View(f);
      if (info) {
        info.relPath = relPosix(projectRoot, f);
        raw.views.push(info);
      }
    }
  }

  // components — src/components/
  for (const f of await listFiles(path.join(src, "components"), [".vue"])) {
    const info = await scanVue3Component(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.components.push(info);
    }
  }

  // composables — src/composables/
  for (const f of await listFiles(path.join(src, "composables"), [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue3Composable(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.composables.push(info);
    }
  }

  // stores — src/stores/
  for (const f of await listFiles(path.join(src, "stores"), [".ts", ".js"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanVue3Store(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.stores.push(info);
    }
  }

  // api files — src/api/ 或 Nuxt 根目录 utils/
  for (const f of [
    ...await listFiles(path.join(src, "api"), [".ts", ".js"]),
    ...await listFiles(path.join(projectRoot, "utils"), [".ts", ".js"]),
  ]) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.apiFiles.push(info);
    }
  }

  // types files — src/types/ 或 Nuxt 根目录 types/
  for (const f of [
    ...await listFiles(path.join(src, "types"), [".ts", ".js"]),
    ...await listFiles(path.join(projectRoot, "types"), [".ts", ".js"]),
  ]) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.typesFiles.push(info);
    }
  }

  // router — src/router/index.ts (or index.js)
  for (const routerFile of [
    path.join(src, "router", "index.ts"),
    path.join(src, "router", "index.js"),
  ]) {
    const content = await readText(routerFile);
    if (content !== null) {
      raw.routes = extractVue3Routes(content);
      break;
    }
  }

  // UI library detection
  const uiLibrary = await detectVue3UiLibrary(projectRoot);
  if (uiLibrary) raw.uiLibrary = uiLibrary;

  return raw;
};

// ─── symbol flattening ───────────────────────────────────────────────────────

const flattenToSymbols = (raw: Vue3Raw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];

  for (const v of raw.views) {
    symbols.push({
      kind: "page",
      name: v.name,
      file: v.relPath ?? v.file,
      exported: true,
      framework: "vue3",
    });
  }

  for (const c of raw.components) {
    symbols.push({
      kind: "component",
      name: c.name,
      file: c.relPath ?? c.file,
      exported: true,
      framework: "vue3",
    });
  }

  for (const s of raw.stores) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "store",
        name: exp,
        file: s.relPath ?? s.file,
        exported: true,
        framework: "vue3",
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
        framework: "vue3",
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
        framework: "vue3",
      });
    }
  }

  for (const comp of raw.composables) {
    symbols.push({
      kind: "config",
      name: comp.name,
      file: comp.relPath ?? comp.file,
      exported: true,
      framework: "vue3",
    });
  }

  return symbols;
};

// ─── adapter factory ─────────────────────────────────────────────────────────

const createVue3Adapter = (options: Vue3AdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "web";

  return {
    name: "vue3",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        // Nuxt 3 项目：有 nuxt 依赖（它自带 vue@3.x）
        if (isNuxt(deps)) return true;
        // 纯 Vue 3 SPA：有 vue@3.x 依赖
        const vueVersion = deps[VUE3_PKG_HINT];
        if (!vueVersion) return false;
        return /^[\^~>=]*3\./.test(vueVersion);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanVue3Project(modulePath);
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

export default createVue3Adapter;
export { createVue3Adapter };
