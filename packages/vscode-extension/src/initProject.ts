/**
 * KB Skills VSCode Extension — Init Project
 *
 * 检测项目框架，自动生成 kb-skills.config.ts，
 * 让用户无需手动安装 CLI 即可初始化项目。
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// ─── 框架 → adapter 映射 ──────────────────────────────────────────────────────

type DetectedStack =
  | "koa"
  | "express"
  | "nestjs"
  | "nextjs"
  | "nuxt"
  | "react"
  | "react-native"
  | "vue2"
  | "vue3"
  | "unknown";

const ADAPTER_FOR: Record<
  DetectedStack,
  { pkg: string; factory: string } | null
> = {
  koa: { pkg: "@kb-skills/adapter-koa", factory: "koaAdapter" },
  react: { pkg: "@kb-skills/adapter-react", factory: "reactAdapter" },
  express: { pkg: "@kb-skills/adapter-express", factory: "expressAdapter" },
  nestjs: { pkg: "@kb-skills/adapter-nestjs", factory: "nestAdapter" },
  nextjs: { pkg: "@kb-skills/adapter-react", factory: "reactAdapter" },
  nuxt: { pkg: "@kb-skills/adapter-vue3", factory: "vue3Adapter" },
  "react-native": {
    pkg: "@kb-skills/adapter-react-native",
    factory: "rnAdapter",
  },
  vue2: { pkg: "@kb-skills/adapter-vue2", factory: "vue2Adapter" },
  vue3: { pkg: "@kb-skills/adapter-vue3", factory: "vue3Adapter" },
  unknown: null,
};

// ─── 框架检测 ─────────────────────────────────────────────────────────────────

const readPkg = (dir: string): Record<string, unknown> | null => {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
};

const depsOf = (pkg: Record<string, unknown>): Record<string, string> => ({
  ...((pkg.dependencies as Record<string, string>) ?? {}),
  ...((pkg.devDependencies as Record<string, string>) ?? {}),
});

const stackOf = (deps: Record<string, string>): DetectedStack => {
  if ("koa" in deps) return "koa";
  if ("@nestjs/core" in deps || "@nestjs/common" in deps) return "nestjs";
  if ("express" in deps) return "express";
  if ("next" in deps) return "nextjs";
  if ("nuxt" in deps || "@nuxt/core" in deps) return "nuxt";
  if ("react-native" in deps || "expo" in deps) return "react-native";
  if ("react" in deps) return "react";
  if (deps["vue"]?.startsWith("2.") || "vue-template-compiler" in deps)
    return "vue2";
  if ("vue" in deps) return "vue3";
  return "unknown";
};

interface CandidateModule {
  name: string;
  relPath: string;
  stack: DetectedStack;
}

const detectModules = (projectRoot: string): CandidateModule[] => {
  const rootPkg = readPkg(projectRoot);
  if (!rootPkg) return [];

  const candidates: CandidateModule[] = [];

  // 检查是否是 monorepo
  const workspaces = Array.isArray(rootPkg.workspaces)
    ? (rootPkg.workspaces as string[])
    : ((rootPkg.workspaces as { packages?: string[] } | undefined)
        ?.packages ?? []);

  if (workspaces.length > 0) {
    for (const ws of workspaces) {
      if (ws.includes("*")) {
        const globBase = ws.replace(/\/\*.*$/, "");
        const absBase = path.resolve(projectRoot, globBase);
        if (!fs.existsSync(absBase)) continue;
        try {
          const entries = fs.readdirSync(absBase, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const abs = path.join(absBase, entry.name);
            const wsPkg = readPkg(abs);
            if (!wsPkg) continue;
            const st = stackOf(depsOf(wsPkg));
            if (st !== "unknown") {
              candidates.push({
                name:
                  (wsPkg.name as string) ?? path.basename(abs),
                relPath: path.posix.join(globBase, entry.name),
                stack: st,
              });
            }
          }
        } catch {
          // skip
        }
      } else {
        const abs = path.resolve(projectRoot, ws);
        const wsPkg = readPkg(abs);
        if (!wsPkg) continue;
        const st = stackOf(depsOf(wsPkg));
        if (st !== "unknown") {
          candidates.push({
            name: (wsPkg.name as string) ?? path.basename(abs),
            relPath: ws,
            stack: st,
          });
        }
      }
    }
  } else {
    // 单包项目
    const rootStack = stackOf(depsOf(rootPkg));
    if (rootStack !== "unknown") {
      candidates.push({
        name: (rootPkg.name as string) ?? path.basename(projectRoot),
        relPath: ".",
        stack: rootStack,
      });
    }
  }

  return candidates;
};

// ─── 生成配置文件内容 ─────────────────────────────────────────────────────────

const renderConfig = (modules: CandidateModule[]): string => {
  const supported = modules.filter((m) => ADAPTER_FOR[m.stack] !== null);

  if (supported.length === 0) {
    // 无法检测到框架，生成空模板
    return `/**
 * kb-skills configuration
 *
 * Docs: https://github.com/Liyixi33-89/kb-skills
 * 请根据你的项目框架选择合适的 adapter：
 *   @kb-skills/adapter-koa / adapter-express / adapter-nestjs
 *   @kb-skills/adapter-react / adapter-vue3 / adapter-vue2
 */
import { defineConfig } from "@kb-skills/core";
// import koaAdapter from "@kb-skills/adapter-koa";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    // { name: "server", path: "./server", adapter: koaAdapter() },
  ],
});
`;
  }

  const importSet = new Set<string>();
  for (const m of supported) {
    const a = ADAPTER_FOR[m.stack]!;
    importSet.add(`import ${a.factory} from "${a.pkg}";`);
  }

  const entries = supported
    .map((m) => {
      const a = ADAPTER_FOR[m.stack]!;
      return `    { name: "${m.name}", path: "${m.relPath}", adapter: ${a.factory}() },`;
    })
    .join("\n");

  return `/**
 * kb-skills configuration
 *
 * Docs: https://github.com/Liyixi33-89/kb-skills
 */
import { defineConfig } from "@kb-skills/core";
${[...importSet].join("\n")}

export default defineConfig({
  kbRoot: "./kb",
  modules: [
${entries}
  ],
});
`;
};

// ─── 主入口：init 命令 ────────────────────────────────────────────────────────

export const initProject = async (projectRoot: string): Promise<boolean> => {
  const configPath = path.join(projectRoot, "kb-skills.config.ts");

  // 已存在配置文件，询问是否覆盖
  if (fs.existsSync(configPath)) {
    const choice = await vscode.window.showWarningMessage(
      "kb-skills.config.ts 已存在，是否覆盖？",
      { modal: true },
      "覆盖",
      "取消",
    );
    if (choice !== "覆盖") return false;
  }

  // 检测框架
  const modules = detectModules(projectRoot);

  let selectedModules = modules;

  if (modules.length === 0) {
    // 无法自动检测，让用户手动选择框架
    const frameworkOptions: vscode.QuickPickItem[] = [
      { label: "Koa", description: "@kb-skills/adapter-koa" },
      { label: "Express", description: "@kb-skills/adapter-express" },
      { label: "NestJS", description: "@kb-skills/adapter-nestjs" },
      { label: "React", description: "@kb-skills/adapter-react" },
      { label: "Vue 3", description: "@kb-skills/adapter-vue3" },
      { label: "Vue 2", description: "@kb-skills/adapter-vue2" },
      { label: "React Native", description: "@kb-skills/adapter-react-native" },
      { label: "跳过（生成空模板）", description: "" },
    ];

    const picked = await vscode.window.showQuickPick(frameworkOptions, {
      placeHolder: "未检测到框架，请手动选择",
      title: "KB Skills — 选择项目框架",
    });

    if (!picked || picked.label === "跳过（生成空模板）") {
      selectedModules = [];
    } else {
      const stackMap: Record<string, DetectedStack> = {
        Koa: "koa",
        Express: "express",
        NestJS: "nestjs",
        React: "react",
        "Vue 3": "vue3",
        "Vue 2": "vue2",
        "React Native": "react-native",
      };
      const stack = stackMap[picked.label] ?? "unknown";
      const rootPkg = readPkg(projectRoot);
      selectedModules = [
        {
          name:
            (rootPkg?.name as string | undefined) ??
            path.basename(projectRoot),
          relPath: ".",
          stack,
        },
      ];
    }
  } else {
    // 展示检测结果，让用户确认
    const detectedNames = modules
      .map((m) => `${m.name} (${m.stack})`)
      .join(", ");
    const confirm = await vscode.window.showInformationMessage(
      `检测到以下模块：${detectedNames}`,
      { modal: false },
      "使用检测结果",
      "手动选择",
    );

    if (confirm === "手动选择") {
      // 让用户勾选要包含的模块
      const items = modules.map((m) => ({
        label: m.name,
        description: `${m.stack} · ${m.relPath}`,
        picked: true,
        module: m,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: "选择要包含的模块",
        title: "KB Skills — 选择模块",
      });
      if (!picked || picked.length === 0) return false;
      selectedModules = picked.map((p) => p.module);
    }
  }

  // 写入配置文件
  const content = renderConfig(selectedModules);
  fs.writeFileSync(configPath, content, "utf8");

  // 提示下一步
  const pkgsToInstall = [
    ...new Set(
      selectedModules
        .map((m) => ADAPTER_FOR[m.stack]?.pkg)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const nextStepMsg =
    pkgsToInstall.length > 0
      ? `已生成 kb-skills.config.ts！\n下一步：npm install -D ${pkgsToInstall.join(" ")}`
      : "已生成 kb-skills.config.ts！请根据注释配置 adapter。";

  const action = await vscode.window.showInformationMessage(
    nextStepMsg,
    "打开配置文件",
    "立即扫描",
  );

  if (action === "打开配置文件") {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(configPath),
    );
    await vscode.window.showTextDocument(doc);
  }

  return action === "立即扫描";
};
