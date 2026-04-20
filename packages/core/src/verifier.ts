/**
 * KB Verifier — ported from `verify_kb.py`.
 *
 * Compares expected files (from progress.md) with actual files on disk
 * and produces a structured report.
 */
import path from "node:path";
import { readdir } from "node:fs/promises";
import { isDir, isFile, readTextOrNull } from "./utils/fs";
import { PROGRESS_FILE } from "./progress";

export interface ModuleProgress {
  done: string[];
  remaining: string[];
}

export type ProgressMap = Record<string, ModuleProgress>;

const readProgressMap = async (kbRoot: string): Promise<ProgressMap | null> => {
  const content = await readTextOrNull(path.join(kbRoot, PROGRESS_FILE));
  if (content === null) return null;

  const modules: ProgressMap = {};
  let current = "";
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("## ") && !line.startsWith("## 根级别")) {
      current = line.slice(3).trim();
      modules[current] = { done: [], remaining: [] };
      continue;
    }
    const mDone = line.match(/- ✅\s+(.+?)\s+\(/);
    if (mDone && current) {
      modules[current]!.done.push(mDone[1]!.trim());
      continue;
    }
    const mTodo = line.match(/- ⬜\s+(.+)/);
    if (mTodo && current) {
      modules[current]!.remaining.push(mTodo[1]!.trim());
    }
  }
  return modules;
};

interface ActualModuleFiles {
  layer2: string[];
  api: string[];
  services: string[];
  pages: string[];
}

const scanKbDirectory = async (
  kbRoot: string,
): Promise<Record<string, ActualModuleFiles>> => {
  const result: Record<string, ActualModuleFiles> = {};

  for (const typeDir of ["server", "frontend"] as const) {
    const typePath = path.join(kbRoot, typeDir);
    if (!(await isDir(typePath))) continue;

    const moduleNames = (await readdir(typePath)).sort();
    for (const name of moduleNames) {
      const modPath = path.join(typePath, name);
      if (!(await isDir(modPath))) continue;

      const modFiles: ActualModuleFiles = {
        layer2: [],
        api: [],
        services: [],
        pages: [],
      };

      for (const entry of (await readdir(modPath)).sort()) {
        const entryPath = path.join(modPath, entry);
        if ((await isFile(entryPath)) && entry.endsWith(".md") && entry !== PROGRESS_FILE) {
          modFiles.layer2.push(entry);
        }
      }

      for (const sub of ["api", "services", "pages"] as const) {
        const subPath = path.join(modPath, sub);
        if (!(await isDir(subPath))) continue;
        for (const f of (await readdir(subPath)).sort()) {
          if (f.endsWith(".md")) modFiles[sub].push(`${sub}/${f}`);
        }
      }

      result[`${typeDir}/${name}`] = modFiles;
    }
  }

  return result;
};

const verifyFormat = async (filePath: string): Promise<boolean> => {
  const content = await readTextOrNull(filePath);
  if (content === null || content.trim().length < 10) return false;
  const hasHeading = /^#{1,4}\s+/m.test(content);
  const hasTable = content.includes("|");
  return hasHeading || hasTable;
};

export interface Layer2Report {
  expected: number;
  actual: number;
  status: "pass" | "fail";
  missing: string[];
}

export interface Layer3SubReport extends Layer2Report {}

export interface ModuleReport {
  name: string;
  layer2: Layer2Report;
  layer3: Record<string, Layer3SubReport>;
}

export interface VerifyReport {
  status: "pass" | "fail" | "error";
  kbRoot: string;
  modules: ModuleReport[];
  summary: {
    totalModules: number;
    totalMissingFiles: number;
    progressRemaining: number;
    formatIssues: number;
  };
  missingFiles: string[];
  formatIssues: string[];
  recommendation: string;
  message?: string;
}

export const verifyKb = async (kbRoot: string): Promise<VerifyReport> => {
  const root = path.resolve(kbRoot);
  const progress = await readProgressMap(root);
  if (!progress) {
    return {
      status: "error",
      kbRoot: root,
      modules: [],
      summary: { totalModules: 0, totalMissingFiles: 0, progressRemaining: 0, formatIssues: 0 },
      missingFiles: [],
      formatIssues: [],
      recommendation: "先执行 kb-skills init / run 初始化进度清单",
      message: "progress.md not found",
    };
  }

  const actual = await scanKbDirectory(root);
  const modulesReport: ModuleReport[] = [];
  const totalMissing: string[] = [];
  const totalFormatIssues: string[] = [];

  for (const [modKey, progInfo] of Object.entries(progress)) {
    const actualMod = actual[modKey] ?? {
      layer2: [],
      api: [],
      services: [],
      pages: [],
    };
    const allExpected = [...progInfo.done, ...progInfo.remaining];
    const layer2Expected = allExpected.filter((f) => !f.includes("/"));
    const missingL2 = layer2Expected.filter((f) => !actualMod.layer2.includes(f));

    const report: ModuleReport = {
      name: modKey,
      layer2: {
        expected: layer2Expected.length,
        actual: actualMod.layer2.length,
        status: missingL2.length > 0 ? "fail" : "pass",
        missing: missingL2,
      },
      layer3: {},
    };
    for (const f of missingL2) totalMissing.push(`${modKey}/${f}`);

    for (const sub of ["api", "services", "pages"] as const) {
      const expected = allExpected.filter((f) => f.startsWith(`${sub}/`));
      const actualFiles = actualMod[sub];
      if (expected.length === 0 && actualFiles.length === 0) continue;
      const missing = expected.filter((f) => !actualFiles.includes(f));
      report.layer3[sub] = {
        expected: expected.length,
        actual: actualFiles.length,
        status: missing.length > 0 ? "fail" : "pass",
        missing,
      };
      for (const f of missing) totalMissing.push(`${modKey}/${f}`);
    }

    // format spot-check on layer-2 index files
    const modDir = path.join(root, ...modKey.split("/"));
    for (const f of actualMod.layer2) {
      if (f.startsWith("0") && f.endsWith(".md")) {
        if (!(await verifyFormat(path.join(modDir, f)))) {
          totalFormatIssues.push(`${modKey}/${f}`);
        }
      }
    }

    modulesReport.push(report);
  }

  const progressRemaining = Object.values(progress).reduce(
    (sum, m) => sum + m.remaining.length,
    0,
  );
  const overall: "pass" | "fail" =
    totalMissing.length > 0 || progressRemaining > 0 ? "fail" : "pass";

  let recommendation = "全部通过，知识库完整";
  if (totalMissing.length > 0) {
    recommendation =
      totalMissing.length <= 10
        ? `补生成以下文件: ${totalMissing.join(", ")}`
        : `有 ${totalMissing.length} 个文件缺失，建议执行 kb-skills status 查看详情`;
  } else if (progressRemaining > 0) {
    recommendation = `progress.md 中有 ${progressRemaining} 个文件未标记完成`;
  } else if (totalFormatIssues.length > 0) {
    recommendation = `格式检查发现 ${totalFormatIssues.length} 个文件可能格式异常`;
  }

  return {
    status: overall,
    kbRoot: root,
    modules: modulesReport,
    summary: {
      totalModules: modulesReport.length,
      totalMissingFiles: totalMissing.length,
      progressRemaining,
      formatIssues: totalFormatIssues.length,
    },
    missingFiles: totalMissing,
    formatIssues: totalFormatIssues,
    recommendation,
  };
};