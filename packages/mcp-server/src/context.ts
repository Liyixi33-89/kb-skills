/**
 * context.ts — 加载 kb-skills.config.ts 并构建运行上下文
 *
 * 直接复用 @kb-skills/cli 内部的 loadConfig（通过 workspace 内部路径），
 * 避免重复实现 jiti 配置解析逻辑。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import type { ScanAdapter } from "@kb-skills/core";

// ─── Config 类型（与 @kb-skills/cli/config 保持一致）────────────────────────

export interface KbSkillsModuleConfig {
  name: string;
  path: string;
  adapter: ScanAdapter;
}

export interface KbSkillsConfig {
  kbRoot?: string;
  modules: KbSkillsModuleConfig[];
  skills?: Record<string, Record<string, unknown>>;
}

export interface McpContext {
  projectRoot: string;
  kbRoot: string;
  configFile: string;
  modules: Array<{
    name: string;
    path: string;
    adapter: ScanAdapter;
  }>;
  rawConfig: KbSkillsConfig;
}

// ─── Config 文件候选列表 ──────────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "kb-skills.config.ts",
  "kb-skills.config.mts",
  "kb-skills.config.js",
  "kb-skills.config.mjs",
  "kb-skills.config.cjs",
];

const findConfigFile = (
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

// ─── 加载配置 ─────────────────────────────────────────────────────────────────

export const loadMcpContext = async (
  projectRoot: string,
  configPath?: string,
): Promise<McpContext> => {
  const resolved = findConfigFile(projectRoot, configPath);
  if (!resolved) {
    throw new Error(
      `kb-skills.config.* not found in ${projectRoot}. Run "kb-skills init" first.`,
    );
  }

  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    moduleCache: false,
  });

  const mod = (await jiti.import(resolved)) as
    | KbSkillsConfig
    | { default: KbSkillsConfig };

  const config =
    "modules" in (mod as KbSkillsConfig)
      ? (mod as KbSkillsConfig)
      : (mod as { default: KbSkillsConfig }).default;

  if (!config || !Array.isArray(config.modules)) {
    throw new Error(
      `Invalid config at ${resolved}: expected { modules: [...] }.`,
    );
  }

  const kbRoot = path.resolve(projectRoot, config.kbRoot ?? "./kb");
  const modules = config.modules.map((m) => ({
    name: m.name,
    path: path.resolve(projectRoot, m.path),
    adapter: m.adapter,
  }));

  return {
    projectRoot,
    kbRoot,
    configFile: resolved,
    modules,
    rawConfig: config,
  };
};
