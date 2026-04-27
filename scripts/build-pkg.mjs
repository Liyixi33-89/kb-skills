#!/usr/bin/env node
/**
 * build-pkg.mjs — 替代 tsup 的轻量构建脚本
 *
 * 用法（在包目录下执行）：
 *   node ../../scripts/build-pkg.mjs           # ESM only
 *   node ../../scripts/build-pkg.mjs --dual    # ESM + CJS
 *
 * 原理：
 *   1. tsc -p tsconfig.build.json              → dist/*.js (ESM)
 *   2. tsc -p tsconfig.build.json --module commonjs --outDir dist/cjs  → dist/cjs/*.js
 *   3. 将 dist/cjs/*.js 重命名为 dist/*.cjs
 *   4. 清理 dist/cjs/
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dual = args.includes("--dual");
const cwd = process.cwd();

const run = (cmd) => {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd });
};

// ── Step 1: 编译 ESM ──────────────────────────────────────────────────────────
console.log("\n[build-pkg] 编译 ESM...");
run("node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json");

// ── Step 1.5: 修复 ESM 输出中缺少 .js 扩展名的相对路径 ───────────────────────
console.log("\n[build-pkg] 修复 ESM 相对路径扩展名...");

const distDir = path.join(cwd, "dist");

const fixEsmExtensions = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixEsmExtensions(fullPath);
    } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".cjs")) {
      let content = fs.readFileSync(fullPath, "utf8");
      // 修复 export/import 中缺少 .js 扩展名的相对路径
      content = content.replace(
        /((?:export|import)(?:\s+[\w\s{},*]+\s+from\s+|\s+\*\s+from\s+|\s+)["'])(\.\.?\/[^"']+?)(["'])/g,
        (match, prefix, p, suffix) => {
          // 已有扩展名则跳过
          if (/\.[a-z]+$/.test(p)) return match;
          // 计算绝对路径，判断是文件还是目录
          const baseDir = path.dirname(fullPath);
          const absPath = path.resolve(baseDir, p);
          if (fs.existsSync(absPath + ".js")) {
            return `${prefix}${p}.js${suffix}`;
          } else if (fs.existsSync(path.join(absPath, "index.js"))) {
            return `${prefix}${p}/index.js${suffix}`;
          }
          // 找不到时加 .js（兜底）
          return `${prefix}${p}.js${suffix}`;
        }
      );
      // 修复 eval("import.meta.url") → import.meta.url（ESM 中直接可用）
      content = content.replace(/eval\(["']import\.meta\.url["']\)/g, "import.meta.url");
      fs.writeFileSync(fullPath, content, "utf8");
    }
  }
};

fixEsmExtensions(distDir);

if (!dual) {
  console.log("[build-pkg] 完成（ESM only）\n");
  process.exit(0);
}

// ── Step 2: 编译 CJS（临时输出到 dist/cjs/）──────────────────────────────────
console.log("\n[build-pkg] 编译 CJS...");
run(
  "node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json" +
    " --module commonjs --moduleResolution node10" +
    " --outDir dist/cjs" +
    " --declaration false" +
    " --declarationMap false"
);

// ── Step 3: 将 dist/cjs/**/*.js 重命名为 dist/**/*.cjs ───────────────────────
console.log("\n[build-pkg] 重命名 .js → .cjs...");

const cjsDir = path.join(cwd, "dist", "cjs");

const renameRecursive = (dir, relBase) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relBase, entry.name);

    if (entry.isDirectory()) {
      renameRecursive(fullPath, relPath);
    } else if (entry.name.endsWith(".js")) {
      const destName = entry.name.replace(/\.js$/, ".cjs");
      const destDir = path.join(distDir, relBase);
      fs.mkdirSync(destDir, { recursive: true });

      // 修正 require() 内部的相对路径引用（.js → .cjs）
      let content = fs.readFileSync(fullPath, "utf8");
      content = content.replace(/require\("(\.[\/\\][^"]+)\.js"\)/g, 'require("$1.cjs")');
      content = content.replace(/require\('(\.[\/\\][^']+)\.js'\)/g, "require('$1.cjs')");
      // 修复 CJS 中的 import.meta.url → 使用 __filename
      content = content.replace(
        /eval\(["']import\.meta\.url["']\)/g,
        '"file://" + __filename.replace(/\\\\/g, "/")'
      );

      fs.writeFileSync(path.join(destDir, destName), content, "utf8");    }
  }
};

renameRecursive(cjsDir, "");

// ── Step 4: 清理临时 dist/cjs/ ────────────────────────────────────────────────
fs.rmSync(cjsDir, { recursive: true, force: true });

console.log("[build-pkg] 完成（ESM + CJS）\n");
