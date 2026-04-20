import path from "node:path";
import pc from "picocolors";
import { createLogger, runDocCodeToKb } from "@kb-skills/core";
import { loadConfig } from "../config/load";
import type { CAC } from "cac";

interface RunOptions {
  config?: string;
  cwd?: string;
  verbose?: boolean;
}

export const registerRun = (cli: CAC): void => {
  cli
    .command("run <skill>", "Run a Skill against the current project")
    .option("--config <path>", "Path to kb-skills.config.ts")
    .option("--cwd <dir>", "Run against a specific directory")
    .option("-v, --verbose", "Verbose debug logging")
    .action(async (skill: string, opts: RunOptions) => {
      const projectRoot = path.resolve(opts.cwd ?? process.cwd());
      const logger = createLogger({ verbose: !!opts.verbose });

      if (skill !== "doc-code-to-kb") {
        logger.warn(`Skill "${skill}" is recognized but not yet wired in MVP.`);
        logger.info(`Currently implemented: ${pc.cyan("doc-code-to-kb")}`);
        return;
      }

      const { config, configFile } = await loadConfig(opts.config, projectRoot);
      logger.info(`Using config: ${path.relative(projectRoot, configFile)}`);

      const kbRoot = path.resolve(projectRoot, config.kbRoot ?? "./kb");
      const modules = config.modules.map((m) => ({
        name: m.name,
        path: path.resolve(projectRoot, m.path),
        adapter: m.adapter,
      }));

      await runDocCodeToKb({ projectRoot, kbRoot, modules, logger });
      logger.success(`Done. Browse your KB at ${pc.cyan(path.relative(projectRoot, kbRoot))}/`);
    });
};