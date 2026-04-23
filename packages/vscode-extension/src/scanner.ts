/**
 * KB Skills VSCode Extension — Project scanner
 *
 * Loads kb-skills.config.ts via jiti and runs each adapter's scan().
 * Returns a flat ScanCache that the TreeDataProvider can consume.
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import type { ScanCache, ScannedModule } from "./types";

// ─── Config file candidates ───────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "kb-skills.config.ts",
  "kb-skills.config.mts",
  "kb-skills.config.js",
  "kb-skills.config.mjs",
  "kb-skills.config.cjs",
];

export const findConfigFile = (
  projectRoot: string,
  explicit?: string,
): string | null => {
  if (explicit) {
    const abs = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(projectRoot, explicit);
    return existsSync(abs) ? abs : null;
  }
  for (const candidate of CONFIG_CANDIDATES) {
    const abs = path.resolve(projectRoot, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
};

// ─── Config shape (minimal — we only need modules[].{name,path,adapter}) ─────

interface ModuleConfig {
  name: string;
  path: string;
  adapter: {
    name: string;
    detect(root: string): Promise<boolean>;
    scan(root: string): Promise<{
      name: string;
      root: string;
      kind: "frontend" | "backend";
      symbols: Array<{
        kind: string;
        name: string;
        file: string;
        signature?: string;
        exported: boolean;
        framework: string;
        extras?: Record<string, unknown>;
      }>;
    }>;
  };
}

interface KbSkillsConfig {
  modules: ModuleConfig[];
  kbRoot?: string;
}

// ─── Main scan function ───────────────────────────────────────────────────────

export const scanProject = async (
  projectRoot: string,
  configFile: string,
  onProgress?: (msg: string) => void,
): Promise<ScanCache> => {
  // Load config via jiti (handles TS, ESM, CJS transparently)
  const jiti = createJiti(configFile, {
    interopDefault: true,
    moduleCache: false,
  });

  const raw = (await jiti.import(configFile)) as
    | KbSkillsConfig
    | { default: KbSkillsConfig };

  const config: KbSkillsConfig =
    "modules" in (raw as KbSkillsConfig)
      ? (raw as KbSkillsConfig)
      : (raw as { default: KbSkillsConfig }).default;

  if (!config || !Array.isArray(config.modules)) {
    throw new Error(`无效的 kb-skills 配置文件: ${configFile}`);
  }

  const scannedModules: ScannedModule[] = [];

  for (const mod of config.modules) {
    const modulePath = path.isAbsolute(mod.path)
      ? mod.path
      : path.resolve(projectRoot, mod.path);

    onProgress?.(`正在扫描模块: ${mod.name}...`);

    try {
      const result = await mod.adapter.scan(modulePath);
      const framework =
        result.symbols.length > 0 ? result.symbols[0]!.framework : mod.adapter.name;

      scannedModules.push({
        name: mod.name,
        root: modulePath,
        kind: result.kind,
        framework,
        symbols: result.symbols.map((s) => ({
          kind: s.kind as import("@kb-skills/core").SymbolKind,
          name: s.name,
          file: s.file,
          signature: s.signature,
          exported: s.exported,
          framework: s.framework,
          extras: s.extras,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Push a module with no symbols but preserve the error info
      scannedModules.push({
        name: mod.name,
        root: modulePath,
        kind: "backend",
        framework: "unknown",
        symbols: [],
      });
      onProgress?.(`⚠ 模块 ${mod.name} 扫描失败: ${message}`);
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    modules: scannedModules,
  };
};
