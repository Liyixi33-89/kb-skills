/**
 * analyze-change-impact.ts — Tool: analyze_change_impact
 *
 * 分析修改指定符号对整个项目的影响范围。
 * 基于依赖图谱，找出所有上游调用者，评估风险等级。
 */
import {
  queryDependencyGraph,
  type FlatDependencyItem,
} from "@kb-skills/core";
import type { ScanCache } from "../cache.js";

export type ChangeType = "signature" | "behavior" | "delete" | "rename";
export type RiskLevel = "low" | "medium" | "high";

export interface AnalyzeChangeImpactInput {
  /** 要修改的符号名称 */
  symbol: string;
  /** 变更类型 */
  changeType: ChangeType;
  /** 新签名（changeType=signature 时提供） */
  newSignature?: string;
  /** 新名称（changeType=rename 时提供） */
  newName?: string;
}

interface ImpactedFile {
  file: string;
  symbol: string;
  kind: string;
  module: string;
  /** 与目标符号的调用距离 */
  depth: number;
  /** 影响原因描述 */
  reason: string;
}

export interface ChangeImpactResult {
  targetSymbol: string;
  changeType: ChangeType;
  riskLevel: RiskLevel;
  impactedFiles: ImpactedFile[];
  impactedCount: number;
  suggestions: string[];
  summary: string;
}

/**
 * 根据变更类型和影响范围评估风险等级
 */
const assessRiskLevel = (
  changeType: ChangeType,
  impactedCount: number,
  hasDirectCallers: boolean,
): RiskLevel => {
  if (changeType === "delete") {
    if (impactedCount > 5) return "high";
    if (impactedCount > 0) return "medium";
    return "low";
  }

  if (changeType === "rename") {
    if (impactedCount > 10) return "high";
    if (impactedCount > 3) return "medium";
    return "low";
  }

  if (changeType === "signature") {
    if (hasDirectCallers && impactedCount > 5) return "high";
    if (hasDirectCallers) return "medium";
    return "low";
  }

  // behavior
  if (impactedCount > 10) return "medium";
  return "low";
};

/**
 * 根据变更类型生成修复建议
 */
const generateSuggestions = (
  changeType: ChangeType,
  targetSymbol: string,
  impactedFiles: ImpactedFile[],
  newSignature?: string,
  newName?: string,
): string[] => {
  const suggestions: string[] = [];
  const directCallers = impactedFiles.filter((f) => f.depth === 1);

  switch (changeType) {
    case "delete":
      if (directCallers.length > 0) {
        suggestions.push(
          `删除 ${targetSymbol} 前，需要先处理 ${directCallers.length} 个直接调用者`,
        );
        suggestions.push(
          `直接调用者：${directCallers.map((f) => f.symbol).join("、")}`,
        );
      }
      suggestions.push("建议先将该符号标记为 @deprecated，给调用方迁移时间");
      suggestions.push("确认所有调用者已迁移后再执行删除");
      break;

    case "rename":
      if (newName) {
        suggestions.push(
          `将 ${targetSymbol} 重命名为 ${newName} 后，需要更新 ${impactedFiles.length} 处引用`,
        );
        suggestions.push("建议使用 IDE 的全局重命名功能（Rename Symbol）确保不遗漏");
      }
      suggestions.push("重命名后运行 TypeScript 编译检查确认无遗漏");
      break;

    case "signature":
      if (newSignature) {
        suggestions.push(`新签名：${newSignature}`);
      }
      if (directCallers.length > 0) {
        suggestions.push(
          `需要更新 ${directCallers.length} 个直接调用者的参数传递方式`,
        );
      }
      suggestions.push("建议先更新函数签名，再逐一修复 TypeScript 编译错误");
      suggestions.push("考虑使用函数重载（overload）保持向后兼容");
      break;

    case "behavior":
      suggestions.push(
        `行为变更可能影响 ${impactedFiles.length} 个依赖该符号的模块`,
      );
      suggestions.push("建议为受影响的模块补充单元测试，验证行为变更不引入回归");
      if (impactedFiles.length > 5) {
        suggestions.push("影响范围较大，建议在 staging 环境充分测试后再上线");
      }
      break;
  }

  return suggestions;
};

export const analyzeChangeImpact = async (
  cache: ScanCache,
  input: AnalyzeChangeImpactInput,
): Promise<ChangeImpactResult> => {
  const { symbol, changeType, newSignature, newName } = input;

  const scanResult = await cache.get();

  // 查询上游调用者（depth=3 覆盖大多数场景）
  const graphResult = queryDependencyGraph(scanResult, symbol, {
    depth: 3,
    direction: "upstream",
    format: "flat",
  });

  const flatItems: FlatDependencyItem[] = graphResult?.flat ?? [];

  // 构建影响文件列表
  const impactedFiles: ImpactedFile[] = flatItems.map((item) => {
    let reason = "";
    switch (changeType) {
      case "delete":
        reason = item.depth === 1
          ? `直接调用 ${symbol}，删除后将编译报错`
          : `间接依赖 ${symbol}（通过 ${item.depth} 层调用链）`;
        break;
      case "rename":
        reason = item.depth === 1
          ? `直接引用 ${symbol}，需要更新为新名称`
          : `间接引用 ${symbol}`;
        break;
      case "signature":
        reason = item.depth === 1
          ? `直接调用 ${symbol}，需要更新参数`
          : `间接调用 ${symbol}，可能受参数变更影响`;
        break;
      case "behavior":
        reason = `依赖 ${symbol} 的行为，行为变更可能影响其逻辑`;
        break;
    }
    return {
      file: item.file,
      symbol: item.symbol,
      kind: item.kind,
      module: item.module,
      depth: item.depth,
      reason,
    };
  });

  const hasDirectCallers = impactedFiles.some((f) => f.depth === 1);
  const riskLevel = assessRiskLevel(changeType, impactedFiles.length, hasDirectCallers);
  const suggestions = generateSuggestions(
    changeType,
    symbol,
    impactedFiles,
    newSignature,
    newName,
  );

  const riskEmoji = { low: "🟢", medium: "🟡", high: "🔴" }[riskLevel];
  const summary = `${riskEmoji} ${symbol} 的 ${changeType} 变更影响 ${impactedFiles.length} 个符号，风险等级：${riskLevel.toUpperCase()}`;

  return {
    targetSymbol: symbol,
    changeType,
    riskLevel,
    impactedFiles,
    impactedCount: impactedFiles.length,
    suggestions,
    summary,
  };
};
