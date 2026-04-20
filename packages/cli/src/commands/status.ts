import path from "node:path";
import pc from "picocolors";
import { readStatus } from "@kb-skills/core";
import { loadConfig } from "../config/load";
import type { CAC } from "cac";

interface StatusOptions {
  config?: string;
  cwd?: string;
}

export const registerStatus = (cli: CAC): void => {
  cli
    .command("status", "Show KB generation progress (reads kb/progress.md)")
    .option("--config <path>", "Path to kb-skills.config.ts")
    .option("--cwd <dir>", "Run against a specific directory")
    .action(async (opts: StatusOptions) => {
      const projectRoot = path.resolve(opts.cwd ?? process.cwd());
      const { config } = await loadConfig(opts.config, projectRoot);
      const kbRoot = path.resolve(projectRoot, config.kbRoot ?? "./kb");

      const status = await readStatus(kbRoot);
      if (!status) {
        console.log(pc.yellow(`No progress.md found at ${kbRoot}. Run 'kb-skills run doc-code-to-kb' first.`));
        return;
      }

      console.log(pc.bold(`Progress: ${status.done}/${status.total} (${status.progressPct}%)`));
      if (status.currentModule) console.log(`  current module: ${pc.cyan(status.currentModule)}`);
      console.log();

      for (const [mod, info] of Object.entries(status.modules)) {
        const state = info.remaining === 0 ? pc.green("✔ done") : pc.yellow(`${info.remaining} left`);
        console.log(`  ${pc.bold(mod.padEnd(32))} ${state}`);
        if (info.remaining > 0 && info.remaining <= 10) {
          for (const f of info.remainingFiles) console.log(`      ${pc.gray("· " + f)}`);
        }
      }
    });
};