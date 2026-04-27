/**
 * get-dependency-graph.ts — Tool: get_dependency_graph
 *
 * 查询指定符号的依赖图谱，支持上下游遍历和 Mermaid 输出。
 */
import {
  queryDependencyGraph,
  type DependencyGraphOptions,
  type TraversalDirection,
  type OutputFormat,
} from "@kb-skills/core";
import type { ScanCache } from "../cache.js";

export interface GetDependencyGraphInput {
  symbol: string;
  depth?: number;
  direction?: TraversalDirection;
  format?: OutputFormat;
}

export const getDependencyGraph = async (
  cache: ScanCache,
  input: GetDependencyGraphInput,
) => {
  const { symbol, depth = 2, direction = "both", format = "tree" } = input;

  const scanResult = await cache.get();

  const result = queryDependencyGraph(scanResult, symbol, {
    depth,
    direction,
    format,
  } as DependencyGraphOptions);

  if (!result) {
    return {
      found: false,
      symbol,
      message: `未找到符号 "${symbol}"，请检查名称是否正确（大小写不敏感）`,
    };
  }

  return {
    found: true,
    ...result,
  };
};
