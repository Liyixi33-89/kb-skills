/**
 * server.ts — MCP Server 主体
 *
 * 使用 @modelcontextprotocol/sdk 注册所有 9 个 Tools，
 * 并将 @kb-skills/core 的能力通过 MCP 协议暴露给 AI 工具。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ScanCache } from "./cache.js";
import type { McpContext } from "./context.js";

// ─── Tool 实现导入 ────────────────────────────────────────────────────────────
import { searchSymbol } from "./tools/search-symbol.js";
import { getModuleMap } from "./tools/get-module-map.js";
import { getRouteDetail } from "./tools/get-route-detail.js";
import { getKbFile } from "./tools/get-kb-file.js";
import { listAllSkills } from "./tools/list-skills.js";
import { getSkill } from "./tools/get-skill.js";
import { getKbStatus } from "./tools/get-kb-status.js";
import { runScan } from "./tools/run-scan.js";
import { searchSemantic, invalidateSemanticIndex } from "./tools/search-semantic.js";
// 第二期 OAG Tools
import { getDependencyGraph } from "./tools/get-dependency-graph.js";
import { findCrossModuleRelations } from "./tools/find-cross-module-relations.js";
import { executeWorkflow } from "./tools/execute-skill-workflow.js";
import { analyzeChangeImpact } from "./tools/analyze-change-impact.js";

// ─── MCP 响应格式化辅助 ───────────────────────────────────────────────────────

const toText = (data: unknown): { content: Array<{ type: "text"; text: string }> } => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const toError = (message: string): { content: Array<{ type: "text"; text: string }>; isError: true } => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// ─── 创建 MCP Server ──────────────────────────────────────────────────────────

export const createKbSkillsServer = (ctx: McpContext): McpServer => {
  const server = new McpServer({
    name: "kb-skills",
    version: "1.5.0",
  });

  const cache = new ScanCache(ctx);

  // ── Tool 1: search_symbol ──────────────────────────────────────────────────
  server.tool(
    "search_symbol",
    "在项目中搜索符号（路由、服务、组件、Model 等）。支持按名称模糊匹配、按类型过滤、按模块过滤。",
    {
      query: z.string().describe("搜索关键词，支持模糊匹配（大小写不敏感）"),
      kind: z
        .enum([
          "route",
          "service",
          "model",
          "middleware",
          "page",
          "component",
          "store",
          "api",
          "type",
          "config",
        ])
        .optional()
        .describe("符号类型过滤"),
      module: z.string().optional().describe("限定搜索的模块名称"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("最多返回条数，默认 20"),
    },
    async (input) => {
      try {
        const result = await searchSymbol(cache, input);
        return toText(result);
      } catch (err) {
        return toError(`search_symbol 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 2: get_module_map ─────────────────────────────────────────────────
  server.tool(
    "get_module_map",
    "获取项目模块全景。返回所有模块的基本信息和 00_project_map.md 内容，帮助 AI 快速理解项目整体结构。",
    {
      module: z
        .string()
        .optional()
        .describe("指定模块名称，不传则返回所有模块"),
    },
    async (input) => {
      try {
        const result = await getModuleMap(ctx, cache, input);
        return toText(result);
      } catch (err) {
        return toError(`get_module_map 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 3: get_route_detail ───────────────────────────────────────────────
  server.tool(
    "get_route_detail",
    "按路由路径查找详情。支持后端 API 路由（如 /api/users）和前端页面路由（如 /dashboard），返回对应的 KB 文档内容和源码文件路径。",
    {
      route: z
        .string()
        .describe("路由路径，如 /api/users 或 /dashboard，支持模糊匹配"),
      module: z.string().optional().describe("限定搜索的模块名称"),
    },
    async (input) => {
      try {
        const result = await getRouteDetail(ctx, cache, input);
        return toText(result);
      } catch (err) {
        return toError(`get_route_detail 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 4: get_kb_file ────────────────────────────────────────────────────
  server.tool(
    "get_kb_file",
    "直接读取 KB 目录下的任意文件内容。path 为相对于 kbRoot 的路径，如 server/api/users.md 或 frontend/web/01_index_page.md。",
    {
      path: z
        .string()
        .describe("相对于 kbRoot 的文件路径，如 server/api/users.md"),
    },
    async (input) => {
      try {
        const result = await getKbFile(ctx, input);
        return toText(result);
      } catch (err) {
        return toError(`get_kb_file 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 5: list_skills ────────────────────────────────────────────────────
  server.tool(
    "list_skills",
    "列出所有内置 Skills 的名称和描述。Skills 是 AI 编程工作流的提示词模板，如 doc-code-to-kb、bug-fix、code-review 等。",
    {},
    async () => {
      try {
        const result = await listAllSkills();
        return toText(result);
      } catch (err) {
        return toError(`list_skills 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 6: get_skill ──────────────────────────────────────────────────────
  server.tool(
    "get_skill",
    "获取指定 Skill 的完整 SKILL.md 内容，包含详细的 AI 工作流提示词和使用说明。",
    {
      name: z
        .string()
        .describe("Skill 名称，如 doc-code-to-kb、bug-fix、code-review、gen-frontend-code 等"),
    },
    async (input) => {
      try {
        const result = await getSkill(input);
        return toText(result);
      } catch (err) {
        return toError(`get_skill 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 7: get_kb_status ──────────────────────────────────────────────────
  server.tool(
    "get_kb_status",
    "查看 KB 覆盖率状态。返回进度统计（已完成/待完成文件数）和验证报告（缺失文件、格式问题、修复建议）。",
    {},
    async () => {
      try {
        const result = await getKbStatus(ctx);
        return toText(result);
      } catch (err) {
        return toError(`get_kb_status 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 8: run_scan ───────────────────────────────────────────────────────
  server.tool(
    "run_scan",
    "触发重新扫描项目代码，刷新 KB 文件和内存缓存。mode=incremental（默认）只重扫变更文件所在模块；mode=full 或 force=true 时全量重扫。",
    {
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("是否强制全量重扫，忽略缓存，默认 false"),
      mode: z
        .enum(["full", "incremental"])
        .optional()
        .default("incremental")
        .describe("扫描模式：incremental（增量，默认）或 full（全量）"),
    },
    async (input) => {
      try {
        const result = await runScan(cache, input);
        // 扫描完成后清除语义索引缓存，下次查询时重建
        if (result.success) {
          invalidateSemanticIndex(ctx.kbRoot);
        }
        return toText(result);
      } catch (err) {
        return toError(`run_scan 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 9: search_semantic ────────────────────────────────────────────────
  server.tool(
    "search_semantic",
    "基于 TF-IDF 语义相似度搜索 KB 文件。支持自然语言查询，如「处理用户登录的服务」、「订单相关的 API」，比 search_symbol 更适合模糊意图搜索。完全本地运行，无需 API Key。",
    {
      query: z
        .string()
        .describe("自然语言查询，如「处理用户权限的服务」或「订单支付相关接口」"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("返回最相关的文件数量，默认 10"),
      module: z
        .string()
        .optional()
        .describe("限定搜索的模块名称，不传则搜索全部模块"),
    },
    async (input) => {
      try {
        const result = await searchSemantic(ctx, input);
        return toText(result);
      } catch (err) {
        return toError(`search_semantic 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 10: get_dependency_graph ──────────────────────────────────────────
  server.tool(
    "get_dependency_graph",
    "查询指定符号的依赖图谱。返回该符号的上游调用者（谁依赖它）和下游依赖（它依赖谁），支持 tree/flat/mermaid 三种输出格式。适合回答「修改 UserModel 会影响哪些服务？」类问题。",
    {
      symbol: z
        .string()
        .describe("目标符号名称，如 UserService、UserModel、AuthController"),
      depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .default(2)
        .describe("遍历深度，默认 2（直接依赖 + 间接依赖）"),
      direction: z
        .enum(["upstream", "downstream", "both"])
        .optional()
        .default("both")
        .describe("遍历方向：upstream（上游调用者）、downstream（下游依赖）、both（双向，默认）"),
      format: z
        .enum(["tree", "flat", "mermaid"])
        .optional()
        .default("tree")
        .describe("输出格式：tree（树状，默认）、flat（扁平列表）、mermaid（流程图语法）"),
    },
    async (input) => {
      try {
        const result = await getDependencyGraph(cache, input);
        return toText(result);
      } catch (err) {
        return toError(`get_dependency_graph 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 11: find_cross_module_relations ───────────────────────────────────
  server.tool(
    "find_cross_module_relations",
    "查询前后端跨模块关联。可以回答「后端 /api/users 接口被哪些前端页面调用？」或「UserList.tsx 调用了哪些后端接口？」。至少提供 apiRoute 或 frontendFile 其中一个参数。",
    {
      apiRoute: z
        .string()
        .optional()
        .describe("后端路由路径，如 /api/users 或 /api/users/:id，支持路径参数模糊匹配"),
      frontendFile: z
        .string()
        .optional()
        .describe("前端文件路径（部分匹配），如 UserList.tsx 或 pages/user"),
    },
    async (input) => {
      try {
        const result = await findCrossModuleRelations(cache, input);
        return toText(result);
      } catch (err) {
        return toError(`find_cross_module_relations 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 12: execute_skill_workflow ────────────────────────────────────────
  server.tool(
    "execute_skill_workflow",
    "执行 Skill 工作流。Skill 工作流是定义在 SKILL.md 中的多步骤推理流程，可自动编排多个 Tool 调用。使用 dryRun=true 可预览执行计划而不实际执行。",
    {
      skill: z
        .string()
        .describe("Skill 名称，如 bug-fix、code-review、gen-backend-code"),
      context: z
        .record(z.unknown())
        .optional()
        .default({})
        .describe("初始上下文变量，供工作流步骤中的模板变量使用，如 { bugKeyword: 'UserService' }"),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("只返回执行计划，不实际执行 Tool 步骤，默认 false"),
    },
    async (input) => {
      try {
        const result = await executeWorkflow(cache, input);
        return toText(result);
      } catch (err) {
        return toError(`execute_skill_workflow 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ── Tool 13: analyze_change_impact ────────────────────────────────────────
  server.tool(
    "analyze_change_impact",
    "分析修改指定符号对整个项目的影响范围。基于依赖图谱找出所有受影响的文件，评估风险等级（low/medium/high），并给出修复建议。适合在修改代码前进行影响评估。",
    {
      symbol: z
        .string()
        .describe("要修改的符号名称，如 UserService、createUser、UserModel"),
      changeType: z
        .enum(["signature", "behavior", "delete", "rename"])
        .describe(
          "变更类型：signature（函数签名变更）、behavior（行为变更）、delete（删除）、rename（重命名）",
        ),
      newSignature: z
        .string()
        .optional()
        .describe("新签名（changeType=signature 时提供），如 createUser(data: CreateUserDto): Promise<User>"),
      newName: z
        .string()
        .optional()
        .describe("新名称（changeType=rename 时提供）"),
    },
    async (input) => {
      try {
        const result = await analyzeChangeImpact(cache, input);
        return toText(result);
      } catch (err) {
        return toError(`analyze_change_impact 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  return server;
};
