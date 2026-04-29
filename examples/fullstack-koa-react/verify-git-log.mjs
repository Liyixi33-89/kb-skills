import createGitLogAdapter from "../../packages/adapter-git-log/dist/index.js";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, ".");
const kbRoot = path.join(root, "kb");

const adapter = createGitLogAdapter({
  kbRoot,
  moduleName: "fullstack-koa-react",
  sinceDays: 90,
  recentCommitsLimit: 20,
  hotFileTopN: 15,
});

// ─── detect ──────────────────────────────────────────────────────────────────
console.log("=== 检测阶段 ===");
const detected = await adapter.detect(root);
console.log("git-log detect:", detected);
if (!detected) {
  console.error("❌ 未检测到 git 仓库，终止验证");
  process.exit(1);
}

// ─── scan ─────────────────────────────────────────────────────────────────────
console.log("\n=== 扫描阶段 ===");
const mod = await adapter.scan(root);
const raw = mod.raw;

console.log("name:", mod.name, "| kind:", mod.kind);
console.log("branch:", raw.branch);
console.log("totalCommits:", raw.totalCommits);
console.log("sinceDays:", raw.sinceDays);
console.log("firstCommitAt:", raw.firstCommitAt?.slice(0, 10) || "—");
console.log("lastCommitAt:", raw.lastCommitAt?.slice(0, 10) || "—");

console.log("\n--- 最近提交 (前5条) ---");
for (const c of raw.recentCommits.slice(0, 5)) {
  console.log(`  [${c.hash}] ${c.date.slice(0, 10)} | ${c.author} | ${c.message.slice(0, 50)}`);
  if (c.files.length > 0) {
    console.log(`    变更文件: ${c.files.slice(0, 3).join(", ")}${c.files.length > 3 ? ` (+${c.files.length - 3})` : ""}`);
  }
}

console.log("\n--- 文件统计 (Top 10) ---");
for (const f of raw.fileStats.slice(0, 10)) {
  const risk = f.riskLevel === "high" ? "🔴" : f.riskLevel === "medium" ? "🟡" : "🟢";
  console.log(`  ${risk} ${f.file} — ${f.commitCount} 次提交`);
}

console.log("\n--- 热点文件 ---");
if (raw.hotFiles.length === 0) {
  console.log("  (无热点文件，提交数较少属正常)");
} else {
  for (const f of raw.hotFiles) {
    console.log(`  🔴 ${f.file} — ${f.commitCount} 次提交`);
  }
}

console.log("\n--- 贡献者 ---");
for (const c of raw.contributors) {
  console.log(`  ${c.name} <${c.email}> — ${c.commitCount} 次提交`);
  if (c.topFiles.length > 0) {
    console.log(`    主要文件: ${c.topFiles.slice(0, 3).map(f => path.basename(f)).join(", ")}`);
  }
}

console.log("\n--- Symbols ---");
console.log(`总计 ${mod.symbols.length} 个 symbol`);
for (const s of mod.symbols.slice(0, 10)) {
  console.log(`  [${s.kind}] ${s.name.slice(0, 60)}`);
}
if (mod.symbols.length > 10) {
  console.log(`  ... 还有 ${mod.symbols.length - 10} 个`);
}

// ─── KB 文件验证 ──────────────────────────────────────────────────────────────
console.log("\n=== KB 文件验证 ===");
const kbDir = path.join(kbRoot, "git-log", "fullstack-koa-react");
const expectedFiles = [
  "00_overview.md",
  "01_hot_files.md",
  "02_recent_changes.md",
  "03_contributors.md",
];

let allPassed = true;
for (const file of expectedFiles) {
  const filePath = path.join(kbDir, file);
  try {
    await access(filePath);
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n").length;
    console.log(`  ✅ ${file} (${lines} 行)`);
    // 简单内容校验
    if (file === "00_overview.md" && !content.includes("Git 历史概览")) {
      console.log(`     ⚠️  缺少 "Git 历史概览" 标题`);
      allPassed = false;
    }
    if (file === "01_hot_files.md" && !content.includes("热点文件排行")) {
      console.log(`     ⚠️  缺少 "热点文件排行" 标题`);
      allPassed = false;
    }
    if (file === "02_recent_changes.md" && !content.includes("最近变更记录")) {
      console.log(`     ⚠️  缺少 "最近变更记录" 标题`);
      allPassed = false;
    }
    if (file === "03_contributors.md" && !content.includes("贡献者统计")) {
      console.log(`     ⚠️  缺少 "贡献者统计" 标题`);
      allPassed = false;
    }
  } catch {
    console.log(`  ❌ ${file} — 文件不存在`);
    allPassed = false;
  }
}

// ─── 打印 overview 内容 ───────────────────────────────────────────────────────
console.log("\n=== kb/git-log/fullstack-koa-react/00_overview.md ===");
try {
  const overview = await readFile(path.join(kbDir, "00_overview.md"), "utf8");
  console.log(overview);
} catch {
  console.log("(文件不存在)");
}

console.log("\n=== 验证结果 ===");
if (allPassed) {
  console.log("✅ adapter-git-log 验证全部通过！");
} else {
  console.log("❌ 部分验证未通过，请检查上方输出");
  process.exit(1);
}
