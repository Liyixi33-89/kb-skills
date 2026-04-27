/**
 * dependency-graph.ts — 符号依赖图谱构建与遍历
 *
 * 基于 ScanResult 中的 relations 和 modules 构建有向依赖图，
 * 支持 BFS/DFS 遍历，按深度限制返回依赖链。
 *
 * 第二期 OAG 核心能力之一。
 */
import type {
  ScanResult,
  ModuleInfo,
  DependencyNode,
  SymbolKind,
} from "./types.js";

// ─── 内部图结构 ───────────────────────────────────────────────────────────────

interface GraphNode {
  symbol: string;
  kind: SymbolKind;
  file: string;
  module: string;
  /** 下游依赖（该符号依赖的其他符号名称） */
  downstreamEdges: Set<string>;
  /** 上游调用者（依赖该符号的其他符号名称） */
  upstreamEdges: Set<string>;
}

export type TraversalDirection = "upstream" | "downstream" | "both";
export type OutputFormat = "tree" | "flat" | "mermaid";

export interface DependencyGraphOptions {
  /** 遍历深度，默认 2 */
  depth?: number;
  /** 遍历方向，默认 "both" */
  direction?: TraversalDirection;
  /** 输出格式，默认 "tree" */
  format?: OutputFormat;
}

export interface FlatDependencyItem {
  symbol: string;
  kind: SymbolKind;
  file: string;
  module: string;
  /** 与目标符号的关系方向 */
  direction: "upstream" | "downstream";
  /** 距离目标符号的跳数 */
  depth: number;
}

export interface DependencyGraphResult {
  /** 目标符号 */
  target: {
    symbol: string;
    kind: SymbolKind;
    file: string;
    module: string;
  };
  /** tree 格式：树状结构 */
  tree?: DependencyNode;
  /** flat 格式：扁平列表 */
  flat?: FlatDependencyItem[];
  /** mermaid 格式：Mermaid 流程图语法 */
  mermaid?: string;
  /** 统计信息 */
  stats: {
    totalNodes: number;
    upstreamCount: number;
    downstreamCount: number;
  };
}

// ─── 图构建 ───────────────────────────────────────────────────────────────────

/**
 * 从 ScanResult 构建内存有向图
 */
export const buildDependencyGraph = (
  scanResult: ScanResult,
): Map<string, GraphNode> => {
  const graph = new Map<string, GraphNode>();

  // 注册所有符号节点
  for (const module of scanResult.modules) {
    for (const symbol of module.symbols) {
      const key = symbol.name;
      if (!graph.has(key)) {
        graph.set(key, {
          symbol: symbol.name,
          kind: symbol.kind,
          file: symbol.file,
          module: module.name,
          downstreamEdges: new Set(),
          upstreamEdges: new Set(),
        });
      }
    }
  }

  // 补充从 raw 数据中提取的依赖关系
  for (const module of scanResult.modules) {
    extractRawRelations(module, graph);
  }

  // 注册 relations 中的边
  for (const rel of scanResult.relations) {
    ensureNode(graph, rel.from, rel.module);
    ensureNode(graph, rel.to, rel.module);

    const fromNode = graph.get(rel.from)!;
    const toNode = graph.get(rel.to)!;

    fromNode.downstreamEdges.add(rel.to);
    toNode.upstreamEdges.add(rel.from);
  }

  return graph;
};

/**
 * 确保节点存在（用于 relations 中引用但未在 symbols 中注册的符号）
 */
const ensureNode = (
  graph: Map<string, GraphNode>,
  symbol: string,
  module?: string,
): void => {
  if (!graph.has(symbol)) {
    graph.set(symbol, {
      symbol,
      kind: "service",
      file: "",
      module: module ?? "unknown",
      downstreamEdges: new Set(),
      upstreamEdges: new Set(),
    });
  }
};

/**
 * 从 ModuleInfo.raw 中提取额外的依赖关系（补充 relations 字段）
 */
const extractRawRelations = (
  module: ModuleInfo,
  graph: Map<string, GraphNode>,
): void => {
  const raw = module.raw;
  if (!raw) return;

  if (raw.framework === "koa" || raw.framework === "express") {
    // 服务依赖：service.dependencies.services
    for (const svc of raw.services) {
      ensureNode(graph, svc.name, module.name);
      const node = graph.get(svc.name)!;
      node.kind = "service";
      node.module = module.name;

      for (const dep of svc.dependencies.services) {
        ensureNode(graph, dep, module.name);
        node.downstreamEdges.add(dep);
        graph.get(dep)!.upstreamEdges.add(svc.name);
      }
      for (const model of svc.dependencies.models) {
        ensureNode(graph, model, module.name);
        node.downstreamEdges.add(model);
        graph.get(model)!.upstreamEdges.add(svc.name);
      }
    }
  }

  if (raw.framework === "nestjs") {
    for (const svc of raw.services) {
      ensureNode(graph, svc.name, module.name);
      const node = graph.get(svc.name)!;
      node.kind = "service";
      node.module = module.name;

      for (const dep of svc.dependencies.services) {
        ensureNode(graph, dep, module.name);
        node.downstreamEdges.add(dep);
        graph.get(dep)!.upstreamEdges.add(svc.name);
      }
    }
  }
};

// ─── 图遍历 ───────────────────────────────────────────────────────────────────

/**
 * BFS 遍历，返回指定深度内的所有节点
 */
const bfsTraversal = (
  graph: Map<string, GraphNode>,
  startSymbol: string,
  direction: "upstream" | "downstream",
  maxDepth: number,
): Map<string, { node: GraphNode; depth: number }> => {
  const visited = new Map<string, { node: GraphNode; depth: number }>();
  const queue: Array<{ symbol: string; depth: number }> = [
    { symbol: startSymbol, depth: 0 },
  ];

  while (queue.length > 0) {
    const { symbol, depth } = queue.shift()!;
    if (visited.has(symbol) || depth > maxDepth) continue;

    const node = graph.get(symbol);
    if (!node) continue;

    visited.set(symbol, { node, depth });

    if (depth < maxDepth) {
      const edges =
        direction === "downstream"
          ? node.downstreamEdges
          : node.upstreamEdges;

      for (const neighbor of edges) {
        if (!visited.has(neighbor)) {
          queue.push({ symbol: neighbor, depth: depth + 1 });
        }
      }
    }
  }

  return visited;
};

/**
 * 构建树状 DependencyNode（递归，防止循环引用）
 */
const buildTreeNode = (
  graph: Map<string, GraphNode>,
  symbol: string,
  direction: TraversalDirection,
  maxDepth: number,
  currentDepth: number,
  visited: Set<string>,
): DependencyNode => {
  const node = graph.get(symbol);
  const graphNode: DependencyNode = {
    symbol,
    kind: node?.kind ?? "service",
    file: node?.file ?? "",
    module: node?.module ?? "unknown",
    children: [],
    parents: [],
  };

  if (currentDepth >= maxDepth || visited.has(symbol)) {
    return graphNode;
  }

  visited.add(symbol);

  if ((direction === "downstream" || direction === "both") && node) {
    for (const dep of node.downstreamEdges) {
      graphNode.children.push(
        buildTreeNode(graph, dep, direction, maxDepth, currentDepth + 1, new Set(visited)),
      );
    }
  }

  if ((direction === "upstream" || direction === "both") && node) {
    for (const caller of node.upstreamEdges) {
      graphNode.parents.push(
        buildTreeNode(graph, caller, direction, maxDepth, currentDepth + 1, new Set(visited)),
      );
    }
  }

  return graphNode;
};

// ─── Mermaid 输出 ─────────────────────────────────────────────────────────────

const sanitizeMermaidId = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_]/g, "_");

const buildMermaidGraph = (
  graph: Map<string, GraphNode>,
  targetSymbol: string,
  direction: TraversalDirection,
  maxDepth: number,
): string => {
  const lines: string[] = ["graph TD"];
  const edges = new Set<string>();
  const nodeLabels = new Map<string, string>();

  const addNode = (symbol: string, node: GraphNode): void => {
    const id = sanitizeMermaidId(symbol);
    if (!nodeLabels.has(id)) {
      nodeLabels.set(id, `${id}["${symbol}<br/><small>${node.kind}</small>"]`);
    }
  };

  const traverse = (symbol: string, depth: number, visited: Set<string>): void => {
    if (depth > maxDepth || visited.has(symbol)) return;
    visited.add(symbol);

    const node = graph.get(symbol);
    if (!node) return;

    addNode(symbol, node);

    if (direction === "downstream" || direction === "both") {
      for (const dep of node.downstreamEdges) {
        const edgeKey = `${symbol}-->${dep}`;
        if (!edges.has(edgeKey)) {
          edges.add(edgeKey);
          const depNode = graph.get(dep);
          if (depNode) addNode(dep, depNode);
          lines.push(
            `  ${sanitizeMermaidId(symbol)} --> ${sanitizeMermaidId(dep)}`,
          );
        }
        traverse(dep, depth + 1, new Set(visited));
      }
    }

    if (direction === "upstream" || direction === "both") {
      for (const caller of node.upstreamEdges) {
        const edgeKey = `${caller}-->${symbol}`;
        if (!edges.has(edgeKey)) {
          edges.add(edgeKey);
          const callerNode = graph.get(caller);
          if (callerNode) addNode(caller, callerNode);
          lines.push(
            `  ${sanitizeMermaidId(caller)} --> ${sanitizeMermaidId(symbol)}`,
          );
        }
        traverse(caller, depth + 1, new Set(visited));
      }
    }
  };

  traverse(targetSymbol, 0, new Set());

  // 插入节点标签定义
  const labelLines = [...nodeLabels.values()].map((l) => `  ${l}`);
  lines.splice(1, 0, ...labelLines);

  // 高亮目标节点
  const targetId = sanitizeMermaidId(targetSymbol);
  lines.push(`  style ${targetId} fill:#f96,stroke:#333,stroke-width:2px`);

  return lines.join("\n");
};

// ─── 主查询函数 ───────────────────────────────────────────────────────────────

/**
 * 查询指定符号的依赖图谱
 */
export const queryDependencyGraph = (
  scanResult: ScanResult,
  targetSymbol: string,
  options: DependencyGraphOptions = {},
): DependencyGraphResult | null => {
  const {
    depth = 2,
    direction = "both",
    format = "tree",
  } = options;

  const graph = buildDependencyGraph(scanResult);

  // 查找目标符号（大小写不敏感）
  const targetKey = [...graph.keys()].find(
    (k) => k.toLowerCase() === targetSymbol.toLowerCase(),
  ) ?? targetSymbol;

  const targetNode = graph.get(targetKey);

  const targetInfo = {
    symbol: targetKey,
    kind: (targetNode?.kind ?? "service") as SymbolKind,
    file: targetNode?.file ?? "",
    module: targetNode?.module ?? "unknown",
  };

  // 统计上下游数量
  const downstreamVisited =
    direction !== "upstream"
      ? bfsTraversal(graph, targetKey, "downstream", depth)
      : new Map();
  const upstreamVisited =
    direction !== "downstream"
      ? bfsTraversal(graph, targetKey, "upstream", depth)
      : new Map();

  // 去掉目标节点自身
  downstreamVisited.delete(targetKey);
  upstreamVisited.delete(targetKey);

  const stats = {
    totalNodes: downstreamVisited.size + upstreamVisited.size,
    upstreamCount: upstreamVisited.size,
    downstreamCount: downstreamVisited.size,
  };

  const result: DependencyGraphResult = { target: targetInfo, stats };

  if (format === "tree") {
    result.tree = buildTreeNode(graph, targetKey, direction, depth, 0, new Set());
  } else if (format === "flat") {
    const flatItems: FlatDependencyItem[] = [];

    for (const [symbol, { node, depth: d }] of downstreamVisited) {
      flatItems.push({
        symbol,
        kind: node.kind,
        file: node.file,
        module: node.module,
        direction: "downstream",
        depth: d,
      });
    }
    for (const [symbol, { node, depth: d }] of upstreamVisited) {
      flatItems.push({
        symbol,
        kind: node.kind,
        file: node.file,
        module: node.module,
        direction: "upstream",
        depth: d,
      });
    }

    flatItems.sort((a, b) => a.depth - b.depth || a.symbol.localeCompare(b.symbol));
    result.flat = flatItems;
  } else if (format === "mermaid") {
    result.mermaid = buildMermaidGraph(graph, targetKey, direction, depth);
  }

  return result;
};
