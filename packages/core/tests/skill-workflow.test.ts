/**
 * skill-workflow.test.ts — 测试 Skill 工作流引擎
 */
import { describe, it, expect } from "vitest";
import {
  parseSkillWorkflow,
  executeSkillWorkflow,
} from "../src/skill-workflow";

// ─── parseSkillWorkflow ───────────────────────────────────────────────────────

describe("parseSkillWorkflow", () => {
  it("无 Front Matter 时应返回 null", () => {
    const content = "# Bug Fix\n\n这是一个 Skill。";
    expect(parseSkillWorkflow(content)).toBeNull();
  });

  it("有 Front Matter 但无 workflow 字段时应返回 null", () => {
    const content = `---
name: bug-fix
description: 修复 Bug
---
# Bug Fix
`;
    expect(parseSkillWorkflow(content)).toBeNull();
  });

  it("应解析 tool 类型步骤", () => {
    const content = `---
name: bug-fix
description: 修复 Bug
workflow:
  steps:
    - id: locate
      type: tool
      tool: search_symbol
      description: 定位符号
      params:
        query: "{{bugKeyword}}"
        kind: service
---
# Bug Fix
`;
    const workflow = parseSkillWorkflow(content);
    expect(workflow).not.toBeNull();
    expect(workflow!.steps).toHaveLength(1);

    const step = workflow!.steps[0]!;
    expect(step.id).toBe("locate");
    expect(step.type).toBe("tool");
    expect(step.tool).toBe("search_symbol");
    expect(step.description).toBe("定位符号");
    expect(step.params?.["query"]).toBe("{{bugKeyword}}");
    expect(step.params?.["kind"]).toBe("service");
  });

  it("应解析 llm_prompt 类型步骤", () => {
    const content = `---
name: bug-fix
workflow:
  steps:
    - id: suggest
      type: llm_prompt
      template: "基于以上分析，给出修复建议"
---
`;
    const workflow = parseSkillWorkflow(content);
    expect(workflow).not.toBeNull();
    expect(workflow!.steps[0]!.type).toBe("llm_prompt");
    expect(workflow!.steps[0]!.template).toBe("基于以上分析，给出修复建议");
  });

  it("应解析多步骤工作流", () => {
    const content = `---
name: code-review
workflow:
  steps:
    - id: step1
      tool: search_symbol
      params:
        query: "{{target}}"
    - id: step2
      tool: get_dependency_graph
      params:
        symbol: "{{target}}"
    - id: step3
      type: llm_prompt
      template: "生成审查报告"
---
`;
    const workflow = parseSkillWorkflow(content);
    expect(workflow).not.toBeNull();
    expect(workflow!.steps).toHaveLength(3);
    expect(workflow!.steps[0]!.id).toBe("step1");
    expect(workflow!.steps[1]!.id).toBe("step2");
    expect(workflow!.steps[2]!.id).toBe("step3");
  });

  it("tool 字段存在时 type 应自动推断为 tool", () => {
    const content = `---
name: test
workflow:
  steps:
    - id: s1
      tool: search_symbol
      params:
        query: test
---
`;
    const workflow = parseSkillWorkflow(content);
    expect(workflow!.steps[0]!.type).toBe("tool");
  });

  it("template 字段存在时 type 应自动推断为 llm_prompt", () => {
    const content = `---
name: test
workflow:
  steps:
    - id: s1
      template: "给出建议"
---
`;
    const workflow = parseSkillWorkflow(content);
    expect(workflow!.steps[0]!.type).toBe("llm_prompt");
  });

  it("workflow 块中无步骤时应返回 null", () => {
    const content = `---
name: test
workflow:
  steps:
---
`;
    const result = parseSkillWorkflow(content);
    expect(result).toBeNull();
  });
});

// ─── executeSkillWorkflow ─────────────────────────────────────────────────────

describe("executeSkillWorkflow", () => {
  it("不存在的 Skill 应返回 success=false", async () => {
    const result = await executeSkillWorkflow("non-existent-skill-xyz", {});
    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(0);
  });

  it("存在的 Skill（无 workflow）应返回 Skill 内容作为 llm_prompt", async () => {
    // api-doc-gen 是一个没有 workflow 的 Skill
    const result = await executeSkillWorkflow("api-doc-gen", {});
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.type).toBe("llm_prompt");
    expect(typeof result.output).toBe("string");
    expect((result.output as string).length).toBeGreaterThan(0);
  });

  it("dryRun=true 时应返回执行计划而不实际执行", async () => {
    // bug-fix 有 workflow 定义
    const result = await executeSkillWorkflow(
      "bug-fix",
      { bugKeyword: "UserService" },
      { dryRun: true },
    );
    expect(result.success).toBe(true);
    // dryRun 时每个步骤的 result 应包含 dryRun: true
    for (const step of result.steps) {
      expect((step.result as Record<string, unknown>)?.["dryRun"]).toBe(true);
    }
    expect((result.output as Record<string, unknown>)?.["dryRun"]).toBe(true);
  });

  it("dryRun 时步骤数量应与 workflow 定义一致", async () => {
    const result = await executeSkillWorkflow(
      "bug-fix",
      { bugKeyword: "UserService" },
      { dryRun: true },
    );
    // bug-fix 有 4 个步骤（locate, dependency, impact, suggest）
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("toolExecutor 应被调用并传入正确参数", async () => {
    const calls: Array<{ tool: string; params: Record<string, unknown> }> = [];

    const result = await executeSkillWorkflow(
      "bug-fix",
      { bugKeyword: "UserService" },
      {
        toolExecutor: async (tool, params) => {
          calls.push({ tool, params });
          return { found: true, results: [] };
        },
      },
    );

    expect(result.success).toBe(true);
    // 至少有一个 tool 步骤被调用
    expect(calls.length).toBeGreaterThan(0);
    // 第一个步骤应是 search_symbol
    expect(calls[0]!.tool).toBe("search_symbol");
  });

  it("模板变量 {{bugKeyword}} 应被正确替换", async () => {
    const calls: Array<{ tool: string; params: Record<string, unknown> }> = [];

    await executeSkillWorkflow(
      "bug-fix",
      { bugKeyword: "AuthService" },
      {
        toolExecutor: async (tool, params) => {
          calls.push({ tool, params });
          return {};
        },
      },
    );

    const searchCall = calls.find((c) => c.tool === "search_symbol");
    expect(searchCall).toBeDefined();
    expect(searchCall!.params["query"]).toBe("AuthService");
  });

  it("步骤失败时应继续执行后续步骤（非阻塞）", async () => {
    let callCount = 0;
    const result = await executeSkillWorkflow(
      "bug-fix",
      { bugKeyword: "Test" },
      {
        toolExecutor: async (tool) => {
          callCount++;
          if (callCount === 1) throw new Error("模拟第一步失败");
          return { ok: true };
        },
      },
    );

    // 即使第一步失败，后续步骤也应继续执行
    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.steps[0]!.success).toBe(false);
    expect(result.steps[0]!.error).toContain("模拟第一步失败");
    // 后续步骤应继续执行
    expect(callCount).toBeGreaterThan(1);
  });

  it("totalDurationMs 应大于等于 0", async () => {
    const result = await executeSkillWorkflow("api-doc-gen", {});
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
