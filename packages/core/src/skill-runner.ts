/**
 * Skill Runner — orchestrates scan → write → progress for the doc-code-to-kb skill.
 *
 * This is the beating heart of the `kb-skills run <skill>` command.
 */
import path from "node:path";
import { writeKb } from "./kb-writer";
import { initProgress, markDone } from "./progress";
import type { Logger, ModuleInfo, ScanAdapter, ScanResult } from "./types";

export interface RunnerModule {
  name: string;
  path: string;
  adapter: ScanAdapter;
}

export interface RunDocToKbOptions {
  projectRoot: string;
  kbRoot: string;
  modules: RunnerModule[];
  logger: Logger;
}

/** 模块扫描失败的错误信息 */
export interface ModuleScanError {
  module: string;
  error: Error;
}

export const runDocCodeToKb = async (opts: RunDocToKbOptions): Promise<ScanResult> => {
  const { projectRoot, kbRoot, modules, logger } = opts;

  if (modules.length === 0) {
    throw new Error("No modules configured. Check your kb-skills.config.ts.");
  }

  logger.info(`Scanning ${modules.length} module(s)...`);

  const scannedModules: ModuleInfo[] = [];
  const scanErrors: ModuleScanError[] = [];

  for (const m of modules) {
    const modulePath = path.resolve(projectRoot, m.path);
    logger.debug(`  scan [${m.adapter.name}] ${m.name} -> ${modulePath}`);
    try {
      const info = await m.adapter.scan(modulePath);
      // Override name so KB dir matches user config.
      info.name = m.name;
      scannedModules.push(info);
      logger.success(`scanned ${m.name} (${info.symbols.length} symbols)`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      scanErrors.push({ module: m.name, error });
      logger.error(
        `Failed to scan module "${m.name}" [${m.adapter.name}]: ${error.message}`,
      );
      // 继续扫描其他模块，不中断整体流程
    }
  }

  // 如果所有模块都扫描失败，抛出聚合错误
  if (scannedModules.length === 0 && scanErrors.length > 0) {
    const messages = scanErrors
      .map((e) => `  - ${e.module}: ${e.error.message}`)
      .join("\n");
    throw new Error(
      `All ${scanErrors.length} module(s) failed to scan:\n${messages}`,
    );
  }

  if (scanErrors.length > 0) {
    logger.warn(
      `${scanErrors.length} module(s) failed, ${scannedModules.length} succeeded. Continuing with successful modules.`,
    );
  }

  const scan: ScanResult = {
    projectRoot,
    modules: scannedModules,
    relations: [],
    scannedAt: new Date().toISOString(),
  };

  logger.info(`Initializing progress at ${kbRoot}/progress.md ...`);
  const { totalFiles } = await initProgress({ kbRoot, scan });
  logger.success(`progress.md created — ${totalFiles} expected files`);

  logger.info("Writing KB markdown files...");
  await writeKb({
    scan,
    kbRoot,
    onFileWritten: async (relPath) => {
      logger.debug(`  wrote ${relPath}`);
      await markDone(kbRoot, relPath);
    },
  });
  logger.success("KB generation complete.");

  return scan;
};