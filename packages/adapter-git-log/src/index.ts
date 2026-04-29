/**
 * @kb-skills/adapter-git-log — Git 历史分析适配器
 *
 * 通过 `git log` 命令提取项目的变更历史，为 AI 提供历史维度的分析能力：
 *   - 热点文件（高频变更文件）→ 高风险文件标记
 *   - 最近变更记录 → 了解近期改动了什么
 *   - 贡献者统计 → 了解谁在维护哪些模块
 *   - 文件变更时间线 → 与 analyze_change_impact 联动，提升风险评估准确率
 *
 * 生成的 KB 文件路径：kb/git-log/<moduleName>/
 *   ├── 00_overview.md       — 仓库概览（总提交数、活跃贡献者、时间跨度）
 *   ├── 01_hot_files.md      — 热点文件排行（变更频率 Top N）
 *   ├── 02_recent_changes.md — 最近 N 条提交记录
 *   └── 03_contributors.md   — 贡献者统计
 *
 * 零外部依赖：仅使用 Node.js 内置的 child_process.execSync
 */
import path from "node:path";
import { execSync } from "node:child_process";
import {
  writeFileEnsuring,
  type ModuleInfo,
  type ScanAdapter,
  type SymbolInfo,
} from "@kb-skills/core";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 单条提交记录 */
export interface GitCommit {
  /** 短 hash（7位） */
  hash: string;
  /** 完整 hash */
  fullHash: string;
  /** 提交时间（ISO 8601） */
  date: string;
  /** 作者名 */
  author: string;
  /** 作者邮箱 */
  email: string;
  /** 提交消息（第一行） */
  message: string;
  /** 本次提交变更的文件列表 */
  files: string[];
}

/** 文件变更统计 */
export interface GitFileStats {
  /** 文件相对路径 */
  file: string;
  /** 总提交次数 */
  commitCount: number;
  /** 最近一次变更时间（ISO 8601） */
  lastChangedAt: string;
  /** 最近一次变更的提交 hash */
  lastCommitHash: string;
  /** 最近一次变更的提交消息 */
  lastCommitMessage: string;
  /** 参与修改该文件的贡献者列表 */
  contributors: string[];
  /** 风险等级（基于变更频率） */
  riskLevel: "low" | "medium" | "high";
}

/** 贡献者统计 */
export interface GitContributor {
  name: string;
  email: string;
  commitCount: number;
  /** 该贡献者主要修改的文件（Top 5） */
  topFiles: string[];
  /** 最近一次提交时间 */
  lastCommitAt: string;
}

/** Git 历史分析结果（raw payload） */
export interface GitLogRaw {
  framework: "git-log";
  /** 仓库根目录（绝对路径） */
  repoRoot: string;
  /** 分析的分支名 */
  branch: string;
  /** 总提交数 */
  totalCommits: number;
  /** 分析时间范围（天数） */
  sinceDays: number;
  /** 最早提交时间 */
  firstCommitAt: string;
  /** 最新提交时间 */
  lastCommitAt: string;
  /** 最近 N 条提交 */
  recentCommits: GitCommit[];
  /** 文件变更统计（按 commitCount 降序） */
  fileStats: GitFileStats[];
  /** 贡献者统计（按 commitCount 降序） */
  contributors: GitContributor[];
  /** 热点文件（commitCount >= hotFileThreshold） */
  hotFiles: GitFileStats[];
}

// ─── Git 命令执行 ─────────────────────────────────────────────────────────────

/** 安全执行 git 命令，失败时返回空字符串 */
const runGit = (cmd: string, cwd: string): string => {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
  } catch {
    return "";
  }
};

/** 检查目录是否是 git 仓库 */
const isGitRepo = (dir: string): boolean => {
  const result = runGit("git rev-parse --is-inside-work-tree", dir);
  return result === "true";
};

/** 获取 git 仓库根目录 */
const getRepoRoot = (dir: string): string => {
  const root = runGit("git rev-parse --show-toplevel", dir);
  return root || dir;
};

/** 获取当前分支名 */
const getCurrentBranch = (repoRoot: string): string => {
  return runGit("git rev-parse --abbrev-ref HEAD", repoRoot) || "unknown";
};

// ─── 一次性解析所有数据 ───────────────────────────────────────────────────────

const COMMIT_MARKER = "<<<COMMIT>>>";

/**
 * 核心解析函数：一次 git log 命令获取所有提交 + 变更文件。
 *
 * 输出格式（每条提交）：
 *   <<<COMMIT>>>hash|fullHash|date|author|email|message
 *   file1
 *   file2
 *   ...
 */
const parseAllCommits = (
  repoRoot: string,
  sinceDays: number,
  limit: number,
  pathFilter?: string,
): GitCommit[] => {
  const since = `--since="${sinceDays} days ago"`;
  const pathArg = pathFilter ? `-- "${pathFilter}"` : "";

  const output = runGit(
    `git log -${limit} ${since} --format="${COMMIT_MARKER}%h|%H|%aI|%an|%ae|%s" --name-only ${pathArg}`,
    repoRoot,
  );

  if (!output) return [];

  const commits: GitCommit[] = [];
  let current: Partial<GitCommit> | null = null;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith(COMMIT_MARKER)) {
      if (current?.hash) commits.push(current as GitCommit);
      const meta = trimmed.slice(COMMIT_MARKER.length);
      const idx1 = meta.indexOf("|");
      const idx2 = meta.indexOf("|", idx1 + 1);
      const idx3 = meta.indexOf("|", idx2 + 1);
      const idx4 = meta.indexOf("|", idx3 + 1);
      const idx5 = meta.indexOf("|", idx4 + 1);
      current = {
        hash: meta.slice(0, idx1),
        fullHash: meta.slice(idx1 + 1, idx2),
        date: meta.slice(idx2 + 1, idx3),
        author: meta.slice(idx3 + 1, idx4),
        email: meta.slice(idx4 + 1, idx5),
        message: meta.slice(idx5 + 1),
        files: [],
      };
    } else if (current) {
      current.files = current.files ?? [];
      current.files.push(trimmed);
    }
  }
  if (current?.hash) commits.push(current as GitCommit);

  return commits;
};

/** 从提交列表统计文件变更频率 */
const buildFileStats = (commits: GitCommit[]): GitFileStats[] => {
  // file → { count, lastDate, lastHash, lastMsg, contributors }
  const map = new Map<string, {
    count: number;
    lastDate: string;
    lastHash: string;
    lastMsg: string;
    contributors: Set<string>;
  }>();

  for (const commit of commits) {
    for (const file of commit.files) {
      const existing = map.get(file);
      if (!existing) {
        map.set(file, {
          count: 1,
          lastDate: commit.date,
          lastHash: commit.hash,
          lastMsg: commit.message,
          contributors: new Set([commit.author]),
        });
      } else {
        existing.count++;
        existing.contributors.add(commit.author);
        // 保留最新的提交信息
        if (commit.date > existing.lastDate) {
          existing.lastDate = commit.date;
          existing.lastHash = commit.hash;
          existing.lastMsg = commit.message;
        }
      }
    }
  }

  const stats: GitFileStats[] = [];
  for (const [file, { count, lastDate, lastHash, lastMsg, contributors }] of map.entries()) {
    const riskLevel: GitFileStats["riskLevel"] =
      count >= 10 ? "high" : count >= 4 ? "medium" : "low";
    stats.push({
      file,
      commitCount: count,
      lastChangedAt: lastDate,
      lastCommitHash: lastHash,
      lastCommitMessage: lastMsg,
      contributors: [...contributors],
      riskLevel,
    });
  }

  return stats.sort((a, b) => b.commitCount - a.commitCount);
};

/** 从提交列表统计贡献者信息 */
const buildContributors = (commits: GitCommit[]): GitContributor[] => {
  const map = new Map<string, {
    email: string;
    count: number;
    lastAt: string;
    fileCount: Map<string, number>;
  }>();

  for (const commit of commits) {
    const key = `${commit.author}|${commit.email}`;
    const existing = map.get(key);
    if (!existing) {
      const fileCount = new Map<string, number>();
      for (const f of commit.files) fileCount.set(f, 1);
      map.set(key, { email: commit.email, count: 1, lastAt: commit.date, fileCount });
    } else {
      existing.count++;
      if (commit.date > existing.lastAt) existing.lastAt = commit.date;
      for (const f of commit.files) {
        existing.fileCount.set(f, (existing.fileCount.get(f) ?? 0) + 1);
      }
    }
  }

  const contributors: GitContributor[] = [];
  for (const [key, { email, count, lastAt, fileCount }] of map.entries()) {
    const name = key.split("|")[0]!;
    const topFiles = [...fileCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([f]) => f);
    contributors.push({ name, email, commitCount: count, topFiles, lastCommitAt: lastAt });
  }

  return contributors.sort((a, b) => b.commitCount - a.commitCount);
};

// ─── KB 写入函数 ──────────────────────────────────────────────────────────────

const joinLines = (lines: string[]): string => lines.join("\n") + "\n";

const riskBadge = (level: GitFileStats["riskLevel"]): string => {
  if (level === "high") return "🔴 高";
  if (level === "medium") return "🟡 中";
  return "🟢 低";
};

/** 写入仓库概览 */
const writeOverview = async (raw: GitLogRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Git 历史概览", ""];
  L.push(`**分支**: \`${raw.branch}\``);
  L.push(`**分析范围**: 最近 ${raw.sinceDays} 天`);
  L.push(`**总提交数**: ${raw.totalCommits}`);
  if (raw.firstCommitAt) L.push(`**最早提交**: ${raw.firstCommitAt.slice(0, 10)}`);
  if (raw.lastCommitAt) L.push(`**最新提交**: ${raw.lastCommitAt.slice(0, 10)}`);
  L.push("");
  L.push("## 统计摘要", "");
  L.push(`- 活跃文件数: ${raw.fileStats.length}`);
  L.push(`- 热点文件数（高风险）: ${raw.hotFiles.length}`);
  L.push(`- 活跃贡献者数: ${raw.contributors.length}`);

  if (raw.hotFiles.length > 0) {
    L.push("", "## 热点文件（高风险）", "");
    L.push("> 这些文件变更频繁，修改时需要格外谨慎，建议优先补充测试覆盖。", "");
    for (const f of raw.hotFiles.slice(0, 5)) {
      L.push(`- \`${f.file}\` — ${f.commitCount} 次提交，最近: ${f.lastChangedAt.slice(0, 10)}`);
    }
  }

  await writeFileEnsuring(path.join(outDir, "00_overview.md"), joinLines(L));
};

/** 写入热点文件排行 */
const writeHotFiles = async (raw: GitLogRaw, outDir: string, topN: number): Promise<void> => {
  const L: string[] = [`# 热点文件排行（Top ${topN}）`, ""];
  L.push(`> 基于最近 ${raw.sinceDays} 天的 git log 统计，变更次数越多风险越高。`, "");
  L.push("| # | 文件 | 提交次数 | 风险 | 最近变更 | 最近提交消息 |");
  L.push("|---|------|---------|------|---------|------------|");

  const top = raw.fileStats.slice(0, topN);
  top.forEach((f, i) => {
    const date = f.lastChangedAt ? f.lastChangedAt.slice(0, 10) : "—";
    const msg = f.lastCommitMessage.slice(0, 40) + (f.lastCommitMessage.length > 40 ? "..." : "");
    L.push(`| ${i + 1} | \`${f.file}\` | ${f.commitCount} | ${riskBadge(f.riskLevel)} | ${date} | ${msg} |`);
  });

  if (raw.fileStats.length > topN) {
    L.push("", `> 共 ${raw.fileStats.length} 个活跃文件，仅展示前 ${topN} 个。`);
  }

  await writeFileEnsuring(path.join(outDir, "01_hot_files.md"), joinLines(L));
};

/** 写入最近变更记录 */
const writeRecentChanges = async (raw: GitLogRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 最近变更记录", ""];
  L.push(`> 最近 ${raw.recentCommits.length} 条提交（分支: \`${raw.branch}\`）`, "");

  for (const commit of raw.recentCommits) {
    const date = commit.date.slice(0, 16).replace("T", " ");
    L.push(`## \`${commit.hash}\` — ${commit.message}`, "");
    L.push(`**时间**: ${date} | **作者**: ${commit.author}`, "");
    if (commit.files.length > 0) {
      L.push("**变更文件**:", "");
      for (const f of commit.files.slice(0, 10)) {
        L.push(`- \`${f}\``);
      }
      if (commit.files.length > 10) {
        L.push(`- *(还有 ${commit.files.length - 10} 个文件...)*`);
      }
    }
    L.push("");
  }

  await writeFileEnsuring(path.join(outDir, "02_recent_changes.md"), joinLines(L));
};

/** 写入贡献者统计 */
const writeContributors = async (raw: GitLogRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 贡献者统计", ""];
  L.push(`> 最近 ${raw.sinceDays} 天内的活跃贡献者`, "");
  L.push("| # | 贡献者 | 提交数 | 最近提交 | 主要文件 |");
  L.push("|---|--------|--------|---------|---------|");

  raw.contributors.forEach((c, i) => {
    const date = c.lastCommitAt ? c.lastCommitAt.slice(0, 10) : "—";
    const topFiles = c.topFiles.slice(0, 3).map((f) => `\`${path.basename(f)}\``).join(", ");
    L.push(`| ${i + 1} | ${c.name} | ${c.commitCount} | ${date} | ${topFiles || "—"} |`);
  });

  await writeFileEnsuring(path.join(outDir, "03_contributors.md"), joinLines(L));
};

// ─── 主扫描逻辑 ───────────────────────────────────────────────────────────────

const scanGitLog = async (
  projectRoot: string,
  options: Required<GitLogAdapterOptions>,
): Promise<GitLogRaw> => {
  const repoRoot = getRepoRoot(projectRoot);
  const branch = getCurrentBranch(repoRoot);
  const { sinceDays, recentCommitsLimit, hotFileTopN, pathFilter } = options;

  // 一次性获取所有提交数据（含变更文件）
  // 使用较大的 limit 确保文件统计准确，但限制在合理范围内
  const allCommits = parseAllCommits(repoRoot, sinceDays, Math.max(recentCommitsLimit, 500), pathFilter);

  const totalCommits = allCommits.length;
  const firstCommitAt = allCommits.length > 0 ? allCommits[allCommits.length - 1]!.date : "";
  const lastCommitAt = allCommits.length > 0 ? allCommits[0]!.date : "";

  // 最近 N 条提交
  const recentCommits = allCommits.slice(0, recentCommitsLimit);

  // 文件统计（基于所有提交）
  const fileStats = buildFileStats(allCommits);

  // 贡献者统计（基于所有提交）
  const contributors = buildContributors(allCommits);

  // 热点文件（commitCount >= hotFileThreshold）
  const hotFileThreshold = Math.max(3, Math.ceil(totalCommits * 0.05));
  const hotFiles = fileStats.filter((f) => f.commitCount >= hotFileThreshold).slice(0, hotFileTopN);

  return {
    framework: "git-log",
    repoRoot,
    branch,
    totalCommits,
    sinceDays,
    firstCommitAt,
    lastCommitAt,
    recentCommits,
    fileStats,
    contributors,
    hotFiles,
  };
};

/** 将 GitLogRaw 转换为 SymbolInfo 列表 */
const flattenToSymbols = (raw: GitLogRaw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];

  // 热点文件 → kind: "config"（表示"需要关注的文件"）
  for (const f of raw.hotFiles) {
    symbols.push({
      kind: "config",
      name: `HOT:${f.file}`,
      file: f.file,
      exported: false,
      framework: "git-log",
      extras: {
        commitCount: f.commitCount,
        riskLevel: f.riskLevel,
        lastChangedAt: f.lastChangedAt,
        lastCommitMessage: f.lastCommitMessage,
        contributors: f.contributors,
      },
    });
  }

  // 最近变更文件（去重）→ kind: "config"
  const recentFiles = new Set<string>();
  for (const commit of raw.recentCommits) {
    for (const file of commit.files) {
      if (!recentFiles.has(file)) {
        recentFiles.add(file);
        symbols.push({
          kind: "config",
          name: `RECENT:${file}`,
          file,
          exported: false,
          framework: "git-log",
          extras: {
            commitHash: commit.hash,
            commitMessage: commit.message,
            commitDate: commit.date,
            author: commit.author,
          },
        });
      }
    }
  }

  return symbols;
};

// ─── 公共 API ─────────────────────────────────────────────────────────────────

export interface GitLogAdapterOptions {
  /** 模块名称，用于 KB 目录命名（默认: "git-log"） */
  moduleName?: string;
  /** 分析最近多少天的 git 历史（默认: 90） */
  sinceDays?: number;
  /** 最近提交记录条数（默认: 30） */
  recentCommitsLimit?: number;
  /** 热点文件排行 Top N（默认: 20） */
  hotFileTopN?: number;
  /**
   * 只分析指定路径下的文件（相对于仓库根目录）。
   * 例如 "src/" 只分析 src 目录下的变更。
   * 不指定则分析整个仓库。
   */
  pathFilter?: string;
  /**
   * KB 输出根目录。
   * 设置后会在此目录下生成 `git-log/<moduleName>/` 子目录。
   */
  kbRoot?: string;
}

const DEFAULT_OPTIONS: Required<GitLogAdapterOptions> = {
  moduleName: "git-log",
  sinceDays: 90,
  recentCommitsLimit: 30,
  hotFileTopN: 20,
  pathFilter: "",
  kbRoot: "",
};

/**
 * 写入 Git Log KB 文件。
 * 可在 scan 之后单独调用，也可通过 adapter.scan() 自动触发。
 */
export const writeGitLogKb = async (raw: GitLogRaw, outDir: string, topN = 20): Promise<void> => {
  await writeOverview(raw, outDir);
  await writeHotFiles(raw, outDir, topN);
  await writeRecentChanges(raw, outDir);
  await writeContributors(raw, outDir);
};

const createGitLogAdapter = (options: GitLogAdapterOptions = {}): ScanAdapter => {
  const opts: Required<GitLogAdapterOptions> = { ...DEFAULT_OPTIONS, ...options };
  const moduleName = opts.moduleName;

  return {
    name: "git-log",

    async detect(projectRoot: string): Promise<boolean> {
      return isGitRepo(projectRoot);
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      if (!isGitRepo(modulePath)) {
        throw new Error(
          `adapter-git-log: ${modulePath} 不是 git 仓库，请先执行 git init。`,
        );
      }

      const raw = await scanGitLog(modulePath, opts);

      // 如果指定了 kbRoot，自动写入 KB 文件
      if (opts.kbRoot) {
        const outDir = path.join(opts.kbRoot, "git-log", moduleName);
        await writeGitLogKb(raw, outDir, opts.hotFileTopN);
      }

      return {
        name: moduleName,
        root: modulePath,
        kind: "backend",
        symbols: flattenToSymbols(raw),
        raw: raw as unknown as import("@kb-skills/core").ScanRaw,
      };
    },
  };
};

export default createGitLogAdapter;
export { createGitLogAdapter };
