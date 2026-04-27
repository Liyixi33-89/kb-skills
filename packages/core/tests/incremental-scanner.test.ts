/**
 * incremental-scanner.test.ts — 测试增量扫描引擎
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  collectModuleFiles,
  computeIncrementalDiff,
  buildNewCache,
  loadIncrementalCache,
  saveIncrementalCache,
} from "../src/incremental-scanner";
import type { IncrementalScanCache } from "../src/types";

// ─── 测试用临时目录 ───────────────────────────────────────────────────────────

let tmpDir: string;
let moduleDir: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await mkTempDir();
  projectRoot = tmpDir;
  moduleDir = path.join(tmpDir, "src");
  await mkdir(moduleDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const mkTempDir = async (): Promise<string> => {
  const base = path.join(os.tmpdir(), `kb-skills-test-${Date.now()}`);
  await mkdir(base, { recursive: true });
  return base;
};

const writeTs = async (dir: string, name: string, content = "export const x = 1;"): Promise<string> => {
  const filePath = path.join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
};

// ─── collectModuleFiles ───────────────────────────────────────────────────────

describe("collectModuleFiles", () => {
  it("应收集 .ts/.tsx/.vue 文件", async () => {
    await writeTs(moduleDir, "a.ts");
    await writeTs(moduleDir, "b.tsx");
    await writeTs(moduleDir, "c.vue");
    await writeTs(moduleDir, "d.js");

    const files = await collectModuleFiles(moduleDir);
    const names = files.map((f) => path.basename(f));
    expect(names).toContain("a.ts");
    expect(names).toContain("b.tsx");
    expect(names).toContain("c.vue");
    expect(names).toContain("d.js");
  });

  it("应忽略 .d.ts 和 .test.ts 文件", async () => {
    await writeTs(moduleDir, "index.d.ts");
    await writeTs(moduleDir, "foo.test.ts");
    await writeTs(moduleDir, "bar.spec.ts");
    await writeTs(moduleDir, "real.ts");

    const files = await collectModuleFiles(moduleDir);
    const names = files.map((f) => path.basename(f));
    expect(names).not.toContain("index.d.ts");
    expect(names).not.toContain("foo.test.ts");
    expect(names).not.toContain("bar.spec.ts");
    expect(names).toContain("real.ts");
  });

  it("应忽略 node_modules 和 dist 目录", async () => {
    const nodeModules = path.join(moduleDir, "node_modules");
    const dist = path.join(moduleDir, "dist");
    await mkdir(nodeModules, { recursive: true });
    await mkdir(dist, { recursive: true });
    await writeTs(nodeModules, "pkg.ts");
    await writeTs(dist, "bundle.ts");
    await writeTs(moduleDir, "source.ts");

    const files = await collectModuleFiles(moduleDir);
    const names = files.map((f) => path.basename(f));
    expect(names).not.toContain("pkg.ts");
    expect(names).not.toContain("bundle.ts");
    expect(names).toContain("source.ts");
  });

  it("空目录应返回空数组", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await mkdir(emptyDir, { recursive: true });
    const files = await collectModuleFiles(emptyDir);
    expect(files).toEqual([]);
  });
});

// ─── computeIncrementalDiff ───────────────────────────────────────────────────

describe("computeIncrementalDiff", () => {
  it("无旧缓存时，所有模块都应标记为需要重扫", async () => {
    await writeTs(moduleDir, "a.ts");
    const modulePathMap = { server: moduleDir };

    const diff = await computeIncrementalDiff(projectRoot, modulePathMap, null);

    expect(diff.modulesToRescan).toContain("server");
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.modified).toEqual([]);
    expect(diff.deleted).toEqual([]);
  });

  it("文件无变更时，modulesToRescan 应为空", async () => {
    await writeTs(moduleDir, "a.ts");
    const modulePathMap = { server: moduleDir };

    // 先构建一次缓存
    const cache = await buildNewCache(projectRoot, modulePathMap, true, null);

    // 再次 diff，无变更
    const diff = await computeIncrementalDiff(projectRoot, modulePathMap, cache);

    expect(diff.modulesToRescan).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.deleted).toEqual([]);
    expect(diff.unchanged.length).toBeGreaterThan(0);
  });

  it("新增文件时，对应模块应标记为需要重扫", async () => {
    await writeTs(moduleDir, "a.ts");
    const modulePathMap = { server: moduleDir };

    // 先构建缓存
    const cache = await buildNewCache(projectRoot, modulePathMap, true, null);

    // 新增文件
    await writeTs(moduleDir, "b.ts");

    const diff = await computeIncrementalDiff(projectRoot, modulePathMap, cache);

    expect(diff.added.some((f) => f.endsWith("b.ts"))).toBe(true);
    expect(diff.modulesToRescan).toContain("server");
  });

  it("修改文件时，对应模块应标记为需要重扫", async () => {
    await writeTs(moduleDir, "a.ts", "export const x = 1;");
    const modulePathMap = { server: moduleDir };

    // 先构建缓存
    const cache = await buildNewCache(projectRoot, modulePathMap, true, null);

    // 等待 1ms 确保 mtime 变化，然后修改文件
    await new Promise((r) => setTimeout(r, 10));
    await writeTs(moduleDir, "a.ts", "export const x = 2; // modified");

    const diff = await computeIncrementalDiff(projectRoot, modulePathMap, cache);

    expect(diff.modified.some((f) => f.endsWith("a.ts"))).toBe(true);
    expect(diff.modulesToRescan).toContain("server");
  });

  it("多模块时，只有变更模块应被标记", async () => {
    const frontendDir = path.join(tmpDir, "frontend");
    await mkdir(frontendDir, { recursive: true });
    await writeTs(moduleDir, "api.ts");
    await writeTs(frontendDir, "app.tsx");

    const modulePathMap = { server: moduleDir, frontend: frontendDir };

    // 先构建缓存
    const cache = await buildNewCache(projectRoot, modulePathMap, true, null);

    // 只修改 server 模块
    await new Promise((r) => setTimeout(r, 10));
    await writeTs(moduleDir, "new-service.ts");

    const diff = await computeIncrementalDiff(projectRoot, modulePathMap, cache);

    expect(diff.modulesToRescan).toContain("server");
    expect(diff.modulesToRescan).not.toContain("frontend");
  });
});

// ─── saveIncrementalCache / loadIncrementalCache ──────────────────────────────

describe("saveIncrementalCache / loadIncrementalCache", () => {
  it("应正确持久化并读取缓存", async () => {
    const cache: IncrementalScanCache = {
      version: 1,
      lastFullScanAt: "2026-04-27T00:00:00.000Z",
      lastIncrementalAt: "2026-04-27T01:00:00.000Z",
      fileHashes: {
        "/path/to/file.ts": {
          file: "/path/to/file.ts",
          hash: "abc123",
          mtime: 1714176000000,
        },
      },
    };

    await saveIncrementalCache(projectRoot, cache);
    const loaded = await loadIncrementalCache(projectRoot);

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.lastFullScanAt).toBe("2026-04-27T00:00:00.000Z");
    expect(loaded!.fileHashes["/path/to/file.ts"]!.hash).toBe("abc123");
  });

  it("缓存文件不存在时应返回 null", async () => {
    const result = await loadIncrementalCache(projectRoot);
    expect(result).toBeNull();
  });

  it("版本不匹配时应返回 null（触发缓存清除）", async () => {
    const oldCache = {
      version: 0, // 旧版本
      lastFullScanAt: "2026-01-01T00:00:00.000Z",
      lastIncrementalAt: "2026-01-01T00:00:00.000Z",
      fileHashes: {},
    };
    await saveIncrementalCache(projectRoot, oldCache as IncrementalScanCache);
    const loaded = await loadIncrementalCache(projectRoot);
    expect(loaded).toBeNull();
  });
});
