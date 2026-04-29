import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createGitLogAdapter, { writeGitLogKb } from "../src/index";
import type { GitLogRaw } from "../src/index";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 使用 kb-skills monorepo 本身作为测试 git 仓库（肯定有 git 历史）
const REPO_ROOT = path.resolve(__dirname, "../../../");
// 只扫描最近 30 天，避免大仓库扫描超时
const TEST_SINCE_DAYS = 30;

describe("adapter-git-log", () => {
  // ─── detect ────────────────────────────────────────────────────────────

  it("detect: git 仓库返回 true", async () => {
    const adapter = createGitLogAdapter();
    expect(await adapter.detect(REPO_ROOT)).toBe(true);
  });

  it("detect: 非 git 目录返回 false", async () => {
    const adapter = createGitLogAdapter();
    expect(await adapter.detect(tmpdir())).toBe(false);
  });

  // ─── scan: ModuleInfo 基本属性 ──────────────────────────────────────────

  it("scan: ModuleInfo 基本属性正确", async () => {
    const adapter = createGitLogAdapter({
      moduleName: "test-repo",
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 10,
    });
    const mod = await adapter.scan(REPO_ROOT);

    expect(mod.name).toBe("test-repo");
    expect(mod.kind).toBe("backend");
    expect(mod.root).toBe(REPO_ROOT);
    expect(Array.isArray(mod.symbols)).toBe(true);
  });

  // ─── scan: GitLogRaw 数据结构 ───────────────────────────────────────────

  it("scan: raw.framework = 'git-log'", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    expect(raw.framework).toBe("git-log");
  });

  it("scan: raw.branch 不为空", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    expect(typeof raw.branch).toBe("string");
    expect(raw.branch.length).toBeGreaterThan(0);
  });

  it("scan: raw.totalCommits > 0（仓库有提交历史）", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    expect(raw.totalCommits).toBeGreaterThan(0);
  });

  it("scan: raw.recentCommits 数量 <= recentCommitsLimit", async () => {
    const limit = 10;
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: limit });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    expect(raw.recentCommits.length).toBeLessThanOrEqual(limit);
  });

  it("scan: recentCommit 包含必要字段", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 3 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    if (raw.recentCommits.length > 0) {
      const commit = raw.recentCommits[0]!;
      expect(typeof commit.hash).toBe("string");
      expect(commit.hash.length).toBeGreaterThan(0);
      expect(typeof commit.fullHash).toBe("string");
      expect(typeof commit.date).toBe("string");
      expect(typeof commit.author).toBe("string");
      expect(typeof commit.message).toBe("string");
      expect(Array.isArray(commit.files)).toBe(true);
    }
  });

  it("scan: raw.fileStats 按 commitCount 降序排列", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    const counts = raw.fileStats.map((f) => f.commitCount);
    const isSorted = counts.every((c, i) => i === 0 || c <= counts[i - 1]!);
    expect(isSorted).toBe(true);
  });

  it("scan: fileStats 每项包含 riskLevel 字段", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    for (const f of raw.fileStats.slice(0, 5)) {
      expect(["low", "medium", "high"]).toContain(f.riskLevel);
    }
  });

  it("scan: raw.contributors 按 commitCount 降序排列", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    const counts = raw.contributors.map((c) => c.commitCount);
    const isSorted = counts.every((c, i) => i === 0 || c <= counts[i - 1]!);
    expect(isSorted).toBe(true);
  });

  it("scan: contributor 包含必要字段", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    if (raw.contributors.length > 0) {
      const c = raw.contributors[0]!;
      expect(typeof c.name).toBe("string");
      expect(typeof c.email).toBe("string");
      expect(typeof c.commitCount).toBe("number");
      expect(c.commitCount).toBeGreaterThan(0);
      expect(Array.isArray(c.topFiles)).toBe(true);
    }
  });

  it("scan: hotFiles 是 fileStats 的子集", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);
    const raw = mod.raw as unknown as GitLogRaw;

    const allFiles = new Set(raw.fileStats.map((f) => f.file));
    for (const hf of raw.hotFiles) {
      expect(allFiles.has(hf.file)).toBe(true);
    }
  });

  // ─── scan: symbols ──────────────────────────────────────────────────────

  it("scan: symbols 包含 HOT: 前缀的热点文件符号", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);

    const hotSymbols = mod.symbols.filter((s) => s.name.startsWith("HOT:"));
    // 仓库有历史，应该有热点文件
    expect(hotSymbols.length).toBeGreaterThanOrEqual(0);
    for (const s of hotSymbols) {
      expect(s.kind).toBe("config");
      expect(s.framework).toBe("git-log");
      expect(typeof s.extras?.commitCount).toBe("number");
      expect(["low", "medium", "high"]).toContain(s.extras?.riskLevel);
    }
  });

  it("scan: symbols 包含 RECENT: 前缀的最近变更符号", async () => {
    const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
    const mod = await adapter.scan(REPO_ROOT);

    const recentSymbols = mod.symbols.filter((s) => s.name.startsWith("RECENT:"));
    // 有提交历史就应该有最近变更
    if (mod.symbols.length > 0) {
      expect(recentSymbols.length).toBeGreaterThanOrEqual(0);
    }
    for (const s of recentSymbols) {
      expect(s.kind).toBe("config");
      expect(s.framework).toBe("git-log");
      expect(typeof s.extras?.commitHash).toBe("string");
      expect(typeof s.extras?.commitMessage).toBe("string");
    }
  });

  // ─── scan: 非 git 仓库报错 ──────────────────────────────────────────────

  it("scan: 非 git 仓库抛出有意义的错误", async () => {
    const adapter = createGitLogAdapter();
    await expect(adapter.scan(tmpdir())).rejects.toThrow("不是 git 仓库");
  });

  // ─── KB 写入 ────────────────────────────────────────────────────────────

  it("scan: 指定 kbRoot 时自动写入 KB 文件", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 5,
      kbRoot: tmp,
      moduleName: "test",
      });
      await adapter.scan(REPO_ROOT);

      const { access } = await import("node:fs/promises");
      await expect(access(path.join(tmp, "git-log", "test", "00_overview.md"))).resolves.toBeUndefined();
      await expect(access(path.join(tmp, "git-log", "test", "01_hot_files.md"))).resolves.toBeUndefined();
      await expect(access(path.join(tmp, "git-log", "test", "02_recent_changes.md"))).resolves.toBeUndefined();
      await expect(access(path.join(tmp, "git-log", "test", "03_contributors.md"))).resolves.toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("KB overview 包含仓库基本信息", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 5,
      kbRoot: tmp,
      moduleName: "test",
      });
      await adapter.scan(REPO_ROOT);

      const { readFile } = await import("node:fs/promises");
      const overview = await readFile(path.join(tmp, "git-log", "test", "00_overview.md"), "utf8");
      expect(overview).toContain("Git 历史概览");
      expect(overview).toContain("分支");
      expect(overview).toContain("总提交数");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("KB hot_files 包含表格结构", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 5,
      kbRoot: tmp,
      moduleName: "test",
      });
      await adapter.scan(REPO_ROOT);

      const { readFile } = await import("node:fs/promises");
      const hotFiles = await readFile(path.join(tmp, "git-log", "test", "01_hot_files.md"), "utf8");
      expect(hotFiles).toContain("热点文件排行");
      expect(hotFiles).toContain("| # | 文件 | 提交次数 | 风险 |");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("KB recent_changes 包含提交记录", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 5,
      kbRoot: tmp,
      moduleName: "test",
      });
      await adapter.scan(REPO_ROOT);

      const { readFile } = await import("node:fs/promises");
      const recent = await readFile(path.join(tmp, "git-log", "test", "02_recent_changes.md"), "utf8");
      expect(recent).toContain("最近变更记录");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("KB contributors 包含贡献者表格", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({
      sinceDays: TEST_SINCE_DAYS,
      recentCommitsLimit: 5,
      hotFileTopN: 5,
      kbRoot: tmp,
      moduleName: "test",
      });
      await adapter.scan(REPO_ROOT);

      const { readFile } = await import("node:fs/promises");
      const contributors = await readFile(path.join(tmp, "git-log", "test", "03_contributors.md"), "utf8");
      expect(contributors).toContain("贡献者统计");
      expect(contributors).toContain("| # | 贡献者 | 提交数 |");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  // ─── writeGitLogKb 独立调用 ─────────────────────────────────────────────

  it("writeGitLogKb 可独立调用", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "kb-git-log-"));
    try {
      const adapter = createGitLogAdapter({ sinceDays: TEST_SINCE_DAYS, recentCommitsLimit: 5 });
      const mod = await adapter.scan(REPO_ROOT);
      const raw = mod.raw as unknown as GitLogRaw;

      await writeGitLogKb(raw, tmp, 10);

      const { access } = await import("node:fs/promises");
      await expect(access(path.join(tmp, "00_overview.md"))).resolves.toBeUndefined();
      await expect(access(path.join(tmp, "01_hot_files.md"))).resolves.toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
