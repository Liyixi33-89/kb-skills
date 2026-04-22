/**
 * @kb-skills/adapter-react — Scan adapter for React + Zustand frontends.
 *
 * Ported from `scan_project.py` (functions scan_react_project / scan_react_page
 * / scan_react_component). Uses regex-based extraction, matching the Python
 * edition 1:1.
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
  type ReactComponentInfo,
  type ReactPageInfo,
  type ReactRaw,
  type ReactRoute,
  type ScanAdapter,
  type SymbolInfo,
  type TsFileInfo,
  type UiLibraryInfo,
  type UiLibraryKind,
} from "@kb-skills/core";

export interface ReactAdapterOptions {
  /** Optional override for the module name (default: "web"). */
  moduleName?: string;
}

const REACT_PKG_HINTS = ["react", "react-dom"];

/** Next.js 项目特征：有 `next` 依赖 */
const isNextJs = (deps: Record<string, string>): boolean => "next" in deps;

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

// ─── page scanner ───────────────────────────────────────────────────────

const scanReactPage = async (file: string): Promise<ReactPageInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  const content = (await readText(file)) ?? "";

  const states: ReactPageInfo["states"] = [];
  for (const m of content.matchAll(
    /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState(?:<([^>]+)>)?\s*\(([^)]*)\)/g,
  )) {
    states.push({
      name: m[1]!,
      setter: m[2]!,
      type: m[3] ?? "",
      initial: m[4]!.trim(),
    });
  }
  const effectCount = [...content.matchAll(/useEffect\s*\(/g)].length;
  const apiCalls = [...new Set([...content.matchAll(/api\.(\w+)/g)].map((m) => m[1]!))];
  const handlers: string[] = [];
  for (const m of content.matchAll(/const\s+(handle\w+)\s*=/g)) handlers.push(m[1]!);

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    states,
    effectCount,
    apiCalls,
    handlers,
  };
};

// ─── component scanner ──────────────────────────────────────────────────

const scanReactComponent = async (file: string): Promise<ReactComponentInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  const content = (await readText(file)) ?? "";

  const props: KoaInterfaceField[] = [];
  const propsMatch = content.match(/interface\s+(\w*Props\w*)\s*\{([^}]+)\}/s);
  if (propsMatch) {
    for (const fm of propsMatch[2]!.matchAll(/(\w+)(\?)?:\s*([^;\n]+)/g)) {
      props.push({
        name: fm[1]!,
        optional: Boolean(fm[2]),
        type: fm[3]!.trim().replace(/;$/, ""),
      });
    }
  }

  return {
    ...base,
    name: path.basename(file, path.extname(file)),
    props,
  };
};

// ─── UI library detection ──────────────────────────────────────────────

/**
 * Maps npm package names to their canonical UiLibraryKind.
 * Ordered by detection priority — first match wins.
 */
const UI_LIBRARY_MAP: Array<{ pkg: string; kind: UiLibraryKind; importSource: string }> = [
  { pkg: "antd",            kind: "antd",         importSource: "antd" },
  { pkg: "antd-mobile",     kind: "antd-mobile",  importSource: "antd-mobile" },
  { pkg: "@mui/material",   kind: "material-ui",  importSource: "@mui/material" },
  { pkg: "@chakra-ui/react",kind: "chakra-ui",    importSource: "@chakra-ui/react" },
  { pkg: "@shadcn/ui",      kind: "shadcn",       importSource: "@/components/ui" },
  { pkg: "element-plus",    kind: "element-plus", importSource: "element-plus" },
  { pkg: "naive-ui",        kind: "naive-ui",     importSource: "naive-ui" },
];

/**
 * Extract all named imports from a given import source in a source file.
 * Handles both single-line and multi-line import statements.
 *
 * e.g. `import { Button, Table, Form } from "antd"` → ["Button", "Table", "Form"]
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
      // Handle `Button as AntButton` aliases — keep the original name
      const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
      if (name && /^[A-Z]/.test(name)) names.push(name);
    }
  }
  return names;
};

/**
 * Detect the UI component library used in the project.
 * Reads package.json for the dependency, then scans all .tsx/.jsx/.ts/.js
 * source files to collect the component names actually imported.
 */
const detectUiLibrary = async (
  projectRoot: string,
): Promise<UiLibraryInfo | undefined> => {
  // ① Detect which library is installed
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

  const matched = UI_LIBRARY_MAP.find((entry) => entry.pkg in pkg);
  if (!matched) return undefined;

  // ② Scan source files for actual component usage
  const src = path.join(projectRoot, "src");
  const componentSet = new Set<string>();

  for (const f of await walkFiles(src, [".tsx", ".jsx", ".ts", ".js"], IGNORE_DIRS)) {
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

// ─── main scan ──────────────────────────────────────────────────────────

const extractReactRoutes = (appContent: string): ReactRoute[] => {
  const routes: ReactRoute[] = [];
  for (const m of appContent.matchAll(
    /<Route\s+[^>]*path\s*=\s*["']([^"']+)["'][^>]*element\s*=\s*\{[^}]*<(\w+)/g,
  )) {
    routes.push({ path: m[1]!, component: m[2]! });
  }
  for (const m of appContent.matchAll(
    /<Route\s+[^>]*element\s*=\s*\{[^}]*<(\w+)[^>]*\}[^>]*path\s*=\s*["']([^"']+)["']/g,
  )) {
    routes.push({ path: m[2]!, component: m[1]! });
  }
  return routes;
};

const scanReactProject = async (projectRoot: string): Promise<ReactRaw> => {
  const src = path.join(projectRoot, "src");

  // 检测是否为 Next.js 项目
  let nextJsDetected = false;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    nextJsDetected = isNextJs(deps);
  } catch { /* ignore */ }

  const raw: ReactRaw = {
    framework: "react",
    isNextJs: nextJsDetected || undefined,
    pages: [],
    components: [],
    apiFiles: [],
    storeFiles: [],
    typesFiles: [],
    hooks: [],
    routes: [],
  };

  // ── Next.js: app/ directory (App Router) ──────────────────────────────
  // page.tsx / page.jsx / layout.tsx 等都算页面
  const appDir = path.join(projectRoot, "app");
  for (const f of await walkFiles(appDir, [".tsx", ".jsx"], IGNORE_DIRS)) {
    const stem = path.basename(f, path.extname(f));
    if (!["page", "layout", "loading", "error", "not-found", "template"].includes(stem)) continue;
    const info = await scanReactPage(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      // 用目录名作为页面名，更有意义
      info.name = path.basename(path.dirname(f)) || stem;
      raw.pages.push(info);
    }
  }

  // ── Next.js: pages/ at project root (Pages Router) ───────────────────
  const rootPagesDir = path.join(projectRoot, "pages");
  for (const f of await walkFiles(rootPagesDir, [".tsx", ".jsx"], IGNORE_DIRS)) {
    const stem = path.basename(f, path.extname(f));
    if (stem.startsWith("_")) continue; // 跳过 _app.tsx / _document.tsx
    const info = await scanReactPage(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.pages.push(info);
    }
  }

  // ── SPA React: src/pages/ ─────────────────────────────────────────────
  const pagesDir = path.join(src, "pages");
  for (const f of await walkFiles(pagesDir, [".tsx", ".jsx"], IGNORE_DIRS)) {
    const info = await scanReactPage(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.pages.push(info);
    }
  }
  // auxiliary .ts/.js inside src/pages: hooks vs helpers
  for (const f of await walkFiles(pagesDir, [".ts", ".js"], IGNORE_DIRS)) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanTsFile(f);
    if (!info) continue;
    info.relPath = relPosix(projectRoot, f);
    const stem = path.basename(f, path.extname(f));
    if (stem.startsWith("use")) raw.hooks.push(info);
    else raw.pages.push(info);
  }

  // components — src/components/ (SPA) 或根 components/ (Next.js)
  for (const componentsDir of [path.join(src, "components"), path.join(projectRoot, "components")]) {
    for (const f of await listFiles(componentsDir, [".tsx", ".jsx"])) {
      const info = await scanReactComponent(f);
      if (info) {
        info.relPath = relPosix(projectRoot, f);
        raw.components.push(info);
      }
    }
  }

  // api / store / types — 同时扫描 src/ 和根目录下的约定目录
  for (const f of [
    ...await listFiles(path.join(src, "api"), [".ts", ".js"]),
    ...await listFiles(path.join(projectRoot, "lib"), [".ts", ".js"]),
  ]) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.apiFiles.push(info);
    }
  }
  for (const f of [
    ...await listFiles(path.join(src, "store"), [".ts", ".js"]),
    ...await listFiles(path.join(src, "stores"), [".ts", ".js"]),
  ]) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.storeFiles.push(info);
    }
  }
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

  // App.tsx + routes
  const appFile = path.join(src, "App.tsx");
  const appContent = await readText(appFile);
  if (appContent !== null) {
    const appInfo = await scanTsFile(appFile);
    if (appInfo) {
      appInfo.relPath = "src/App.tsx";
      raw.app = appInfo;
    }
    raw.routes = extractReactRoutes(appContent);
  }

  // UI library detection
  const uiLibrary = await detectUiLibrary(projectRoot);
  if (uiLibrary) raw.uiLibrary = uiLibrary;

  return raw;
};

const flattenToSymbols = (raw: ReactRaw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];
  for (const p of raw.pages) {
    const name = (p as { name?: string }).name ?? path.basename(p.file);
    symbols.push({
      kind: "page",
      name,
      file: p.relPath ?? p.file,
      exported: p.exports.includes(name),
      framework: "react",
    });
  }
  for (const c of raw.components) {
    symbols.push({
      kind: "component",
      name: c.name,
      file: c.relPath ?? c.file,
      exported: c.exports.includes(c.name),
      framework: "react",
    });
  }
  for (const s of raw.storeFiles) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "store",
        name: exp,
        file: s.relPath ?? s.file,
        exported: true,
        framework: "react",
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
        framework: "react",
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
        framework: "react",
      });
    }
  }
  return symbols;
};

const createReactAdapter = (options: ReactAdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "web";
  return {
    name: "react",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        // Next.js 项目：有 next 依赖（它自带 react + react-dom）
        if (isNextJs(deps)) return true;
        // 纯 React SPA：同时有 react 和 react-dom
        return REACT_PKG_HINTS.every((hint) => hint in deps);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanReactProject(modulePath);
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

export default createReactAdapter;
export { createReactAdapter };
export type { TsFileInfo };