/**
 * execute-skill-workflow.ts — Tool: execute_skill_workflow
 *
 * 执行 Skill 工作流，支持多步骤推理编排。
 * 工作流定义在 SKILL.md 的 YAML Front Matter 中。
 */
import { executeSkillWorkflow } from "@kb-skills/core";
import type { ScanCache } from "../cache.js";

export interface ExecuteSkillWorkflowInput {
  /** Skill 名称，如 bug-fix、code-review */
  skill: string;
  /** 初始上下文变量，供工作流步骤中的模板变量使用 */
  context?: Record<string, unknown>;
  /** 只返回执行计划，不实际执行 Tool 步骤 */
  dryRun?: boolean;
}

/**
 * 创建 Tool 执行器（在 MCP Server 内部调用其他 Tool）
 * 由于 MCP 协议限制，这里通过 ScanCache 直接调用 core 函数
 */
const createToolExecutor = (cache: ScanCache) => {
  return async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
    // 内部 Tool 路由：将工作流中的 tool 调用映射到实际实现
    switch (toolName) {
      case "search_symbol": {
        const { searchSymbol } = await import("./search-symbol.js");
        return searchSymbol(cache, params as unknown as Parameters<typeof searchSymbol>[1]);
      }
      case "get_dependency_graph": {
        const { getDependencyGraph } = await import("./get-dependency-graph.js");
        return getDependencyGraph(cache, params as unknown as Parameters<typeof getDependencyGraph>[1]);
      }
      case "find_cross_module_relations": {
        const { findCrossModuleRelations } = await import("./find-cross-module-relations.js");
        return findCrossModuleRelations(cache, params as unknown as Parameters<typeof findCrossModuleRelations>[1]);
      }
      case "search_semantic": {
        // search_semantic 需要 ctx，这里简化处理
        return { message: `Tool ${toolName} 在工作流中暂不支持直接调用，请单独使用` };
      }
      default:
        return { message: `未知 Tool: ${toolName}，跳过执行` };
    }
  };
};

export const executeWorkflow = async (
  cache: ScanCache,
  input: ExecuteSkillWorkflowInput,
) => {
  const { skill, context = {}, dryRun = false } = input;

  const toolExecutor = dryRun ? undefined : createToolExecutor(cache);

  const result = await executeSkillWorkflow(skill, context, {
    dryRun,
    toolExecutor,
  });

  if (!result.success && result.steps.length === 0) {
    return {
      success: false,
      message: `Skill "${skill}" 不存在，请使用 list_skills 查看可用 Skills`,
      skill,
    };
  }

  return {
    success: result.success,
    skill: result.skill,
    dryRun,
    totalDurationMs: result.totalDurationMs,
    stepsCount: result.steps.length,
    steps: result.steps.map((s) => ({
      id: s.stepId,
      type: s.type,
      success: s.success,
      durationMs: s.durationMs,
      result: s.result,
      error: s.error,
    })),
    output: result.output,
  };
};
