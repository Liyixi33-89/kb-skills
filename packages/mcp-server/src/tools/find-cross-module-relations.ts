/**
 * find-cross-module-relations.ts — Tool: find_cross_module_relations
 *
 * 查询前后端跨模块关联：后端路由被哪些前端文件调用，或前端文件调用了哪些后端路由。
 */
import { analyzeCrossModuleRelations } from "@kb-skills/core";
import type { ScanCache } from "../cache.js";

export interface FindCrossModuleRelationsInput {
  /** 后端路由路径，如 /api/users 或 /api/users/:id */
  apiRoute?: string;
  /** 前端文件路径（部分匹配），如 UserList.tsx 或 pages/user */
  frontendFile?: string;
}

export const findCrossModuleRelations = async (
  cache: ScanCache,
  input: FindCrossModuleRelationsInput,
) => {
  const { apiRoute, frontendFile } = input;

  if (!apiRoute && !frontendFile) {
    return {
      error: "请至少提供 apiRoute 或 frontendFile 其中一个参数",
      relations: [],
    };
  }

  const scanResult = await cache.get();
  const relations = analyzeCrossModuleRelations(scanResult, {
    apiRoute,
    frontendFile,
  });

  if (relations.length === 0) {
    const hint = apiRoute
      ? `未找到调用后端路由 "${apiRoute}" 的前端文件。可能原因：\n1. 前端使用了动态 URL 构建（如模板字符串）\n2. 前端 apiFiles 尚未被扫描到\n3. 路由路径不匹配（尝试使用更短的路径前缀）`
      : `未找到前端文件 "${frontendFile}" 调用的后端路由。`;
    return {
      found: false,
      message: hint,
      relations: [],
    };
  }

  return {
    found: true,
    total: relations.length,
    relations: relations.map((r) => ({
      backendRoute: r.backendRoute,
      backendFile: r.backendFile,
      backendModule: r.backendModule,
      callerCount: r.frontendCallers.length,
      frontendCallers: r.frontendCallers,
    })),
  };
};
