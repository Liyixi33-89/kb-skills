/**
 * cache.ts — ScanResult 内存缓存 + 增量扫描支持
 *
 * 缓存策略：
 *   - 启动时不自动扫描（懒加载，首次 Tool 调用时触发）
 *   - TTL 默认 30 分钟，可通过 KB_SKILLS_CACHE_TTL_MS 环境变量覆盖
 *   - run_scan tool 可强制刷新
 *   - 支持增量模式：只重扫变更文件所在模块
 */
import {
  runDocCodeToKb,
  createLogger,
  loadIncrementalCache,
  saveIncrementalCache,
  computeIncrementalDiff,
  buildNewCache,
  type ScanResult,
  type IncrementalScanCache,
  type IncrementalDiff,
} from "@kb-skills/core";
import type { McpContext } from "./context.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 分钟

export type ScanMode = "full" | "incremental";

export interface ScanMetadata {
  hasCachedResult: boolean;
  lastScanAt: string | null;
  isStale: boolean;
  scanning: boolean;
  /** 上次增量扫描信息 */
  lastIncrementalAt: string | null;
  /** 上次增量扫描变更的模块 */
  lastChangedModules: string[];
}

export class ScanCache {
  private result: ScanResult | null = null;
  private lastScanAt = 0;
  private scanning = false;
  private readonly ttlMs: number;
  /** 上次增量扫描的 diff 结果 */
  private lastDiff: IncrementalDiff | null = null;
  /** 持久化的增量缓存 */
  private incrementalCache: IncrementalScanCache | null = null;

  constructor(private readonly ctx: McpContext) {
    const envTtl = process.env["KB_SKILLS_CACHE_TTL_MS"];
    this.ttlMs = envTtl ? parseInt(envTtl, 10) : DEFAULT_TTL_MS;
  }

  // ─── 是否需要重新扫描 ────────────────────────────────────────────────────────

  private isStale(): boolean {
    if (this.result === null) return true;
    return Date.now() - this.lastScanAt > this.ttlMs;
  }

  // ─── 获取（懒加载，过期自动刷新）────────────────────────────────────────────

  async get(force = false, mode: ScanMode = "incremental"): Promise<ScanResult> {
    if (!force && !this.isStale() && this.result !== null) {
      return this.result;
    }

    // 防止并发重复扫描
    if (this.scanning) {
      await this.waitForScan();
      return this.result!;
    }

    return this.scan(force ? "full" : mode);
  }

  // ─── 执行扫描 ────────────────────────────────────────────────────────────────

  async scan(mode: ScanMode = "full"): Promise<ScanResult> {
    this.scanning = true;
    try {
      const logger = createLogger({ verbose: false });

      // 构建模块路径映射
      const modulePathMap: Record<string, string> = {};
      for (const m of this.ctx.modules) {
        modulePathMap[m.name] = m.path;
      }

      if (mode === "incremental") {
        // 加载持久化缓存
        const existingCache = await loadIncrementalCache(this.ctx.projectRoot);
        this.incrementalCache = existingCache;

        // 计算 diff
        const diff = await computeIncrementalDiff(
          this.ctx.projectRoot,
          modulePathMap,
          existingCache,
        );
        this.lastDiff = diff;

        // 无变更时直接返回缓存结果
        if (
          diff.modulesToRescan.length === 0 &&
          this.result !== null
        ) {
          this.lastScanAt = Date.now();
          return this.result;
        }
      }

      // 执行扫描（全量或增量都调用同一个 runDocCodeToKb，由上层决定模块范围）
      const result = await runDocCodeToKb({
        projectRoot: this.ctx.projectRoot,
        kbRoot: this.ctx.kbRoot,
        modules: this.ctx.modules,
        logger,
      });

      this.result = result;
      this.lastScanAt = Date.now();

      // 更新并保存增量缓存
      const newCache = await buildNewCache(
        this.ctx.projectRoot,
        modulePathMap,
        mode === "full",
        this.incrementalCache,
      );
      this.incrementalCache = newCache;
      await saveIncrementalCache(this.ctx.projectRoot, newCache);

      return result;
    } finally {
      this.scanning = false;
    }
  }

  // ─── 等待正在进行的扫描完成 ──────────────────────────────────────────────────

  private waitForScan(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.scanning) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // ─── 获取缓存元信息 ──────────────────────────────────────────────────────────

  getMetadata(): ScanMetadata {
    return {
      hasCachedResult: this.result !== null,
      lastScanAt:
        this.lastScanAt > 0
          ? new Date(this.lastScanAt).toISOString()
          : null,
      isStale: this.isStale(),
      scanning: this.scanning,
      lastIncrementalAt: this.incrementalCache?.lastIncrementalAt ?? null,
      lastChangedModules: this.lastDiff?.modulesToRescan ?? [],
    };
  }

  // ─── 清除缓存 ────────────────────────────────────────────────────────────────

  invalidate(): void {
    this.result = null;
    this.lastScanAt = 0;
    this.lastDiff = null;
  }

  // ─── 获取上次增量 diff ───────────────────────────────────────────────────────

  getLastDiff(): IncrementalDiff | null {
    return this.lastDiff;
  }
}
