import type { ScanAdapter } from "@kb-skills/core";

export interface KbSkillsModuleConfig {
  /** Module name, used as the sub-folder under kb/. */
  name: string;
  /** Relative or absolute path to the module root. */
  path: string;
  /** The scan adapter for this module (koa / react / vue3 / ...). */
  adapter: ScanAdapter;
}

export interface KbSkillsConfig {
  /** Where to write the generated KB. Default: "./kb". */
  kbRoot?: string;
  /** One entry per sub-project (server / web / admin / ...). */
  modules: KbSkillsModuleConfig[];
  /** Per-skill option overrides, keyed by skill name. */
  skills?: Record<string, Record<string, unknown>>;
}

/**
 * Type-safe helper for `kb-skills.config.ts`. Zero runtime cost —
 * it simply returns its argument.
 *
 * @example
 *   import { defineConfig } from "@kb-skills/cli/config";
 *   import koaAdapter from "@kb-skills/adapter-koa";
 *   import reactAdapter from "@kb-skills/adapter-react";
 *
 *   export default defineConfig({
 *     kbRoot: "./kb",
 *     modules: [
 *       { name: "server", path: "./server/src", adapter: koaAdapter() },
 *       { name: "web",    path: "./web/src",    adapter: reactAdapter() },
 *     ],
 *   });
 */
export const defineConfig = (config: KbSkillsConfig): KbSkillsConfig => config;