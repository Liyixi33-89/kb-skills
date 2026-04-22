/**
 * @kb-skills/adapter-react-native — Scan adapter for React Native projects.
 *
 * Supports both bare React Native and Expo (managed / bare workflow).
 *
 * Scanned directories:
 *   src/screens/      — screen components (equivalent to "pages" in web)
 *   src/components/   — shared UI components
 *   src/navigation/   — React Navigation stack/tab/drawer definitions
 *   src/hooks/        — custom hooks
 *   src/store/ | src/stores/ — Zustand / Redux stores
 *   src/api/          — API helper files
 *   src/types/        — TypeScript type definitions
 *
 * Output shape: `ReactNativeRaw` — extends the React adapter's shape with
 * `isExpo`, `screens`, and `navigation` fields.
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
  type ScanAdapter,
  type SymbolInfo,
  type TsFileInfo,
} from "@kb-skills/core";

// ─── types ────────────────────────────────────────────────────────────────────

export interface ReactNativeScreenInfo extends TsFileInfo {
  /** Screen name (file stem), e.g. "HomeScreen". */
  name: string;
  /** useState calls extracted from the screen. */
  states: Array<{ name: string; setter: string; type: string; initial: string }>;
  /** Number of useEffect calls. */
  effectCount: number;
  /** Deduplicated `api.xxx` call names. */
  apiCalls: string[];
  /** `const handleXxx =` handler names. */
  handlers: string[];
}

export interface ReactNativeRoute {
  /** Screen name registered in the navigator. */
  name: string;
  /** Component name. */
  component: string;
}

export interface ReactNativeRaw {
  framework: "react-native";
  /** True when the project has an `expo` dependency. */
  isExpo?: boolean;
  /** Screen files from `src/screens/`. */
  screens: ReactNativeScreenInfo[];
  /** Shared component files from `src/components/`. */
  components: ReactComponentInfo[];
  /** Navigation route definitions extracted from `src/navigation/`. */
  navigation: ReactNativeRoute[];
  /** Custom hook files from `src/hooks/`. */
  hooks: TsFileInfo[];
  /** Store files from `src/store/` or `src/stores/`. */
  storeFiles: TsFileInfo[];
  /** API helper files from `src/api/`. */
  apiFiles: TsFileInfo[];
  /** Type definition files from `src/types/`. */
  typesFiles: TsFileInfo[];
}

// ─── adapter options ──────────────────────────────────────────────────────────

export interface ReactNativeAdapterOptions {
  /** Optional override for the module name (default: "app"). */
  moduleName?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const RN_PKG_HINTS = ["react-native", "expo"];

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  "dist",
  "build",
  ".expo",
  ".expo-shared",
  "android",
  "ios",
  ".codebuddy",
  ".vscode",
  ".idea",
  "coverage",
]);

// ─── screen scanner ───────────────────────────────────────────────────────────

const scanScreen = async (file: string): Promise<ReactNativeScreenInfo | null> => {
  const base = await scanTsFile(file);
  if (!base) return null;
  const content = (await readText(file)) ?? "";

  const states: ReactNativeScreenInfo["states"] = [];
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

// ─── component scanner ────────────────────────────────────────────────────────

const scanComponent = async (file: string): Promise<ReactComponentInfo | null> => {
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

// ─── navigation scanner ───────────────────────────────────────────────────────

/**
 * Extract screen registrations from React Navigation stack/tab/drawer files.
 *
 * Handles patterns like:
 *   <Stack.Screen name="Home" component={HomeScreen} />
 *   <Tab.Screen name="Profile" component={ProfileScreen} />
 *   { name: "Settings", component: SettingsScreen }
 */
const extractNavigationRoutes = (content: string): ReactNativeRoute[] => {
  const routes: ReactNativeRoute[] = [];
  const seen = new Set<string>();

  const addRoute = (name: string, component: string): void => {
    const key = `${name}:${component}`;
    if (!seen.has(key)) {
      seen.add(key);
      routes.push({ name, component });
    }
  };

  // JSX: <Stack.Screen name="Home" component={HomeScreen} />
  for (const m of content.matchAll(
    /<\w+\.Screen\s+[^>]*name\s*=\s*["']([^"']+)["'][^>]*component\s*=\s*\{(\w+)\}/g,
  )) {
    addRoute(m[1]!, m[2]!);
  }
  // JSX reversed attribute order: component first, then name
  for (const m of content.matchAll(
    /<\w+\.Screen\s+[^>]*component\s*=\s*\{(\w+)\}[^>]*name\s*=\s*["']([^"']+)["']/g,
  )) {
    addRoute(m[2]!, m[1]!);
  }
  // Object literal: { name: "Home", component: HomeScreen }
  for (const m of content.matchAll(
    /\{\s*name\s*:\s*["']([^"']+)["']\s*,\s*component\s*:\s*(\w+)/g,
  )) {
    addRoute(m[1]!, m[2]!);
  }

  return routes;
};

// ─── main scan ────────────────────────────────────────────────────────────────

const scanRnProject = async (projectRoot: string): Promise<ReactNativeRaw> => {
  const src = path.join(projectRoot, "src");

  // Detect Expo
  let isExpo = false;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    isExpo = "expo" in deps;
  } catch { /* ignore */ }

  const raw: ReactNativeRaw = {
    framework: "react-native",
    isExpo: isExpo || undefined,
    screens: [],
    components: [],
    navigation: [],
    hooks: [],
    storeFiles: [],
    apiFiles: [],
    typesFiles: [],
  };

  // ── screens ───────────────────────────────────────────────────────────
  const screensDir = path.join(src, "screens");
  for (const f of await walkFiles(screensDir, [".tsx", ".jsx", ".ts", ".js"], IGNORE_DIRS)) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanScreen(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.screens.push(info);
    }
  }

  // ── components ────────────────────────────────────────────────────────
  const componentsDir = path.join(src, "components");
  for (const f of await listFiles(componentsDir, [".tsx", ".jsx"])) {
    const info = await scanComponent(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.components.push(info);
    }
  }

  // ── navigation ────────────────────────────────────────────────────────
  const navDir = path.join(src, "navigation");
  for (const f of await walkFiles(navDir, [".tsx", ".jsx", ".ts", ".js"], IGNORE_DIRS)) {
    const content = await readText(f);
    if (content) {
      raw.navigation.push(...extractNavigationRoutes(content));
    }
  }

  // ── hooks ─────────────────────────────────────────────────────────────
  const hooksDir = path.join(src, "hooks");
  for (const f of await listFiles(hooksDir, [".ts", ".tsx"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.hooks.push(info);
    }
  }

  // ── stores ────────────────────────────────────────────────────────────
  for (const storeDir of [path.join(src, "store"), path.join(src, "stores")]) {
    for (const f of await listFiles(storeDir, [".ts", ".js"])) {
      const info = await scanTsFile(f);
      if (info) {
        info.relPath = relPosix(projectRoot, f);
        raw.storeFiles.push(info);
      }
    }
  }

  // ── api ───────────────────────────────────────────────────────────────
  for (const f of await listFiles(path.join(src, "api"), [".ts", ".js"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.apiFiles.push(info);
    }
  }

  // ── types ─────────────────────────────────────────────────────────────
  for (const f of await listFiles(path.join(src, "types"), [".ts"])) {
    if (f.endsWith(".d.ts")) continue;
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(projectRoot, f);
      raw.typesFiles.push(info);
    }
  }

  return raw;
};

// ─── flatten to symbols ───────────────────────────────────────────────────────

const flattenToSymbols = (raw: ReactNativeRaw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];

  for (const s of raw.screens) {
    symbols.push({
      kind: "page",
      name: s.name,
      file: s.relPath ?? s.file,
      exported: s.exports.includes(s.name),
      framework: "react-native",
      extras: { isScreen: true },
    });
  }

  for (const c of raw.components) {
    symbols.push({
      kind: "component",
      name: c.name,
      file: c.relPath ?? c.file,
      exported: c.exports.includes(c.name),
      framework: "react-native",
    });
  }

  for (const route of raw.navigation) {
    symbols.push({
      kind: "route",
      name: route.name,
      file: "navigation",
      exported: true,
      framework: "react-native",
      extras: { component: route.component },
    });
  }

  for (const s of raw.storeFiles) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "store",
        name: exp,
        file: s.relPath ?? s.file,
        exported: true,
        framework: "react-native",
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
        framework: "react-native",
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
        framework: "react-native",
      });
    }
  }

  return symbols;
};

// ─── adapter factory ──────────────────────────────────────────────────────────

const createReactNativeAdapter = (options: ReactNativeAdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "app";
  return {
    name: "react-native",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        return RN_PKG_HINTS.some((hint) => hint in deps);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanRnProject(modulePath);
      return {
        name: moduleName,
        root: modulePath,
        kind: "frontend",
        symbols: flattenToSymbols(raw),
        raw: raw as unknown as import("@kb-skills/core").ScanRaw,
      };
    },
  };
};

export default createReactNativeAdapter;
export { createReactNativeAdapter };
export type { TsFileInfo };
