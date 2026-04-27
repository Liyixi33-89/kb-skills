/**
 * run-scan.ts — Tool: run_scan
 *
 * 触发重新扫描项目，刷新 ScanResult 缓存并重新生成 KB 文件。
 * 支持全量扫描（full）和增量扫描（incremental）两种模式。
 */
import type { ScanCache, ScanMode } from "../cache.js";

export interface RunScanInput {
  force?: boolean;
  mode?: ScanMode;
}

export interface RunScanResult {
  success: boolean;
  mode: ScanMode;
  modulesScanned: number;
  symbolsFound: number;
  scannedAt: string;
  message: string;
  /** 增量模式下变更的模块列表 */
  changedModules?: string[];
  /** 增量模式下各类文件变更数量 */
  diffSummary?: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
  };
  error?: string;
}

export const runScan = async (
  cache: ScanCache,
  input: RunScanInput,
): Promise<RunScanResult> => {
  const { force = false, mode = "incremental" } = input;
  const effectiveMode: ScanMode = force ? "full" : mode;

  try {
    const result = await cache.get(force, effectiveMode);
    const diff = cache.getLastDiff();

    const symbolsFound = result.modules.reduce(
      (sum, m) => sum + m.symbols.length,
      0,
    );

    const changedModules = diff?.modulesToRescan ?? [];
    const isIncremental = effectiveMode === "incremental";

    const modeLabel = isIncremental ? "增量" : "全量";
    const changeInfo =
      isIncremental && changedModules.length > 0
        ? `，变更模块：${changedModules.join(", ")}`
        : isIncremental && changedModules.length === 0
          ? "（无变更，使用缓存）"
          : "";

    return {
      success: true,
      mode: effectiveMode,
      modulesScanned: result.modules.length,
      symbolsFound,
      scannedAt: result.scannedAt,
      message: `${modeLabel}扫描完成：${result.modules.length} 个模块，${symbolsFound} 个符号${changeInfo}`,
      changedModules,
      diffSummary: diff
        ? {
            added: diff.added.length,
            modified: diff.modified.length,
            deleted: diff.deleted.length,
            unchanged: diff.unchanged.length,
          }
        : undefined,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      mode: effectiveMode,
      modulesScanned: 0,
      symbolsFound: 0,
      scannedAt: new Date().toISOString(),
      message: "扫描失败",
      error,
    };
  }
};
