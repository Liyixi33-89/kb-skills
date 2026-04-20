/**
 * Loads user's `kb-skills.config.ts` (or .js/.mjs) at runtime using jiti
 * so that the CLI doesn't require users to pre-compile their config.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
import type { KbSkillsConfig } from "./define";

const CONFIG_CANDIDATES = [
  "kb-skills.config.ts",
  "kb-skills.config.mts",
  "kb-skills.config.js",
  "kb-skills.config.mjs",
  "kb-skills.config.cjs",
];

export interface LoadedConfig {
  config: KbSkillsConfig;
  configFile: string;
  projectRoot: string;
}

export const findConfigFile = (explicit: string | undefined, projectRoot: string): string | null => {
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.resolve(projectRoot, explicit);
    return existsSync(abs) ? abs : null;
  }
  for (const candidate of CONFIG_CANDIDATES) {
    const abs = path.resolve(projectRoot, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
};

export const loadConfig = async (
  configPath: string | undefined,
  projectRoot: string,
): Promise<LoadedConfig> => {
  const resolved = findConfigFile(configPath, projectRoot);
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
    throw new Error(`Invalid config at ${resolved}: expected { modules: [...] }.`);
  }

  return { config, configFile: resolved, projectRoot };
};