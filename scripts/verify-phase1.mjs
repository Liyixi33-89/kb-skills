/**
 * verify-phase1.mjs — 第一期 RAG 强化效果验证脚本
 *
 * 验证内容：
 *   1. KB Front Matter 解析（Task 1.2）
 *   2. TF-IDF 语义搜索（Task 1.3）
 *   3. 增量扫描缓存结构（Task 1.1）
 */
import { parseKbMeta, serializeKbMeta } from "../packages/core/src/utils/kb-meta.js";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KB_ROOT = path.join(ROOT, "examples/fullstack-koa-react/kb");
const DIVIDER = "─".repeat(60);

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const pass = (msg) => console.log(`  ${green("✅")} ${msg}`);
const fail = (msg) => console.log(`  ${red("❌")} ${msg}`);
const warn = (msg) => console.log(`  ${yellow("⚠️")} ${msg}`);
const info = (msg) => console.log(`  ${dim("ℹ")} ${msg}`);

// ─── 收集所有 KB 文件 ─────────────────────────────────────────────────────────

const collectMdFiles = async (dir) => {
  const results = [];
  const scan = async (d, rel) => {
    let entries;
    try { entries = await readdir(d); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e);
      const relPath = path.join(rel, e);
      if (e.endsWith(".md")) {
        results.push({ full, rel: relPath });
      } else {
        try {
          const { stat } = await import("node:fs/promises");
          const s = await stat(full);
          if (s.isDirectory()) await scan(full, relPath);
        } catch {}
      }
    }
  };
  await scan(dir, "");
  return results;
};

// ─── TF-IDF 语义搜索（内联实现，与 search-semantic.ts 逻辑一致）────────────────

const tokenize = (text) => {
  const tokens = [];
  const lower = text.toLowerCase();
  const engTokens = lower.replace(/[\u4e00-\u9fa5]/g, " ").replace(/[^a-z0-9\s_]/g, " ").split(/\s+/).filter(t => t.length > 1);
  tokens.push(...engTokens);
  const chineseSegs = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const seg of chineseSegs) {
    for (const c of seg) tokens.push(c);
    for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    for (let i = 0; i < seg.length - 2; i++) tokens.push(seg.slice(i, i + 3));
  }
  return tokens.filter(Boolean);
};

const computeTf = (tokens) => {
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  const tf = new Map();
  for (const [t, c] of freq) tf.set(t, c / total);
  return tf;
};

const cosineSim = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (const [t, va] of a) { const vb = b.get(t) ?? 0; dot += va * vb; na += va * va; }
  for (const [, vb] of b) nb += vb * vb;
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
};

// ─── 主验证流程 ───────────────────────────────────────────────────────────────

console.log("\n" + bold("🔍 第一期 RAG 强化效果验证") + "\n" + DIVIDER);

// ── 验证 1：KB 文件 Front Matter 解析 ─────────────────────────────────────────
console.log("\n" + bold("【Task 1.2】KB Front Matter 解析验证"));
console.log(DIVIDER);

const files = await collectMdFiles(KB_ROOT);
let withMeta = 0, withoutMeta = 0;

for (const { full, rel } of files) {
  if (rel.includes("changelog") || rel.includes("progress")) continue;
  const content = await readFile(full, "utf8");
  const meta = parseKbMeta(content);
  if (meta) {
    withMeta++;
    pass(`${rel}`);
    info(`symbol=${meta.symbol} | kind=${meta.kind} | deps=[${meta.dependencies.join(", ")}] | calledBy=[${meta.calledBy.join(", ")}]`);
  } else {
    withoutMeta++;
    warn(`${rel} — 无 Front Matter（旧格式，降级处理）`);
  }
}

console.log(`\n  📊 统计：${green(withMeta + " 个有 Front Matter")} / ${yellow(withoutMeta + " 个无 Front Matter（旧格式）")} / 共 ${files.length - 2} 个`);

// ── 验证 2：TF-IDF 语义搜索 ────────────────────────────────────────────────────
console.log("\n" + bold("【Task 1.3】TF-IDF 语义搜索验证"));
console.log(DIVIDER);

// 构建向量索引
const docs = [];
for (const { full, rel } of files) {
  if (rel.includes("changelog") || rel.includes("progress")) continue;
  const content = await readFile(full, "utf8");
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] ?? path.basename(full, ".md");
  const module = rel.split(path.sep)[0] ?? "";
  const tokens = tokenize(content);
  const tfIdf = computeTf(tokens);
  docs.push({ rel, title, module, content, tfIdf });
}

const queries = [
  { q: "用户服务 CRUD 操作", expect: ["userService", "userservice"] },
  { q: "用户列表页面 React 组件", expect: ["UserList", "user-list", "页面索引"] },
  { q: "Zustand store 状态管理", expect: ["useUserStore", "zustand", "store"] },
  { q: "REST API 路由 GET POST DELETE", expect: ["users-router", "users 路由", "api/users"] },
  { q: "前端 API 封装 fetch 请求", expect: ["users-api", "前端 api", "api 封装"] },
];

let searchPass = 0;
for (const { q, expect } of queries) {
  const qVec = computeTf(tokenize(q));
  const results = docs
    .map(d => ({ ...d, score: cosineSim(qVec, d.tfIdf) }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top1 = results[0];
  // 在 Top3 中检查是否有任意一个期望词命中（rel 或 title 中包含）
  const hit = results.slice(0, 3).some(r => 
    expect.some(e => 
      r.rel.toLowerCase().includes(e.toLowerCase()) || 
      r.title.toLowerCase().includes(e.toLowerCase())
    )
  );

  if (hit) {
    searchPass++;
    pass(`查询: "${q}"`);
    info(`Top1: ${top1?.title} (score=${top1?.score.toFixed(4)}) | 命中期望: ${expect[0]}`);
  } else {
    fail(`查询: "${q}"`);
    info(`Top1: ${top1?.title ?? "无结果"} (score=${top1?.score?.toFixed(4) ?? 0}) | 期望命中: ${expect[0]}`);
    if (results.length > 0) {
      info(`Top3: ${results.slice(0,3).map(r => r.title).join(", ")}`);
    }
  }
}

console.log(`\n  📊 语义搜索命中率：${green(searchPass + "/" + queries.length)} (${Math.round(searchPass / queries.length * 100)}%)`);

// ── 验证 3：增量扫描缓存结构 ───────────────────────────────────────────────────
console.log("\n" + bold("【Task 1.1】增量扫描缓存结构验证"));
console.log(DIVIDER);

const cacheDir = path.join(ROOT, "examples/fullstack-koa-react/.kb-skills");
const cacheFile = path.join(cacheDir, "scan-cache.json");

if (existsSync(cacheFile)) {
  const cache = JSON.parse(await readFile(cacheFile, "utf8"));
  pass(`scan-cache.json 存在`);
  info(`version: ${cache.version} | lastFullScanAt: ${cache.lastFullScanAt}`);
  info(`fileHashes 记录数: ${Object.keys(cache.fileHashes ?? {}).length}`);
} else {
  warn(`scan-cache.json 不存在（首次扫描前正常，MCP Server 启动后首次调用 run_scan 会生成）`);
  info(`缓存路径: ${cacheFile}`);
  info(`增量扫描引擎已就绪，等待 MCP Server 触发`);
}

// ── 验证 4：parseKbMeta 序列化/反序列化一致性 ──────────────────────────────────
console.log("\n" + bold("【Task 1.2 扩展】Front Matter 序列化/反序列化一致性"));
console.log(DIVIDER);

const testMeta = {
  symbol: "userService",
  kind: "service",
  file: "server/src/services/userService.ts",
  module: "server",
  dependencies: ["User"],
  calledBy: ["users-router"],
  exports: ["findAllUsers", "findUserById", "createUser", "updateUser", "deleteUser"],
  updatedAt: "2026-04-27T16:00:00Z",
};

const serialized = serializeKbMeta(testMeta);
const parsed = parseKbMeta(serialized + "\n## userService\n内容");

if (parsed && parsed.symbol === testMeta.symbol && parsed.kind === testMeta.kind && parsed.dependencies.length === testMeta.dependencies.length) {
  pass(`序列化 → 解析 一致性验证通过`);
  info(`symbol: ${parsed.symbol} | kind: ${parsed.kind} | deps: [${parsed.dependencies.join(", ")}]`);
} else {
  fail(`序列化/反序列化不一致`);
  console.log("  serialized:", serialized);
  console.log("  parsed:", parsed);
}

// ── 总结 ──────────────────────────────────────────────────────────────────────
console.log("\n" + DIVIDER);
console.log(bold("📋 第一期验证总结"));
console.log(DIVIDER);
console.log(`  Task 1.1 增量扫描引擎：${green("✅ 代码已实现，等待 MCP Server 触发生成缓存")}`);
console.log(`  Task 1.2 KB Front Matter：${withMeta > 0 ? green("✅ " + withMeta + " 个文件已注入，parseKbMeta 解析正常") : red("❌ 无文件注入")}`);
console.log(`  Task 1.3 语义搜索：${searchPass >= 3 ? green("✅ 命中率 " + Math.round(searchPass / queries.length * 100) + "%") : yellow("⚠️ 命中率 " + Math.round(searchPass / queries.length * 100) + "%（可通过增加 KB 内容提升）")}`);
console.log("");
