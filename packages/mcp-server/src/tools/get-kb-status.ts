/**
 * get-kb-status.ts — Tool: get_kb_status
 *
 * 返回 KB 覆盖率状态：进度 + 验证报告。
 * 直接复用 @kb-skills/core 的 readStatus() 和 verifyKb()。
 */
import { readStatus, verifyKb } from "@kb-skills/core";
import type { McpContext } from "../context.js";

export interface GetKbStatusResult {
  progress: {
    total: number;
    done: number;
    remaining: number;
    progressPct: number;
    currentModule: string | null;
    modules: Record<
      string,
      { done: number; remaining: number; remainingFiles: string[] }
    >;
  } | null;
  verify: {
    status: "pass" | "fail" | "error";
    totalModules: number;
    totalMissingFiles: number;
    missingFiles: string[];
    formatIssues: string[];
    recommendation: string;
  };
  kbRoot: string;
}

export const getKbStatus = async (
  ctx: McpContext,
): Promise<GetKbStatusResult> => {
  const [progress, verifyReport] = await Promise.all([
    readStatus(ctx.kbRoot),
    verifyKb(ctx.kbRoot),
  ]);

  return {
    progress,
    verify: {
      status: verifyReport.status,
      totalModules: verifyReport.summary.totalModules,
      totalMissingFiles: verifyReport.summary.totalMissingFiles,
      missingFiles: verifyReport.missingFiles,
      formatIssues: verifyReport.formatIssues,
      recommendation: verifyReport.recommendation,
    },
    kbRoot: ctx.kbRoot,
  };
};
