/**
 * incremental-scanner.ts — 增量扫描引擎
 *
 * 通过对比文件 mtime（修改时间）快速判断哪些文件发生了变更，
 * 只对变更文件所在模块触发重扫，大幅减少全量扫描耗时。
 *
 * 缓存文件：<projectRoot>/.kb-skills/scan-cache.json
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  FileHashRecord,
  IncrementalDiff,
  IncrementalScanCache,
} from "./types.js";

const CACHE_VERSION = 1;
const CACHE_DIR = ".kb-skills";
const CACHE_FILE = "scan-cache.json";

// ─── 缓存文件路径 ─────────────────────────────────────────────────────────────

const getCachePath = (projectRoot: string): string =>
  path.join(projectRoot, CACHE_DIR, CACHE_FILE);

// ─── 读取持久化缓存 ───────────────────────────────────────────────────────────

export const loadIncrementalCache = async (
  projectRoot: string,
): Promise<IncrementalScanCache | null> => {
  const cachePath = getCachePath(projectRoot);
  if (!existsSync(cachePath)) return null;

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as IncrementalScanCache;
    // 版本不匹配时清除旧缓存
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

// ─── 保存持久化缓存 ───────────────────────────────────────────────────────────

export const saveIncrementalCache = async (
  projectRoot: string,
  cache: IncrementalScanCache,
): Promise<void> => {
  const cacheDir = path.join(projectRoot, CACHE_DIR);
  if (!existsSync(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }
  const cachePath = getCachePath(projectRoot);
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
};

// ─── 计算文件 hash（基于 mtime，避免读取大文件内容）────────────────────────────

/**
 * 使用 mtime + 文件大小作为轻量 hash，避免读取全部文件内容。
 * 对于需要精确 hash 的场景，可传 precise=true 使用 SHA-256。
 */
const computeFileHash = async (
  filePath: string,
  precise = false,
): Promise<FileHashRecord | null> => {
  try {
    const stats = await stat(filePath);
    const mtime = stats.mtimeMs;

    if (!precise) {
      // 轻量模式：mtime + size 组合作为 hash
      const hash = createHash("sha256")
        .update(`${mtime}:${stats.size}`)
        .digest("hex")
        .slice(0, 16);
      return { file: filePath, hash, mtime };
    }

    // 精确模式：读取文件内容计算 SHA-256
    const content = await readFile(filePath);
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    return { file: filePath, hash, mtime };
  } catch {
    return null;
  }
};

// ─── 扫描模块目录，收集所有源文件 ────────────────────────────────────────────

const SOURCE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.vue",
];

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.kb-skills/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/*.test.ts",
  "**/*.spec.ts",
];

export const collectModuleFiles = async (modulePath: string): Promise<string[]> => {
  const files = await fg(SOURCE_PATTERNS, {
    cwd: modulePath,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  });
  return files.sort();
};

// ─── 核心：计算增量 diff ──────────────────────────────────────────────────────

export interface ModulePathMap {
  /** 模块名称 → 模块绝对路径 */
  [moduleName: string]: string;
}

/**
 * 分析哪些文件发生了变更，返回 IncrementalDiff
 */
export const computeIncrementalDiff = async (
  _projectRoot: string,
  modulePathMap: ModulePathMap,
  existingCache: IncrementalScanCache | null,
): Promise<IncrementalDiff> => {
  const diff: IncrementalDiff = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
    modulesToRescan: [],
  };

  const oldHashes = existingCache?.fileHashes ?? {};
  const newHashes: Record<string, FileHashRecord> = {};

  // 收集所有模块的当前文件
  const moduleFileMap: Record<string, string[]> = {};
  for (const [moduleName, modulePath] of Object.entries(modulePathMap)) {
    const files = await collectModuleFiles(modulePath);
    moduleFileMap[moduleName] = files;
    for (const file of files) {
      const record = await computeFileHash(file);
      if (record) newHashes[file] = record;
    }
  }

  // 对比新旧 hash
  const allCurrentFiles = new Set(Object.keys(newHashes));
  const allOldFiles = new Set(Object.keys(oldHashes));

  for (const file of allCurrentFiles) {
    const newRecord = newHashes[file]!;
    const oldRecord = oldHashes[file];
    if (!oldRecord) {
      diff.added.push(file);
    } else if (oldRecord.hash !== newRecord.hash) {
      diff.modified.push(file);
    } else {
      diff.unchanged.push(file);
    }
  }

  for (const file of allOldFiles) {
    if (!allCurrentFiles.has(file)) {
      diff.deleted.push(file);
    }
  }

  // 确定需要重扫的模块
  const changedFiles = new Set([...diff.added, ...diff.modified, ...diff.deleted]);
  for (const [moduleName, files] of Object.entries(moduleFileMap)) {
    const hasChange = files.some((f) => changedFiles.has(f));
    if (hasChange) {
      diff.modulesToRescan.push(moduleName);
    }
  }

  // 如果没有旧缓存，所有模块都需要重扫
  if (!existingCache) {
    diff.modulesToRescan = Object.keys(modulePathMap);
  }

  return diff;
};

// ─── 构建新的缓存快照 ─────────────────────────────────────────────────────────

export const buildNewCache = async (
  _projectRoot: string,
  modulePathMap: ModulePathMap,
  isFullScan: boolean,
  existingCache: IncrementalScanCache | null,
): Promise<IncrementalScanCache> => {
  const now = new Date().toISOString();
  const fileHashes: Record<string, FileHashRecord> = {
    ...(existingCache?.fileHashes ?? {}),
  };

  for (const modulePath of Object.values(modulePathMap)) {
    const files = await collectModuleFiles(modulePath);
    for (const file of files) {
      const record = await computeFileHash(file);
      if (record) fileHashes[file] = record;
    }
  }

  // 清理已删除文件的缓存记录
  const allFiles = new Set(
    (
      await Promise.all(
        Object.values(modulePathMap).map(collectModuleFiles),
      )
    ).flat(),
  );
  for (const key of Object.keys(fileHashes)) {
    if (!allFiles.has(key)) delete fileHashes[key];
  }

  return {
    version: CACHE_VERSION,
    lastFullScanAt: isFullScan ? now : (existingCache?.lastFullScanAt ?? now),
    lastIncrementalAt: now,
    fileHashes,
  };
};
