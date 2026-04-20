/**
 * Progress tracker — ported from `gen_progress.py`.
 *
 * Manages a human-readable `progress.md` file that lists every KB file
 * expected to be generated, with ⬜ / ✅ markers.
 */
import path from "node:path";
import { writeFileEnsuring, readTextOrNull } from "./utils/fs";
import { kebab } from "./utils/path";
import type { ScanResult, KoaRaw, ReactRaw } from "./types";

export const PROGRESS_FILE = "progress.md";

export const SERVER_LAYER2_FILES = [
  "00_project_map.md",
  "01_index_api.md",
  "02_index_model.md",
  "03_index_service.md",
  "04_index_config.md",
  "changelog.md",
];

export const REACT_LAYER2_FILES = [
  "00_project_map.md",
  "01_index_page.md",
  "02_index_component.md",
  "03_index_api.md",
  "04_index_store.md",
  "05_index_types.md",
  "changelog.md",
];

const nowStamp = (): string => {
  const d = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

/** Build the `progress.md` content from a fresh scan. */
export const renderProgress = (scan: ScanResult): string => {
  const lines: string[] = ["# 知识库构建进度", ""];
  lines.push(`> 初始化时间: ${nowStamp()}`);
  const hasFrontend = scan.modules.some((m) => m.kind === "frontend");
  const hasBackend = scan.modules.some((m) => m.kind === "backend");
  const projectType = hasFrontend && hasBackend ? "monorepo" : "single";
  lines.push(`> 项目类型: ${projectType}`, "");

  for (const mod of scan.modules) {
    if (mod.kind === "backend") {
      const raw = mod.raw as KoaRaw | undefined;
      lines.push(`## server/${mod.name}`, "");
      lines.push("### 第二层（索引文件）", "");
      for (const f of SERVER_LAYER2_FILES) lines.push(`- ⬜ ${f}`);
      lines.push("");

      const routes = raw?.routes ?? [];
      const services = raw?.services ?? [];
      if (routes.length > 0 || services.length > 0) {
        lines.push("### 第三层（详情文件）", "");
        if (routes.length > 0) {
          lines.push("#### api/", "");
          for (const r of routes) lines.push(`- ⬜ api/${r.name}.md`);
          lines.push("");
        }
        if (services.length > 0) {
          lines.push("#### services/", "");
          for (const s of services) lines.push(`- ⬜ services/${s.name}.md`);
          lines.push("");
        }
      }
    } else {
      const raw = mod.raw as ReactRaw | undefined;
      lines.push(`## frontend/${mod.name}`, "");
      lines.push("### 第二层（索引文件）", "");
      for (const f of REACT_LAYER2_FILES) lines.push(`- ⬜ ${f}`);
      lines.push("");

      const pageTsx = (raw?.pages ?? []).filter((p) =>
        (p.relPath ?? "").match(/\.(tsx|jsx)$/),
      );
      if (pageTsx.length > 0) {
        lines.push("### 第三层（详情文件）", "");
        lines.push("#### pages/", "");
        for (const p of pageTsx) {
          const name = (p as { name?: string }).name ?? "unknown";
          lines.push(`- ⬜ pages/${kebab(name)}.md`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n") + "\n";
};

export interface InitProgressOptions {
  kbRoot: string;
  scan: ScanResult;
}

export interface InitProgressResult {
  progressFile: string;
  totalFiles: number;
}

export const initProgress = async (
  opts: InitProgressOptions,
): Promise<InitProgressResult> => {
  const content = renderProgress(opts.scan);
  const progressFile = path.join(opts.kbRoot, PROGRESS_FILE);
  await writeFileEnsuring(progressFile, content);
  const totalFiles = (content.match(/^- ⬜/gm) ?? []).length;
  return { progressFile, totalFiles };
};

/** Mark a file as done, returning true if the file was found and updated. */
export const markDone = async (
  kbRoot: string,
  relativeFilepath: string,
): Promise<boolean> => {
  const progressFile = path.join(kbRoot, PROGRESS_FILE);
  const original = await readTextOrNull(progressFile);
  if (original === null) return false;

  const target = relativeFilepath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const stamp = nowStamp().slice(0, 16); // "YYYY-MM-DD HH:MM"

  const tryReplace = (content: string, needle: string): string | null => {
    const before = `- ⬜ ${needle}`;
    const after = `- ✅ ${needle} (${stamp})`;
    if (content.includes(before)) return content.replace(before, after);
    return null;
  };

  // 1. exact match
  let updated = tryReplace(original, target);
  // 2. parent/basename
  if (!updated) {
    const basename = path.basename(target);
    const parent = path.basename(path.dirname(target));
    const short = parent && parent !== "." ? `${parent}/${basename}` : basename;
    updated = tryReplace(original, short);
  }
  // 3. basename-only loose match
  if (!updated) {
    const basename = path.basename(target);
    const lines = original.split("\n");
    let done = false;
    const newLines = lines.map((line) => {
      if (!done && line.includes("⬜") && line.includes(basename)) {
        done = true;
        return line.replace("⬜", "✅").replace(/\s*$/, "") + ` (${stamp})`;
      }
      return line;
    });
    if (done) updated = newLines.join("\n");
  }

  if (!updated) return false;
  await writeFileEnsuring(progressFile, updated);
  return true;
};

export interface ProgressStatus {
  total: number;
  done: number;
  remaining: number;
  progressPct: number;
  currentModule: string | null;
  remainingFiles: string[];
  modules: Record<string, { done: number; remaining: number; remainingFiles: string[] }>;
}

export const readStatus = async (kbRoot: string): Promise<ProgressStatus | null> => {
  const content = await readTextOrNull(path.join(kbRoot, PROGRESS_FILE));
  if (content === null) return null;

  const doneFiles: string[] = [];
  const remainingFiles: string[] = [];
  const modules: ProgressStatus["modules"] = {};
  let currentModule = "";

  for (const raw of content.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("## ") && !line.startsWith("## 根级别")) {
      currentModule = line.slice(3).trim();
      if (!(currentModule in modules)) {
        modules[currentModule] = { done: 0, remaining: 0, remainingFiles: [] };
      }
      continue;
    }
    const mDone = line.match(/- ✅\s+(.+?)\s+\(/);
    if (mDone) {
      doneFiles.push(mDone[1]!);
      if (currentModule) modules[currentModule]!.done += 1;
      continue;
    }
    const mTodo = line.match(/- ⬜\s+(.+)/);
    if (mTodo) {
      const file = mTodo[1]!.trim();
      remainingFiles.push(file);
      if (currentModule) {
        modules[currentModule]!.remaining += 1;
        modules[currentModule]!.remainingFiles.push(file);
      }
    }
  }

  const total = doneFiles.length + remainingFiles.length;
  const firstPending = Object.entries(modules).find(([, v]) => v.remaining > 0);

  return {
    total,
    done: doneFiles.length,
    remaining: remainingFiles.length,
    progressPct: total === 0 ? 0 : Math.round((doneFiles.length / total) * 1000) / 10,
    currentModule: firstPending ? firstPending[0] : null,
    remainingFiles,
    modules,
  };
};