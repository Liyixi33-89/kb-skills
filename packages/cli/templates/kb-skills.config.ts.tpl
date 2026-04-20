/**
 * kb-skills configuration
 *
 * Docs: https://github.com/Liyixi33-89/kb-skills
 */
import { defineConfig } from "@kb-skills/cli/config";
{{ADAPTER_IMPORTS}}

export default defineConfig({
  kbRoot: "./kb",
  modules: [
{{MODULE_ENTRIES}}
  ],
});