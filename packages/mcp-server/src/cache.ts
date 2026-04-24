/**
 * cache.ts — ScanResult 内存缓存
 *
 * 避免每次 MCP Tool 调用都重新扫描整个项目。
 * 缓存策略：
 *   - 启动时不自动扫描（懒加载，首次 Tool 调用时触发）
 *   - TTL 默认 30 分钟，可通过 KB_SKILLS_CACHE_TTL_MS 环境变量覆盖
 *   - run_scan tool 可强制刷新
 */
import {
  runDocCodeToKb,
  createLogger,
  type ScanResult,
} from "@kb-skills/core";
import type { McpContext } from "./context.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 分钟

export class ScanCache {
  private result: ScanResult | null = null;
  private lastScanAt = 0;
  private scanning = false;
  private readonly ttlMs: number;

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

  async get(force = false): Promise<ScanResult> {
    if (!force && !this.isStale() && this.result !== null) {
      return this.result;
    }

    // 防止并发重复扫描
    if (this.scanning) {
      // 等待当前扫描完成后返回结果
      await this.waitForScan();
      return this.result!;
    }

    return this.scan();
  }

  // ─── 执行扫描 ────────────────────────────────────────────────────────────────

  async scan(): Promise<ScanResult> {
    this.scanning = true;
    try {
      const logger = createLogger({ verbose: false });
      const result = await runDocCodeToKb({
        projectRoot: this.ctx.projectRoot,
        kbRoot: this.ctx.kbRoot,
        modules: this.ctx.modules,
        logger,
      });
      this.result = result;
      this.lastScanAt = Date.now();
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

  getMetadata(): {
    hasCachedResult: boolean;
    lastScanAt: string | null;
    isStale: boolean;
    scanning: boolean;
  } {
    return {
      hasCachedResult: this.result !== null,
      lastScanAt:
        this.lastScanAt > 0
          ? new Date(this.lastScanAt).toISOString()
          : null,
      isStale: this.isStale(),
      scanning: this.scanning,
    };
  }

  // ─── 清除缓存 ────────────────────────────────────────────────────────────────

  invalidate(): void {
    this.result = null;
    this.lastScanAt = 0;
  }
}
