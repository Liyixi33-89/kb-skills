/**
 * skill-workflow.ts — Skill 工作流引擎
 *
 * 解析 SKILL.md Front Matter 中的 workflow 字段，
 * 按步骤顺序执行，支持上下文变量传递（{{step.result}}）。
 *
 * 第二期 OAG 核心能力之一。
 */
import type {
  SkillWorkflow,
  WorkflowStep,
  WorkflowStepResult,
  SkillWorkflowResult,
  WorkflowStepType,
} from "./types.js";
import { loadSkill } from "./skill-loader.js";

// ─── YAML Front Matter 解析 ───────────────────────────────────────────────────

/**
 * 从 SKILL.md 内容中解析 workflow 定义
 *
 * 支持的 Front Matter 格式：
 * ```yaml
 * ---
 * name: bug-fix
 * description: 分析并修复 Bug
 * workflow:
 *   steps:
 *     - id: locate
 *       tool: search_symbol
 *       params:
 *         query: "{{bugKeyword}}"
 *         kind: service
 *     - id: suggest
 *       type: llm_prompt
 *       template: "基于以上分析，给出修复建议"
 * ---
 * ```
 */
export const parseSkillWorkflow = (skillContent: string): SkillWorkflow | null => {
  const trimmed = skillContent.trimStart();
  if (!trimmed.startsWith("---")) return null;

  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) return null;

  const yamlBody = trimmed.slice(4, endIdx);

  // 查找 workflow: 块
  const workflowIdx = yamlBody.indexOf("workflow:");
  if (workflowIdx === -1) return null;

  const workflowBlock = yamlBody.slice(workflowIdx + "workflow:".length);

  try {
    return parseWorkflowBlock(workflowBlock);
  } catch {
    return null;
  }
};

/**
 * 解析 workflow YAML 块（简易解析，不依赖 yaml 库）
 */
const parseWorkflowBlock = (block: string): SkillWorkflow | null => {
  const lines = block.split("\n");
  const steps: WorkflowStep[] = [];
  let currentStep: Partial<WorkflowStep> | null = null;
  let inParams = false;
  let paramsIndent = 0;
  const currentParams: Record<string, unknown> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "steps:") continue;

    const indent = line.length - line.trimStart().length;

    // 新步骤开始（以 - id: 开头）
    if (trimmed.startsWith("- id:") || (trimmed.startsWith("-") && trimmed.includes("id:"))) {
      // 保存上一个步骤
      if (currentStep?.id) {
        if (inParams && Object.keys(currentParams).length > 0) {
          currentStep.params = { ...currentParams };
        }
        steps.push(finalizeStep(currentStep));
      }
      currentStep = {};
      inParams = false;
      Object.keys(currentParams).forEach((k) => delete currentParams[k]);

      const idMatch = trimmed.match(/id:\s*(.+)/);
      if (idMatch) currentStep.id = idMatch[1]!.trim().replace(/^["']|["']$/g, "");
      continue;
    }

    if (!currentStep) continue;

    // 解析步骤字段
    if (trimmed.startsWith("type:")) {
      currentStep.type = trimmed.slice(5).trim().replace(/^["']|["']$/g, "") as WorkflowStepType;
      inParams = false;
    } else if (trimmed.startsWith("tool:")) {
      currentStep.tool = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      if (!currentStep.type) currentStep.type = "tool";
      inParams = false;
    } else if (trimmed.startsWith("template:")) {
      currentStep.template = trimmed.slice(9).trim().replace(/^["']|["']$/g, "");
      if (!currentStep.type) currentStep.type = "llm_prompt";
      inParams = false;
    } else if (trimmed.startsWith("description:")) {
      currentStep.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
      inParams = false;
    } else if (trimmed === "params:") {
      inParams = true;
      paramsIndent = indent;
    } else if (inParams && indent > paramsIndent) {
      // 解析 params 子字段
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
        currentParams[key] = value;
      }
    } else if (inParams && indent <= paramsIndent && trimmed) {
      inParams = false;
    }
  }

  // 保存最后一个步骤
  if (currentStep?.id) {
    if (inParams && Object.keys(currentParams).length > 0) {
      currentStep.params = { ...currentParams };
    }
    steps.push(finalizeStep(currentStep));
  }

  if (steps.length === 0) return null;
  return { steps };
};

const finalizeStep = (partial: Partial<WorkflowStep>): WorkflowStep => ({
  id: partial.id ?? "step",
  type: partial.type ?? (partial.tool ? "tool" : "llm_prompt"),
  tool: partial.tool,
  params: partial.params,
  template: partial.template,
  description: partial.description,
});

// ─── 模板变量替换 ─────────────────────────────────────────────────────────────

/**
 * 替换模板变量 {{varName}} 或 {{stepId.result[0].field}}
 */
const resolveTemplate = (
  template: unknown,
  context: Record<string, unknown>,
): unknown => {
  if (typeof template === "string") {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
      const value = resolveExpression(expr.trim(), context);
      return value !== undefined ? String(value) : `{{${expr}}}`;
    });
  }
  if (typeof template === "object" && template !== null) {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      resolved[key] = resolveTemplate(value, context);
    }
    return resolved;
  }
  return template;
};

/**
 * 解析表达式路径，如 "locate.result[0].name"
 */
const resolveExpression = (expr: string, context: Record<string, unknown>): unknown => {
  const parts = expr.split(/[.[\]]+/).filter(Boolean);
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
};

// ─── 工作流执行引擎 ───────────────────────────────────────────────────────────

export interface WorkflowExecutionOptions {
  /** 只返回执行计划，不实际执行 */
  dryRun?: boolean;
  /** Tool 执行器（由 MCP Server 注入） */
  toolExecutor?: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 执行 Skill 工作流
 */
export const executeSkillWorkflow = async (
  skillName: string,
  context: Record<string, unknown>,
  options: WorkflowExecutionOptions = {},
): Promise<SkillWorkflowResult> => {
  const startTime = Date.now();
  const { dryRun = false, toolExecutor } = options;

  // 加载 Skill
  const skill = await loadSkill(skillName);
  if (!skill) {
    return {
      skill: skillName,
      success: false,
      steps: [],
      output: null,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // 解析工作流
  const workflow = parseSkillWorkflow(skill.content);
  if (!workflow) {
    // 没有 workflow 定义，返回 Skill 内容作为 llm_prompt
    return {
      skill: skillName,
      success: true,
      steps: [
        {
          stepId: "content",
          type: "llm_prompt",
          success: true,
          result: skill.content,
          durationMs: 0,
        },
      ],
      output: skill.content,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // dryRun：只返回执行计划
  if (dryRun) {
    return {
      skill: skillName,
      success: true,
      steps: workflow.steps.map((step) => ({
        stepId: step.id,
        type: step.type,
        success: true,
        result: {
          dryRun: true,
          tool: step.tool,
          params: step.params,
          template: step.template,
          description: step.description,
        },
        durationMs: 0,
      })),
      output: { dryRun: true, steps: workflow.steps.length },
      totalDurationMs: Date.now() - startTime,
    };
  }

  // 执行步骤
  const stepResults: WorkflowStepResult[] = [];
  const executionContext: Record<string, unknown> = { ...context };
  let lastResult: unknown = null;

  for (const step of workflow.steps) {
    const stepStart = Date.now();

    try {
      let result: unknown;

      if (step.type === "tool" && step.tool) {
        // 解析参数中的模板变量
        const resolvedParams = resolveTemplate(
          step.params ?? {},
          executionContext,
        ) as Record<string, unknown>;

        if (toolExecutor) {
          result = await toolExecutor(step.tool, resolvedParams);
        } else {
          // 无 toolExecutor 时，返回执行计划
          result = {
            pending: true,
            tool: step.tool,
            params: resolvedParams,
          };
        }
      } else if (step.type === "llm_prompt" && step.template) {
        // 解析模板变量
        result = resolveTemplate(step.template, executionContext);
      } else {
        result = null;
      }

      // 将结果存入上下文
      executionContext[step.id] = { result };
      lastResult = result;

      stepResults.push({
        stepId: step.id,
        type: step.type,
        success: true,
        result,
        durationMs: Date.now() - stepStart,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stepResults.push({
        stepId: step.id,
        type: step.type,
        success: false,
        error: errorMsg,
        durationMs: Date.now() - stepStart,
      });
      // 步骤失败时继续执行后续步骤（非阻塞）
    }
  }

  const allSuccess = stepResults.every((s) => s.success);

  return {
    skill: skillName,
    success: allSuccess,
    steps: stepResults,
    output: lastResult,
    totalDurationMs: Date.now() - startTime,
  };
};
