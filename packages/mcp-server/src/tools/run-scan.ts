/**
 * run-scan.ts — Tool: run_scan
 *
 * 触发重新扫描项目，刷新 ScanResult 缓存并重新生成 KB 文件。
 */
import type { ScanCache } from "../cache.js";

export interface RunScanInput {
  force?: boolean;
}

export interface RunScanResult {
  success: boolean;
  modulesScanned: number;
  symbolsFound: number;
  scannedAt: string;
  message: string;
  error?: string;
}

export const runScan = async (
  cache: ScanCache,
  input: RunScanInput,
): Promise<RunScanResult> => {
  const { force = true } = input;

  try {
    const result = await cache.get(force);

    const symbolsFound = result.modules.reduce(
      (sum, m) => sum + m.symbols.length,
      0,
    );

    return {
      success: true,
      modulesScanned: result.modules.length,
      symbolsFound,
      scannedAt: result.scannedAt,
      message: `扫描完成：${result.modules.length} 个模块，${symbolsFound} 个符号`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      modulesScanned: 0,
      symbolsFound: 0,
      scannedAt: new Date().toISOString(),
      message: "扫描失败",
      error,
    };
  }
};
