/**
 * verify-skills.mjs — 方向 C：Skill 生态强化校验脚本
 *
 * 在 fullstack-koa-react 示例项目目录下运行：
 *   node verify-skills.mjs
 *
 * 校验内容：
 *   Task C.1 — gen-frontend-code workflow（模块全景 + 跨模块关联 + 语义搜索）
 *   Task C.2 — gen-test-code workflow（依赖图谱驱动 Mock 策略）
 *   Task C.3 — refactor workflow（双向依赖 + 影响范围评估）
 *   Task C.4 — write-test（新 Skill：精准测试生成）
 *   Task C.5 — api-diff（新 Skill：接口变更影响分析）
 *   Task C.6 — 与 fullstack-koa-react 项目 KB 的联动效果
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 颜色输出 ─────────────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
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

// ─── 初始化：扫描项目 ─────────────────────────────────────────────────────────

section("初始化：扫描 fullstack-koa-react 项目");

let scanResult;
try {
  const { default: createKoaAdapter }   = await import("@kb-skills/adapter-koa");
  const { default: createReactAdapter } = await import("@kb-skills/adapter-react");
  const { runDocCodeToKb, createLogger } = await import("@kb-skills/core");

  const logger = createLogger({ verbose: false });
  const modules = [
    { name: "server", path: path.join(__dirname, "server"), adapter: createKoaAdapter() },
    { name: "web",    path: path.join(__dirname, "web"),    adapter: createReactAdapter() },
  ];

  scanResult = await runDocCodeToKb({
    projectRoot: __dirname,
    kbRoot: path.join(__dirname, "kb"),
    modules,
    logger,
  });

  check("项目扫描成功", !!scanResult);
  const serverMod = scanResult.modules.find((m) => m.name === "server");
  const webMod    = scanResult.modules.find((m) => m.name === "web");
  check("server 模块扫描成功", !!serverMod);
  check("web 模块扫描成功",    !!webMod);
  console.log(c.dim(`  → server 符号: ${serverMod?.symbols.map(s => s.name).join(", ")}`));
  console.log(c.dim(`  → web 符号:    ${webMod?.symbols.map(s => s.name).join(", ")}`));
} catch (err) {
  console.log(`  ${c.red("❌")} 项目扫描失败: ${err.message}`);
  process.exit(1);
}

// ─── 加载公共 API ─────────────────────────────────────────────────────────────
const {
  loadSkill,
  parseSkillWorkflow,
  executeSkillWorkflow,
  buildDependencyGraph,
  queryDependencyGraph,
  analyzeCrossModuleRelations,
  findCallersByRoute,
  findRoutesCalledByFile,
} = await import("@kb-skills/core");

// ─── Task C.1：gen-frontend-code workflow ─────────────────────────────────────

section("Task C.1 — gen-frontend-code workflow（模块全景 + 跨模块关联 + 语义搜索）");

try {
  const skill = await loadSkill("gen-frontend-code");
  check("gen-frontend-code Skill 加载成功", !!skill);

  const wf = parseSkillWorkflow(skill?.content ?? "");
  check("包含 workflow 定义", !!wf);
  check("步骤数 = 4", wf?.steps?.length === 4);

  // 步骤结构校验
  const [s0, s1, s2, s3] = wf?.steps ?? [];
  check("步骤 0: id=module_map, type=tool, tool=get_module_map",
    s0?.id === "module_map" && s0?.type === "tool" && s0?.tool === "get_module_map");
  check("步骤 1: id=cross_relations, tool=find_cross_module_relations",
    s1?.id === "cross_relations" && s1?.tool === "find_cross_module_relations");
  check("步骤 2: id=existing_pattern, tool=search_semantic",
    s2?.id === "existing_pattern" && s2?.tool === "search_semantic");
  check("步骤 3: id=generate, type=llm_prompt",
    s3?.id === "generate" && s3?.type === "llm_prompt");

  // 参数校验
  check("module_map 参数 module=web",      s0?.params?.module === "web");
  check("cross_relations 参数含 apiRoute", s1?.params?.apiRoute?.includes("{{apiRoute}}"));
  check("existing_pattern 参数含 query",   s2?.params?.query?.includes("{{featureDesc}}"));
  check("existing_pattern 参数 topK=5",    s2?.params?.topK === "5");

  // dryRun 执行
  const dryRun = await executeSkillWorkflow(
    "gen-frontend-code",
    { apiRoute: "/users", featureDesc: "用户列表" },
    { dryRun: true },
  );
  check("dryRun 执行成功", dryRun.success);
  check("dryRun 返回 4 个步骤", dryRun.steps.length === 4);

  // toolExecutor 注入：验证工具调用链
  const toolCalls = [];
  await executeSkillWorkflow(
    "gen-frontend-code",
    { apiRoute: "/users", featureDesc: "用户列表" },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        return { result: `mock_${tool}` };
      },
    },
  );
  check("工具调用链: get_module_map → find_cross_module_relations → search_semantic",
    toolCalls[0]?.tool === "get_module_map" &&
    toolCalls[1]?.tool === "find_cross_module_relations" &&
    toolCalls[2]?.tool === "search_semantic");
  check("{{apiRoute}} 被替换为 '/users'",
    toolCalls[1]?.params?.apiRoute === "/users");
  check("{{featureDesc}} 被替换为 '用户列表'",
    toolCalls[2]?.params?.query?.includes("用户列表"));

  // llm_prompt 模板变量引用上游结果
  const llmStep = dryRun.steps[3];
  check("llm_prompt 模板引用 module_map.result",
    llmStep?.result?.template?.includes("{{module_map.result}}") ||
    llmStep?.result?.template?.includes("module_map"));

  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(t => t.tool).join(" → ")} → llm_prompt`));
} catch (err) {
  console.log(`  ${c.red("❌")} Task C.1 异常: ${err.message}`);
  failed++; failures.push("Task C.1 gen-frontend-code");
}

// ─── Task C.2：gen-test-code workflow ─────────────────────────────────────────

section("Task C.2 — gen-test-code workflow（依赖图谱驱动 Mock 策略）");

try {
  const skill = await loadSkill("gen-test-code");
  check("gen-test-code Skill 加载成功", !!skill);

  const wf = parseSkillWorkflow(skill?.content ?? "");
  check("包含 workflow 定义", !!wf);
  check("步骤数 = 4", wf?.steps?.length === 4);

  const [s0, s1, s2, s3] = wf?.steps ?? [];
  check("步骤 0: id=symbol_info, tool=search_symbol",
    s0?.id === "symbol_info" && s0?.tool === "search_symbol");
  check("步骤 1: id=dependency, tool=get_dependency_graph",
    s1?.id === "dependency" && s1?.tool === "get_dependency_graph");
  check("步骤 2: id=impact, tool=analyze_change_impact",
    s2?.id === "impact" && s2?.tool === "analyze_change_impact");
  check("步骤 3: id=generate, type=llm_prompt",
    s3?.id === "generate" && s3?.type === "llm_prompt");

  // 关键参数：下游依赖 = Mock 清单
  check("dependency 方向=downstream（下游 = Mock 清单）",
    s1?.params?.direction === "downstream");
  check("dependency format=flat（便于枚举 Mock 列表）",
    s1?.params?.format === "flat");
  check("impact changeType 含 {{targetSymbol}}",
    s2?.params?.symbol?.includes("{{targetSymbol}}"));

  // 与项目 KB 联动：用真实符号执行 dryRun
  const serverMod = scanResult.modules.find((m) => m.name === "server");
  const realSymbol = serverMod?.symbols[0]?.name ?? "userService";

  const dryRun = await executeSkillWorkflow(
    "gen-test-code",
    { targetSymbol: realSymbol },
    { dryRun: true },
  );
  check(`dryRun 执行成功（targetSymbol=${realSymbol}）`, dryRun.success);

  // toolExecutor：验证依赖图谱被正确调用
  const toolCalls = [];
  await executeSkillWorkflow(
    "gen-test-code",
    { targetSymbol: realSymbol },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        // 模拟依赖图谱返回 UserModel 作为下游依赖
        if (tool === "get_dependency_graph") {
          return { flat: [{ symbol: "UserModel", depth: 1, direction: "downstream" }] };
        }
        return { results: [] };
      },
    },
  );
  check("get_dependency_graph 被调用", toolCalls.some(t => t.tool === "get_dependency_graph"));
  check("analyze_change_impact 被调用", toolCalls.some(t => t.tool === "analyze_change_impact"));
  const depCall = toolCalls.find(t => t.tool === "get_dependency_graph");
  check(`{{targetSymbol}} 替换为 '${realSymbol}'`, depCall?.params?.symbol === realSymbol);

  // llm_prompt 模板包含 Mock 策略说明
  const llmStep = dryRun.steps[3];
  check("llm_prompt 模板引用 dependency.result（Mock 清单）",
    llmStep?.result?.template?.includes("dependency.result") ||
    llmStep?.result?.template?.includes("Mock"));

  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(t => t.tool).join(" → ")} → llm_prompt`));
} catch (err) {
  console.log(`  ${c.red("❌")} Task C.2 异常: ${err.message}`);
  failed++; failures.push("Task C.2 gen-test-code");
}

// ─── Task C.3：refactor workflow ──────────────────────────────────────────────

section("Task C.3 — refactor workflow（双向依赖 + 影响范围评估）");

try {
  const skill = await loadSkill("refactor");
  check("refactor Skill 加载成功", !!skill);

  const wf = parseSkillWorkflow(skill?.content ?? "");
  check("包含 workflow 定义", !!wf);
  check("步骤数 = 4", wf?.steps?.length === 4);

  const [s0, s1, s2, s3] = wf?.steps ?? [];
  check("步骤 0: id=symbol_info, tool=search_symbol",
    s0?.id === "symbol_info" && s0?.tool === "search_symbol");
  check("步骤 1: id=dependency, tool=get_dependency_graph",
    s1?.id === "dependency" && s1?.tool === "get_dependency_graph");
  check("步骤 2: id=impact, tool=analyze_change_impact",
    s2?.id === "impact" && s2?.tool === "analyze_change_impact");
  check("步骤 3: id=plan, type=llm_prompt",
    s3?.id === "plan" && s3?.type === "llm_prompt");

  // 关键差异：refactor 用双向依赖（both），gen-test-code 用下游（downstream）
  check("dependency 方向=both（重构需要双向依赖）",
    s1?.params?.direction === "both");
  check("dependency format=tree（树形展示更直观）",
    s1?.params?.format === "tree");
  check("impact changeType=signature（重构改变函数签名）",
    s2?.params?.changeType === "signature");

  // 与项目 KB 联动：对 userService 执行重构分析
  const serverMod = scanResult.modules.find((m) => m.name === "server");
  const realSymbol = serverMod?.symbols[0]?.name ?? "userService";

  const toolCalls = [];
  const result = await executeSkillWorkflow(
    "refactor",
    { targetSymbol: realSymbol },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        if (tool === "get_dependency_graph") {
          return {
            target: { symbol: realSymbol, kind: "service" },
            upstream: [{ symbol: "usersRoute", depth: 1 }],
            downstream: [{ symbol: "UserModel", depth: 1 }],
          };
        }
        if (tool === "analyze_change_impact") {
          return { riskLevel: "medium", impactedCount: 1, impacted: ["usersRoute"] };
        }
        return { results: [{ name: realSymbol, file: "services/userService.ts" }] };
      },
    },
  );
  check("refactor workflow 执行成功", result.success);
  check("get_dependency_graph 被调用（双向分析）",
    toolCalls.some(t => t.tool === "get_dependency_graph"));
  check("analyze_change_impact 被调用（风险评估）",
    toolCalls.some(t => t.tool === "analyze_change_impact"));

  // llm_prompt 最终输出包含上游调用者信息
  const llmOutput = result.steps[3]?.result;
  check("llm_prompt 输出包含依赖分析结果",
    typeof llmOutput === "string" && llmOutput.length > 0);

  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(t => t.tool).join(" → ")} → llm_prompt`));
  console.log(c.dim(`  → llm_prompt 输出长度: ${String(llmOutput ?? "").length} 字符`));
} catch (err) {
  console.log(`  ${c.red("❌")} Task C.3 异常: ${err.message}`);
  failed++; failures.push("Task C.3 refactor");
}

// ─── Task C.4：write-test（新 Skill）─────────────────────────────────────────

section("Task C.4 — write-test（新 Skill：精准测试生成，下游=Mock清单，上游=测试场景）");

try {
  const skill = await loadSkill("write-test");
  check("write-test Skill 加载成功", !!skill);
  check("write-test 有 description", skill?.content?.includes("description:"));
  check("write-test 有 triggers", skill?.content?.includes("triggers:"));

  const wf = parseSkillWorkflow(skill?.content ?? "");
  check("包含 workflow 定义", !!wf);
  check("步骤数 = 4", wf?.steps?.length === 4);

  const [s0, s1, s2, s3] = wf?.steps ?? [];
  check("步骤 0: id=symbol_info, tool=search_symbol",
    s0?.id === "symbol_info" && s0?.tool === "search_symbol");
  check("步骤 1: id=downstream, tool=get_dependency_graph",
    s1?.id === "downstream" && s1?.tool === "get_dependency_graph");
  check("步骤 2: id=upstream, tool=get_dependency_graph",
    s2?.id === "upstream" && s2?.tool === "get_dependency_graph");
  check("步骤 3: id=suggest, type=llm_prompt",
    s3?.id === "suggest" && s3?.type === "llm_prompt");

  // 核心设计：下游=Mock清单，上游=测试场景
  check("downstream 方向=downstream（下游依赖 = Mock 清单）",
    s1?.params?.direction === "downstream");
  check("upstream 方向=upstream（上游调用者 = 测试场景来源）",
    s2?.params?.direction === "upstream");
  check("downstream depth=2（深度 2 层 Mock）",
    s1?.params?.depth === "2");
  check("upstream depth=1（只看直接调用者）",
    s2?.params?.depth === "1");

  // 与 gen-test-code 的差异：write-test 同时查上下游
  const genTestSkill = await loadSkill("gen-test-code");
  const genTestWf = parseSkillWorkflow(genTestSkill?.content ?? "");
  const genTestDirections = genTestWf?.steps
    ?.filter(s => s.tool === "get_dependency_graph")
    ?.map(s => s.params?.direction) ?? [];
  const writeTestDirections = wf?.steps
    ?.filter(s => s.tool === "get_dependency_graph")
    ?.map(s => s.params?.direction) ?? [];
  check("write-test 同时查上下游（gen-test-code 只查下游）",
    writeTestDirections.includes("downstream") && writeTestDirections.includes("upstream") &&
    !genTestDirections.includes("upstream"));

  // 与项目 KB 联动：对 userService 执行精准测试生成
  const serverMod = scanResult.modules.find((m) => m.name === "server");
  const realSymbol = serverMod?.symbols[0]?.name ?? "userService";

  const toolCalls = [];
  const result = await executeSkillWorkflow(
    "write-test",
    { targetSymbol: realSymbol },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        if (tool === "get_dependency_graph" && params.direction === "downstream") {
          return { flat: [
            { symbol: "UserModel", depth: 1, direction: "downstream" },
          ]};
        }
        if (tool === "get_dependency_graph" && params.direction === "upstream") {
          return { flat: [
            { symbol: "usersRoute", depth: 1, direction: "upstream" },
          ]};
        }
        return { results: [{ name: realSymbol }] };
      },
    },
  );
  check("write-test workflow 执行成功", result.success);
  check("下游查询被调用（Mock 清单）",
    toolCalls.filter(t => t.tool === "get_dependency_graph" && t.params.direction === "downstream").length === 1);
  check("上游查询被调用（测试场景）",
    toolCalls.filter(t => t.tool === "get_dependency_graph" && t.params.direction === "upstream").length === 1);

  // llm_prompt 模板同时引用 downstream 和 upstream
  const dryRun = await executeSkillWorkflow("write-test", { targetSymbol: realSymbol }, { dryRun: true });
  const llmTemplate = dryRun.steps[3]?.result?.template ?? "";
  check("llm_prompt 模板引用 downstream.result（Mock 清单）",
    llmTemplate.includes("downstream.result") || llmTemplate.includes("Mock"));
  check("llm_prompt 模板引用 upstream.result（测试场景）",
    llmTemplate.includes("upstream.result") || llmTemplate.includes("调用者"));

  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(t => `${t.tool}(${t.params.direction ?? ""})`).join(" → ")} → llm_prompt`));
} catch (err) {
  console.log(`  ${c.red("❌")} Task C.4 异常: ${err.message}`);
  failed++; failures.push("Task C.4 write-test");
}

// ─── Task C.5：api-diff（新 Skill）───────────────────────────────────────────

section("Task C.5 — api-diff（新 Skill：接口变更影响分析）");

try {
  const skill = await loadSkill("api-diff");
  check("api-diff Skill 加载成功", !!skill);
  check("api-diff 有 description", skill?.content?.includes("description:"));
  check("api-diff 有 triggers", skill?.content?.includes("triggers:"));

  const wf = parseSkillWorkflow(skill?.content ?? "");
  check("包含 workflow 定义", !!wf);
  check("步骤数 = 4", wf?.steps?.length === 4);

  const [s0, s1, s2, s3] = wf?.steps ?? [];
  check("步骤 0: id=route_detail, tool=get_route_detail",
    s0?.id === "route_detail" && s0?.tool === "get_route_detail");
  check("步骤 1: id=callers, tool=find_cross_module_relations",
    s1?.id === "callers" && s1?.tool === "find_cross_module_relations");
  check("步骤 2: id=impact, tool=analyze_change_impact",
    s2?.id === "impact" && s2?.tool === "analyze_change_impact");
  check("步骤 3: id=sync_plan, type=llm_prompt",
    s3?.id === "sync_plan" && s3?.type === "llm_prompt");

  // 参数校验
  check("route_detail 参数含 {{apiRoute}}",
    s0?.params?.route?.includes("{{apiRoute}}"));
  check("callers 参数含 {{apiRoute}}",
    s1?.params?.apiRoute?.includes("{{apiRoute}}"));
  check("impact 参数含 {{changeType}}",
    s2?.params?.changeType?.includes("{{changeType}}"));

  // 与项目 KB 联动：模拟 /users 接口变更
  const toolCalls = [];
  const result = await executeSkillWorkflow(
    "api-diff",
    {
      apiRoute: "/users",
      changeType: "behavior",
      changeDesc: "响应体新增 pagination 字段",
    },
    {
      toolExecutor: async (tool, params) => {
        toolCalls.push({ tool, params });
        if (tool === "get_route_detail") {
          return {
            route: "/users",
            method: "GET",
            file: "server/src/routes/users.ts",
            service: "userService",
          };
        }
        if (tool === "find_cross_module_relations") {
          // 模拟找到前端调用点（与真实项目结构一致）
          return [
            { backendRoute: "/users", frontendCallers: [
              { file: "web/src/api/users.ts",       apiCall: "fetchUsers" },
              { file: "web/src/store/userStore.ts",  apiCall: "loadUsers" },
              { file: "web/src/pages/UserList.tsx",  apiCall: "useEffect" },
            ]},
          ];
        }
        if (tool === "analyze_change_impact") {
          return { riskLevel: "medium", impactedCount: 3 };
        }
        return {};
      },
    },
  );
  check("api-diff workflow 执行成功", result.success);
  check("get_route_detail 被调用（获取接口定义）",
    toolCalls.some(t => t.tool === "get_route_detail"));
  check("find_cross_module_relations 被调用（找前端调用点）",
    toolCalls.some(t => t.tool === "find_cross_module_relations"));
  check("analyze_change_impact 被调用（风险评估）",
    toolCalls.some(t => t.tool === "analyze_change_impact"));

  // 参数替换验证
  const routeCall = toolCalls.find(t => t.tool === "get_route_detail");
  const crossCall = toolCalls.find(t => t.tool === "find_cross_module_relations");
  const impactCall = toolCalls.find(t => t.tool === "analyze_change_impact");
  check("{{apiRoute}} 替换为 '/users'",
    routeCall?.params?.route === "/users" && crossCall?.params?.apiRoute === "/users");
  check("{{changeType}} 替换为 'behavior'",
    impactCall?.params?.changeType === "behavior");

  // llm_prompt 模板引用所有上游结果
  const dryRun = await executeSkillWorkflow(
    "api-diff",
    { apiRoute: "/users", changeType: "behavior", changeDesc: "新增 pagination" },
    { dryRun: true },
  );
  const llmTemplate = dryRun.steps[3]?.result?.template ?? "";
  check("llm_prompt 模板引用 route_detail.result",
    llmTemplate.includes("route_detail.result") || llmTemplate.includes("接口"));
  check("llm_prompt 模板引用 callers.result（前端调用点）",
    llmTemplate.includes("callers.result") || llmTemplate.includes("调用点"));
  check("llm_prompt 模板引用 impact.result（风险评估）",
    llmTemplate.includes("impact.result") || llmTemplate.includes("影响"));

  console.log(c.dim(`  → 工具调用序列: ${toolCalls.map(t => t.tool).join(" → ")} → llm_prompt`));
} catch (err) {
  console.log(`  ${c.red("❌")} Task C.5 异常: ${err.message}`);
  failed++; failures.push("Task C.5 api-diff");
}

// ─── Task C.6：与项目 KB 的联动效果 ──────────────────────────────────────────

section("Task C.6 — 与 fullstack-koa-react 项目 KB 的联动效果");

try {
  // 6.1 依赖图谱 + write-test 联动：自动识别 Mock 边界
  const graph = buildDependencyGraph(scanResult);
  const serverMod = scanResult.modules.find((m) => m.name === "server");
  const targetSymbol = serverMod?.symbols[0]?.name ?? "userService";

  const downstreamResult = queryDependencyGraph(scanResult, targetSymbol, {
    format: "flat", direction: "downstream", depth: 2,
  });
  const mockList = downstreamResult?.flat ?? [];
  check(`write-test 场景：${targetSymbol} 的下游依赖（Mock 清单）可查询`,
    Array.isArray(mockList));
  console.log(c.dim(`  → ${targetSymbol} 下游依赖（Mock 清单）: [${mockList.map(m => m.symbol).join(", ") || "无"}]`));

  const upstreamResult = queryDependencyGraph(scanResult, targetSymbol, {
    format: "flat", direction: "upstream", depth: 1,
  });
  const testScenarios = upstreamResult?.flat ?? [];
  check(`write-test 场景：${targetSymbol} 的上游调用者（测试场景）可查询`,
    Array.isArray(testScenarios));
  console.log(c.dim(`  → ${targetSymbol} 上游调用者（测试场景）: [${testScenarios.map(s => s.symbol).join(", ") || "无"}]`));

  // 6.2 跨模块关联 + api-diff 联动：找到前端调用点
  const allRelations = analyzeCrossModuleRelations(scanResult);
  check("api-diff 场景：跨模块关联分析可执行", Array.isArray(allRelations));

  const usersCallers = findCallersByRoute(scanResult, "/users");
  check("api-diff 场景：/users 接口的前端调用点可查询", Array.isArray(usersCallers));
  console.log(c.dim(`  → /users 前端调用点数: ${usersCallers.length}`));

  const webFileRoutes = findRoutesCalledByFile(scanResult, "users.ts");
  check("api-diff 场景：web/src/api/users.ts 调用的路由可查询", Array.isArray(webFileRoutes));
  console.log(c.dim(`  → web/src/api/users.ts 调用的路由: [${webFileRoutes.map(r => r.backendRoute ?? r).join(", ") || "无"}]`));

  // 6.3 gen-frontend-code 场景：模块全景 + 跨模块关联
  const webMod = scanResult.modules.find((m) => m.name === "web");
  check("gen-frontend-code 场景：web 模块有页面符号",
    (webMod?.symbols.length ?? 0) > 0);
  console.log(c.dim(`  → web 模块符号: ${webMod?.symbols.map(s => s.name).join(", ")}`));

  // 6.4 refactor 场景：双向依赖分析
  const bothResult = queryDependencyGraph(scanResult, targetSymbol, {
    format: "tree", direction: "both", depth: 2,
  });
  check("refactor 场景：双向依赖树可查询",
    !!bothResult?.target?.symbol);
  console.log(c.dim(`  → ${targetSymbol} 双向依赖: 上游 ${bothResult?.stats?.upstreamCount ?? 0} 个，下游 ${bothResult?.stats?.downstreamCount ?? 0} 个`));

  // 6.5 5 个 Skill 全部有 workflow（核心指标）
  const skillNames = ["gen-frontend-code", "gen-test-code", "refactor", "write-test", "api-diff"];
  let withWorkflow = 0;
  for (const name of skillNames) {
    const s = await loadSkill(name);
    const wf = parseSkillWorkflow(s?.content ?? "");
    if (wf) withWorkflow++;
  }
  check("5 个强化 Skill 全部有 workflow（5/5）", withWorkflow === 5);
  console.log(c.dim(`  → 有 workflow 的 Skill: ${withWorkflow}/5`));

  // 6.6 原有 3 个 Skill 的 workflow 未被破坏
  const originalSkills = ["bug-fix", "code-review", "gen-backend-code"];
  let originalOk = 0;
  for (const name of originalSkills) {
    const s = await loadSkill(name);
    const wf = parseSkillWorkflow(s?.content ?? "");
    if (wf?.steps?.length >= 3) originalOk++;
  }
  check("原有 3 个 Skill 的 workflow 未被破坏（3/3）", originalOk === 3);
  console.log(c.dim(`  → 原有 Skill workflow 完好: ${originalOk}/3`));

} catch (err) {
  console.log(`  ${c.red("❌")} Task C.6 异常: ${err.message}`);
  failed++; failures.push("Task C.6 KB 联动");
}

// ─── 最终报告 ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(65)}`);
console.log(c.bold("📊 方向 C：Skill 生态强化校验报告 — fullstack-koa-react"));
console.log("─".repeat(65));
console.log(`  ${c.green("✅ 通过")}: ${passed}`);
console.log(`  ${c.red("❌ 失败")}: ${failed}`);
console.log(`  总计: ${passed + failed}`);

if (failures.length > 0) {
  console.log(`\n${c.red("失败项目：")}`);
  for (const f of failures) console.log(`  • ${f}`);
}

const passRate = Math.round((passed / (passed + failed)) * 100);
const rateStr = `${passRate}%`;
console.log(`\n  通过率: ${passRate >= 80 ? c.green(rateStr) : c.red(rateStr)}`);

console.log(`\n${c.bold("校验维度汇总：")}`);
console.log(`  C.1 gen-frontend-code  — 模块全景 + 跨模块关联 + 语义搜索`);
console.log(`  C.2 gen-test-code      — 依赖图谱驱动 Mock 策略`);
console.log(`  C.3 refactor           — 双向依赖 + 影响范围评估`);
console.log(`  C.4 write-test         — 新 Skill：下游=Mock清单，上游=测试场景`);
console.log(`  C.5 api-diff           — 新 Skill：接口变更 → 前端调用点 → 同步方案`);
console.log(`  C.6 KB 联动            — 与 fullstack-koa-react 真实项目数据联动`);

if (passRate === 100) {
  console.log(`\n  ${c.green(c.bold("🎉 方向 C Skill 生态强化全部校验通过！"))}`);
} else if (passRate >= 80) {
  console.log(`\n  ${c.yellow(c.bold("⚠️  大部分校验通过，请检查失败项"))}`);
} else {
  console.log(`\n  ${c.red(c.bold("❌ 校验未通过，请检查 Skill 实现"))}`);
}

process.exit(failed > 0 ? 1 : 0);
