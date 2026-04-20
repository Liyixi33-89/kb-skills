import path from "node:path";
import pc from "picocolors";
import { verifyKb } from "@kb-skills/core";
import { loadConfig } from "../config/load";
import type { CAC } from "cac";

interface VerifyOptions {
  config?: string;
  cwd?: string;
  json?: boolean;
}

export const registerVerify = (cli: CAC): void => {
  cli
    .command("verify", "Verify KB coverage against progress.md")
    .option("--config <path>", "Path to kb-skills.config.ts")
    .option("--cwd <dir>", "Run against a specific directory")
    .option("--json", "Output the raw JSON report")
    .action(async (opts: VerifyOptions) => {
      const projectRoot = path.resolve(opts.cwd ?? process.cwd());
      const { config } = await loadConfig(opts.config, projectRoot);
      const kbRoot = path.resolve(projectRoot, config.kbRoot ?? "./kb");

      const report = await verifyKb(kbRoot);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== "pass") process.exit(1);
        return;
      }

      const color = report.status === "pass" ? pc.green : report.status === "error" ? pc.red : pc.yellow;
      console.log(color(pc.bold(`Status: ${report.status.toUpperCase()}`)));
      console.log(`  modules:           ${report.summary.totalModules}`);
      console.log(`  missing files:     ${report.summary.totalMissingFiles}`);
      console.log(`  progress pending:  ${report.summary.progressRemaining}`);
      console.log(`  format issues:     ${report.summary.formatIssues}`);
      console.log();
      console.log(pc.gray(report.recommendation));

      if (report.missingFiles.length > 0) {
        console.log();
        console.log(pc.bold("Missing files:"));
        for (const f of report.missingFiles.slice(0, 20)) console.log(`  ${pc.red("✖")} ${f}`);
        if (report.missingFiles.length > 20) console.log(pc.gray(`  ... and ${report.missingFiles.length - 20} more`));
      }

      if (report.status !== "pass") process.exit(1);
    });
};