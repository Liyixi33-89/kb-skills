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
const distDir = path.join(cwd, "dist");

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
      content = content.replace(/require\("(\.[^"]+)\.js"\)/g, 'require("$1.cjs")');
      content = content.replace(/require\('(\.[^']+)\.js'\)/g, "require('$1.cjs')");

      fs.writeFileSync(path.join(destDir, destName), content, "utf8");
    }
  }
};

renameRecursive(cjsDir, "");

// ── Step 4: 清理临时 dist/cjs/ ────────────────────────────────────────────────
fs.rmSync(cjsDir, { recursive: true, force: true });

console.log("[build-pkg] 完成（ESM + CJS）\n");
