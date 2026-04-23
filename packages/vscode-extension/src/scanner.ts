/**
 * KB Skills VSCode Extension — Project scanner
 *
 * 通过子进程在项目目录下执行扫描，避免 jiti 跟随 pnpm symlink 真实路径
 * 导致 node_modules 解析失败的问题。
 */

import path from "node:path";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import type { ScanCache, ScannedModule } from "./types";

const execFileAsync = promisify(execFile);

// ─── Config file candidates ───────────────────────────────────────────────────

const CONFIG_CANDIDATES = [
  "kb-skills.config.ts",
  "kb-skills.config.mts",
  "kb-skills.config.js",
  "kb-skills.config.mjs",
  "kb-skills.config.cjs",
];

export const findConfigFile = (
  projectRoot: string,
  explicit?: string,
): string | null => {
  if (explicit) {
    const abs = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(projectRoot, explicit);
    return existsSync(abs) ? abs : null;
  }
  for (const candidate of CONFIG_CANDIDATES) {
    const abs = path.resolve(projectRoot, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
};

// ─── Runner script template ───────────────────────────────────────────────────

/**
 * 生成在子进程中执行的 runner 脚本内容。
 * 使用 .ts 扩展名，由 tsx 直接转译执行，支持 import .ts config 文件。
 */
const buildRunnerScript = (configFile: string): string => {
  const configDir = path.dirname(configFile);
  // Windows 路径必须转成 file:// URL 才能被 import() 接受
  const configFileUrl = configFile.replace(/\\/g, "/");
  const configDirStr = JSON.stringify(configDir);
  const configFileUrlStr = JSON.stringify(`file:///${configFileUrl}`);

  return `// @ts-nocheck
// kb-skills runner — executed by tsx in project cwd
import nodePath from "path";
import { pathToFileURL } from "url";

const configFileUrl = pathToFileURL(${JSON.stringify(configFile)}).href;
const raw = await import(configFileUrl);
const config = raw.default ?? raw;

if (!config || !Array.isArray(config.modules)) {
  process.stderr.write("无效的 kb-skills 配置文件\\n");
  process.exit(1);
}

const results = [];

for (const mod of config.modules) {
  const modulePath = nodePath.isAbsolute(mod.path)
    ? mod.path
    : nodePath.resolve(${configDirStr}, mod.path);

  try {
    const result = await mod.adapter.scan(modulePath);
    results.push({
      name: mod.name,
      root: modulePath,
      kind: result.kind,
      framework: result.symbols.length > 0 ? result.symbols[0].framework : mod.name,
      symbols: result.symbols,
      error: null,
    });
  } catch (err) {
    results.push({
      name: mod.name,
      root: modulePath,
      kind: "backend",
      framework: "unknown",
      symbols: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

process.stdout.write(JSON.stringify(results));
`;
};

// ─── 查找项目中可用的 Node 可执行文件 ────────────────────────────────────────

const findNodeBin = (projectRoot: string): string => {
  // 从 projectRoot 向上遍历，查找 node_modules/.bin/tsx
  const ext = process.platform === "win32" ? ".cmd" : "";
  let dir = projectRoot;
  for (let i = 0; i < 6; i++) {
    const tsxCmd = path.join(dir, "node_modules", ".bin", `tsx${ext}`);
    const tsxRaw = path.join(dir, "node_modules", ".bin", "tsx");
    if (existsSync(tsxCmd)) return tsxCmd;
    if (existsSync(tsxRaw)) return tsxRaw;
    const parent = path.dirname(dir);
    if (parent === dir) break; // 到达根目录
    dir = parent;
  }
  return process.execPath; // 回退到当前 Node（只能执行 .mjs，不支持 .ts）
};

// ─── Main scan function ───────────────────────────────────────────────────────

export const scanProject = async (
  projectRoot: string,
  configFile: string,
  onProgress?: (msg: string) => void,
): Promise<ScanCache> => {
  onProgress?.("正在准备扫描环境...");

  // 将 runner 脚本写到 projectRoot 目录下（.ts 扩展名）
  // 关键：tsx 从文件位置向上找 tsconfig，写到 projectRoot 确保读取项目自己的 tsconfig
  // 而不是 vscode-extension 的 tsconfig（后者 target=ES2020 不支持 top-level await）
  const runnerPath = path.join(projectRoot, `.kb-skills-runner-${Date.now()}.ts`);
  writeFileSync(runnerPath, buildRunnerScript(configFile), "utf-8");

  let stdout = "";
  let stderr = "";

  try {
    const tsxBin = findNodeBin(projectRoot);

    if (tsxBin === process.execPath) {
      throw new Error(
        "未找到 tsx 可执行文件。请在项目中安装 tsx：\n  pnpm add -D tsx\n或在 monorepo 根目录安装。",
      );
    }

    onProgress?.(`正在扫描项目: ${path.basename(projectRoot)}...`);

    const args = [runnerPath];

    const result = await execFileAsync(tsxBin, args, {
      cwd: projectRoot,           // ← 关键：在项目目录下执行，node_modules 解析正确
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_PATH: path.join(projectRoot, "node_modules"), // 额外保障
      },
    });

    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    stdout = execErr.stdout ?? "";
    stderr = execErr.stderr ?? "";
    if (!stdout) {
      throw new Error(
        `扫描子进程失败: ${execErr.message ?? String(err)}\n${stderr}`.trim(),
      );
    }
  } finally {
    try { unlinkSync(runnerPath); } catch { /* ignore */ }
  }

  // 解析子进程输出的 JSON
  let rawModules: Array<{
    name: string;
    root: string;
    kind: "frontend" | "backend";
    framework: string;
    symbols: Array<{
      kind: string;
      name: string;
      file: string;
      signature?: string;
      exported: boolean;
      framework: string;
      extras?: Record<string, unknown>;
    }>;
    error: string | null;
  }>;

  try {
    rawModules = JSON.parse(stdout);
  } catch {
    throw new Error(`无法解析扫描结果: ${stdout.slice(0, 200)}`);
  }

  const scannedModules: ScannedModule[] = rawModules.map((mod) => {
    if (mod.error) {
      onProgress?.(`⚠ 模块 ${mod.name} 扫描失败: ${mod.error}`);
    }
    return {
      name: mod.name,
      root: mod.root,
      kind: mod.kind,
      framework: mod.framework,
      symbols: mod.symbols.map((s) => ({
        kind: s.kind as import("@kb-skills/core").SymbolKind,
        name: s.name,
        file: s.file,
        signature: s.signature,
        exported: s.exported,
        framework: s.framework,
        extras: s.extras,
      })),
    };
  });

  return {
    scannedAt: new Date().toISOString(),
    projectRoot,
    modules: scannedModules,
  };
};
