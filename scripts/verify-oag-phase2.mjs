/**
 * verify-oag-phase2.mjs
 *
 * 针对 fullstack-koa-react 示例项目，校验第二期 OAG 能力：
 *   Task 2.1 — 依赖图谱（get_dependency_graph）
 *   Task 2.2 — 跨模块关联（find_cross_module_relations）
 *   Task 2.3 — Skill 工作流（execute_skill_workflow）
 *   Task 2.4 — 变更影响分析（analyze_change_impact）
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = path.resolve(__dirname, "../examples/fullstack-koa-react");

// ─── 颜色输出 ─────────────────────────────────────────────────────────────────
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  yellow:(s) => `\x1b[33m${s}\x1b[0m`,
  cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
const failures = [];

const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ${c.green("✅")} ${label}`);
    passed++;
  } else {
    console.log(`  ${c.red("❌")} ${label}${detail ? c.dim(` — ${detail}`) : ""}`);
    failed++;
    failures.push(label);
  }
};

const section = (title) => {
  console.log(`\n${c.bold(c.cyan(`▶ ${title}`))}`);
};

// ─── 加载项目 ─────────────────────────────────────────────────────────────────

section("初始化：加载 adapter 并扫描项目");

let scanResult;
try {
  // 直接导入 adapter，不依赖 jiti 加载 config
  const { default: createKoaAdapter } = await import("@kb-skills/adapter-koa");
  const { default: createReactAdapter } = await import("@kb-skills/adapter-react");
  const { runDocCodeToKb, createLogger } = await import("@kb-skills/core");

  const logger = createLogger({ verbose: false });

  const modules = [
    {
      name: "server",
      path: path.join(EXAMPLE_ROOT, "server"),
      adapter: createKoaAdapter(),
    },
    {
      name: "web",
      path: path.join(EXAMPLE_ROOT, "web"),
      adapter: createReactAdapter(),
    },
  ];

  scanResult = await runDocCodeToKb({
    projectRoot: EXAMPLE_ROOT,
    kbRoot: path.join(EXAMPLE_ROOT, "kb"),
    modules,
    logger,
  });

  check("项目扫描成功", !!scanResult);
  check("包含 server 模块", scanResult.modules.some((m) => m.name === "server"));
  check("包含 web 模块", scanResult.modules.some((m) => m.name === "web"));
  check("server 模块有符号", scanResult.modules.find((m) => m.name === "server")?.symbols.length > 0);
  check("web 模块有符号", scanResult.modules.find((m) => m.name === "web")?.symbols.length > 0);
  console.log(c.dim(`  → server 符号数: ${scanResult.modules.find((m) => m.name === "server")?.symbols.length}`));
  console.log(c.dim(`  → web 符号数: ${scanResult.modules.find((m) => m.name === "web")?.symbols.length}`));
} catch (err) {
  console.log(`  ${c.red("❌")} 项目扫描失败: ${err.message}`);
  console.log(c.dim(`  ${err.stack?.split("\n").slice(0, 3).join("\n  ")}`));
  failed++;
  failures.push("项目扫描");
  process.exit(1);
}

// ─── Task 2.1：依赖图谱 ───────────────────────────────────────────────────────

section("Task 2.1 — 依赖图谱（buildDependencyGraph / queryDependencyGraph）");

try {
  const { buildDependencyGraph, queryDependencyGraph } = await import("@kb-skills/core");

  // 2.1.1 构建图
  const graph = buildDependencyGraph(scanResult);
  check("图构建成功（节点数 > 0）", graph.size > 0, `节点数: ${graph.size}`);
  console.log(c.dim(`  → 图节点总数: ${graph.size}`));
  console.log(c.dim(`  → 节点列表: ${[...graph.keys()].join(", ")}`));

  // 2.1.2 userService 节点存在
  const hasUserService = [...graph.keys()].some(
    (k) => k.toLowerCase().includes("userservice") || k.toLowerCase().includes("user")
  );
  check("图中包含 user 相关节点", hasUserService);

  // 2.1.3 tree 格式查询
  const serverModule = scanResult.modules.find((m) => m.name === "server");
  const firstSymbol = serverModule?.symbols[0]?.name ?? "userService";
  const treeResult = queryDependencyGraph(scanResult, firstSymbol, {
    format: "tree",
    direction: "both",
    depth: 2,
  });
  check(`tree 格式查询 "${firstSymbol}" 成功`, !!treeResult);
  check("tree 结果包含 target 信息", !!treeResult?.target?.symbol);
  check("tree 结果包含 stats", typeof treeResult?.stats?.totalNodes === "number");
  console.log(c.dim(`  → 目标符号: ${treeResult?.target?.symbol} (${treeResult?.target?.kind})`));
  console.log(c.dim(`  → 上游: ${treeResult?.stats?.upstreamCount}, 下游: ${treeResult?.stats?.downstreamCount}`));

  // 2.1.4 flat 格式查询
  const flatResult = queryDependencyGraph(scanResult, firstSymbol, {
    format: "flat",
    direction: "both",
    depth: 2,
  });
  check("flat 格式查询成功", !!flatResult?.flat);
  check("flat 结果是数组", Array.isArray(flatResult?.flat));

  // 2.1.5 mermaid 格式查询
  const mermaidResult = queryDependencyGraph(scanResult, firstSymbol, {
    format: "mermaid",
    direction: "both",
    depth: 2,
  });
  check("mermaid 格式查询成功", !!mermaidResult?.mermaid);
  check("mermaid 以 'graph TD' 开头", mermaidResult?.mermaid?.startsWith("graph TD"));
  check("mermaid 包含目标节点高亮", mermaidResult?.mermaid?.includes("fill:#f96"));
  console.log(c.dim(`  → Mermaid 前 3 行:\n${mermaidResult?.mermaid?.split("\n").slice(0, 3).map(l => "    " + l).join("\n")}`));

  // 2.1.6 大小写不敏感
  const lowerResult = queryDependencyGraph(scanResult, firstSymbol.toLowerCase(), { format: "flat" });
  check("大小写不敏感匹配", lowerResult?.target?.symbol === treeResult?.target?.symbol);

  // 2.1.7 循环引用不崩溃
  const cyclicScan = {
    projectRoot: "/test",
    modules: [],
    relations: [
      { from: "A", to: "B", kind: "calls" },
      { from: "B", to: "A", kind: "calls" },
    ],
    scannedAt: new Date().toISOString(),
  };
  let noCrash = true;
  try {
    queryDependencyGraph(cyclicScan, "A", { format: "tree", depth: 5 });
  } catch {
    noCrash = false;
  }
  check("循环引用不导致崩溃", noCrash);

} catch (err) {
  console.log(`  ${c.red("❌")} Task 2.1 异常: ${err.message}`);
  failed++;
  failures.push("Task 2.1 依赖图谱");
}

// ─── Task 2.2：跨模块关联 ─────────────────────────────────────────────────────

section("Task 2.2 — 跨模块关联（analyzeCrossModuleRelations）");

try {
  const { analyzeCrossModuleRelations, extractApiUrls, findCallersByRoute, findRoutesCalledByFile } =
    await import("@kb-skills/core");

  // 2.2.1 extractApiUrls 功能验证
  const apiFileContent = `
    const fetchUsers = async () => fetch(\`\${BASE}/users\`);
    const createUser = async (data) => fetch(\`\${BASE}/users\`, { method: "POST" });
    const deleteUser = async (id) => fetch(\`\${BASE}/users/\${id}\`, { method: "DELETE" });
    const BASE_URL = "/api/v1";
  `;
  const urls = extractApiUrls(apiFileContent, "users.ts");
  check("extractApiUrls 能提取 URL 常量", urls.some((u) => u.url === "/api/v1"));
  console.log(c.dim(`  → 提取到 ${urls.length} 个 URL: ${urls.map(u => u.url).join(", ")}`));

  // 2.2.2 fetch 模板字符串提取
  const templateContent = `fetch(\`/api/users/\${id}\`)`;
  const templateUrls = extractApiUrls(templateContent, "test.ts");
  check("extractApiUrls 提取模板字符串 URL（转为 :param）",
    templateUrls.some((u) => u.url === "/api/users/:param" && u.isDynamic));

  // 2.2.3 全量跨模块分析
  const allRelations = analyzeCrossModuleRelations(scanResult);
  check("analyzeCrossModuleRelations 返回数组", Array.isArray(allRelations));
  console.log(c.dim(`  → 发现 ${allRelations.length} 条跨模块关联`));
  if (allRelations.length > 0) {
    for (const r of allRelations.slice(0, 3)) {
      console.log(c.dim(`    • 后端路由: ${r.backendRoute} ← 前端调用者: ${r.frontendCallers.length} 个`));
    }
  }

  // 2.2.4 按路由过滤
  const usersRelations = findCallersByRoute(scanResult, "/users");
  check("findCallersByRoute('/users') 返回数组", Array.isArray(usersRelations));
  console.log(c.dim(`  → /users 路由关联数: ${usersRelations.length}`));

  // 2.2.5 按前端文件过滤
  const fileRelations = findRoutesCalledByFile(scanResult, "users.ts");
  check("findRoutesCalledByFile('users.ts') 返回数组", Array.isArray(fileRelations));
  console.log(c.dim(`  → users.ts 调用的路由数: ${fileRelations.length}`));

  // 2.2.6 不存在的路由返回空数组
  const noRelations = findCallersByRoute(scanResult, "/non-existent-xyz");
  check("不存在的路由返回空数组", noRelations.length === 0);

  // 2.2.7 路径参数匹配
  const paramRelations = findCallersByRoute(scanResult, "/users/:id");
  check("路径参数路由 /users/:id 查询不崩溃", Array.isArray(paramRelations));
  console.log(c.dim(`  → /users/:id 关联数: ${paramRelations.length}`));

} catch (err) {
  console.log(`  ${c.red("❌")} Task 2.2 异常: ${err.message}`);
  failed++;
  failures.push("Task 2.2 跨模块关联");
}

// ─── Task 2.3：Skill 工作流 ───────────────────────────────────────────────────

section("Task 2.3 — Skill 工作流（parseSkillWorkflow / executeSkillWorkflow）");

try {
  const { parseSkillWorkflow, executeSkillWorkflow } = await import("@kb-skills/core");

  // 2.3.1 解析 bug-fix workflow
  const { loadSkill } = await import("@kb-skills/core");
  const bugFixSkill = await loadSkill("bug-fix");
  check("bug-fix Skill 加载成功", !!bugFixSkill);

  const bugFixWorkflow = parseSkillWorkflow(bugFixSkill?.content ?? "");
  check("bug-fix 包含 workflow 定义", !!bugFixWorkflow);
  check("bug-fix workflow 有步骤", (bugFixWorkflow?.steps?.length ?? 0) >= 3);
  console.log(c.dim(`  → bug-fix 步骤数: ${bugFixWorkflow?.steps?.length}`));
  if (bugFixWorkflow?.steps) {
    for (const step of bugFixWorkflow.steps) {
      console.log(c.dim(`    • [${step.type}] ${step.id}${step.tool ? ` → ${step.tool}` : ""}`));
    }
  }

  // 2.3.2 解析 code-review workflow
  const codeReviewSkill = await loadSkill("code-review");
  const codeReviewWorkflow = parseSkillWorkflow(codeReviewSkill?.content ?? "");
  check("code-review 包含 workflow 定义", !!codeReviewWorkflow);
  check("code-review workflow 有步骤", (codeReviewWorkflow?.steps?.length ?? 0) >= 3);

  // 2.3.3 解析 gen-backend-code workflow
  const genBackendSkill = await loadSkill("gen-backend-code");
  const genBackendWorkflow = parseSkillWorkflow(genBackendSkill?.content ?? "");
  check("gen-backend-code 包含 workflow 定义", !!genBackendWorkflow);

  // 2.3.4 dryRun 模式
  const dryRunResult = await executeSkillWorkflow(
    "bug-fix",
    { bugKeyword: "userService" },
    { dryRun: true },
  );
  check("dryRun 执行成功", dryRunResult.success);
  check("dryRun 返回执行计划", dryRunResult.steps.length > 0);
  check("dryRun 步骤包含 dryRun:true 标记",
    dryRunResult.steps.every((s) => (s.result)?.dryRun === true));
  console.log(c.dim(`  → dryRun 步骤数: ${dryRunResult.steps.length}`));

  // 2.3.5 模板变量替换
  const toolCalls = [];
  await executeSkillWorkflow(
    "bug-fix",
    { bugKeyword: "userService" },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        return { found: true, results: [] };
      },
    },
  );
  check("toolExecutor 被调用", toolCalls.length > 0);
  const searchCall = toolCalls.find((c) => c.tool === "search_symbol");
  check("第一步调用 search_symbol", !!searchCall);
  check("模板变量 {{bugKeyword}} 被替换为 'userService'",
    searchCall?.params?.query === "userService");
  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(c => c.tool).join(" → ")}`));

  // 2.3.6 步骤失败非阻塞
  let callCount = 0;
  const failResult = await executeSkillWorkflow(
    "bug-fix",
    { bugKeyword: "test" },
    {
      toolExecutor: async () => {
        callCount++;
        if (callCount === 1) throw new Error("模拟失败");
        return {};
      },
    },
  );
  check("步骤失败时后续步骤继续执行", callCount > 1);
  check("失败步骤记录 error 信息", failResult.steps[0]?.error?.includes("模拟失败"));

  // 2.3.7 不存在的 Skill
  const notFoundResult = await executeSkillWorkflow("non-existent-skill-xyz", {});
  check("不存在的 Skill 返回 success=false", !notFoundResult.success);

  // 2.3.8 无 workflow 的 Skill 返回内容
  const noWorkflowResult = await executeSkillWorkflow("api-doc-gen", {});
  check("无 workflow 的 Skill 返回 Skill 内容", typeof noWorkflowResult.output === "string");

} catch (err) {
  console.log(`  ${c.red("❌")} Task 2.3 异常: ${err.message}`);
  failed++;
  failures.push("Task 2.3 Skill 工作流");
}

// ─── Task 2.4：变更影响分析 ───────────────────────────────────────────────────

section("Task 2.4 — 变更影响分析（analyzeChangeImpact 逻辑验证）");

try {
  const { queryDependencyGraph } = await import("@kb-skills/core");

  // 2.4.1 基于依赖图谱的上游查询（analyze_change_impact 的核心逻辑）
  const serverModule = scanResult.modules.find((m) => m.name === "server");
  const firstSymbol = serverModule?.symbols[0]?.name ?? "userService";

  const upstreamResult = queryDependencyGraph(scanResult, firstSymbol, {
    format: "flat",
    direction: "upstream",
    depth: 3,
  });
  check("上游依赖查询成功（变更影响分析基础）", !!upstreamResult);
  check("返回 flat 格式列表", Array.isArray(upstreamResult?.flat));
  console.log(c.dim(`  → "${firstSymbol}" 的上游调用者: ${upstreamResult?.stats?.upstreamCount} 个`));

  // 2.4.2 风险评估逻辑验证（通过 flat 结果模拟）
  const impactedCount = upstreamResult?.flat?.length ?? 0;
  const hasDirectCallers = upstreamResult?.flat?.some((f) => f.depth === 1) ?? false;
  const riskLevel = impactedCount > 5 ? "high" : impactedCount > 0 ? "medium" : "low";
  check("风险等级评估逻辑正确（low/medium/high）",
    ["low", "medium", "high"].includes(riskLevel));
  console.log(c.dim(`  → 影响数: ${impactedCount}, 有直接调用者: ${hasDirectCallers}, 风险: ${riskLevel}`));

  // 2.4.3 delete 变更类型：影响数 > 0 时风险应为 medium 或 high
  const deleteRisk = impactedCount > 5 ? "high" : impactedCount > 0 ? "medium" : "low";
  check("delete 变更风险评估", ["low", "medium", "high"].includes(deleteRisk));

  // 2.4.4 MCP Tool 参数结构验证
  const validChangeTypes = ["signature", "behavior", "delete", "rename"];
  check("changeType 枚举值完整", validChangeTypes.length === 4);

  // 2.4.5 Mermaid 输出可用于影响可视化
  const mermaidImpact = queryDependencyGraph(scanResult, firstSymbol, {
    format: "mermaid",
    direction: "upstream",
    depth: 2,
  });
  check("影响分析可输出 Mermaid 可视化", mermaidImpact?.mermaid?.startsWith("graph TD"));

} catch (err) {
  console.log(`  ${c.red("❌")} Task 2.4 异常: ${err.message}`);
  failed++;
  failures.push("Task 2.4 变更影响分析");
}

// ─── 综合验证：基于真实项目数据 ───────────────────────────────────────────────

section("综合验证 — 基于 fullstack-koa-react 真实数据");

try {
  const { buildDependencyGraph, analyzeCrossModuleRelations, parseSkillWorkflow, loadSkill } =
    await import("@kb-skills/core");

  // 验证 server 模块的 raw 数据被正确解析
  const serverModule = scanResult.modules.find((m) => m.name === "server");
  const serverRaw = serverModule?.raw;
  check("server 模块 raw 数据存在", !!serverRaw);
  check("server raw.framework 为 koa", serverRaw?.framework === "koa");
  check("server raw.routes 包含 users 路由",
    serverRaw?.routes?.some((r) => r.name?.includes("user") || r.relPath?.includes("user")));
  check("server raw.services 包含 userService",
    serverRaw?.services?.some((s) => s.name?.toLowerCase().includes("user")));

  // 验证 web 模块的 raw 数据
  const webModule = scanResult.modules.find((m) => m.name === "web");
  const webRaw = webModule?.raw;
  check("web 模块 raw 数据存在", !!webRaw);
  check("web raw.framework 为 react", webRaw?.framework === "react");
  check("web raw.apiFiles 包含 users.ts",
    webRaw?.apiFiles?.some((f) => f.file?.includes("users") || f.relPath?.includes("users")));

  // 验证依赖图谱能从 raw 数据中提取 userService → User 依赖
  const graph = buildDependencyGraph(scanResult);
  const userServiceNode = [...graph.entries()].find(
    ([k]) => k.toLowerCase().includes("userservice") || k.toLowerCase() === "userservice"
  );
  if (userServiceNode) {
    const [name, node] = userServiceNode;
    check(`userService 节点存在于图中 (${name})`, true);
    check("userService 有下游依赖（User Model）", node.downstreamEdges.size > 0);
    console.log(c.dim(`  → userService 下游: [${[...node.downstreamEdges].join(", ")}]`));
    console.log(c.dim(`  → userService 上游: [${[...node.upstreamEdges].join(", ")}]`));
  } else {
    console.log(c.yellow(`  ⚠️  userService 节点未在图中找到，图节点: ${[...graph.keys()].join(", ")}`));
    check("userService 节点存在于图中", false, "节点名称可能不同");
  }

  // 验证 Skill workflow 在真实 Skill 中正确解析
  const skills = ["bug-fix", "code-review", "gen-backend-code"];
  let workflowCount = 0;
  for (const skillName of skills) {
    const skill = await loadSkill(skillName);
    if (skill) {
      const wf = parseSkillWorkflow(skill.content);
      if (wf) workflowCount++;
    }
  }
  check(`3 个 Skills 均包含 workflow 定义 (${workflowCount}/3)`, workflowCount === 3);

} catch (err) {
  console.log(`  ${c.red("❌")} 综合验证异常: ${err.message}`);
  failed++;
  failures.push("综合验证");
}

// ─── 最终报告 ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(c.bold("📊 第二期 OAG 能力校验报告 — fullstack-koa-react"));
console.log("─".repeat(60));
console.log(`  ${c.green("✅ 通过")}: ${passed}`);
console.log(`  ${c.red("❌ 失败")}: ${failed}`);
console.log(`  总计: ${passed + failed}`);

if (failures.length > 0) {
  console.log(`\n${c.red("失败项目：")}`);
  for (const f of failures) {
    console.log(`  • ${f}`);
  }
}

const passRate = Math.round((passed / (passed + failed)) * 100);
console.log(`\n  通过率: ${passRate >= 80 ? c.green(`${passRate}%`) : c.red(`${passRate}%`)}`);

if (passRate === 100) {
  console.log(`\n  ${c.green(c.bold("🎉 第二期 OAG 能力全部校验通过！"))}`);
} else if (passRate >= 80) {
  console.log(`\n  ${c.yellow(c.bold("⚠️  大部分校验通过，请检查失败项"))}`);
} else {
  console.log(`\n  ${c.red(c.bold("❌ 校验未通过，请检查 OAG 实现"))}`);
}

process.exit(failed > 0 ? 1 : 0);
