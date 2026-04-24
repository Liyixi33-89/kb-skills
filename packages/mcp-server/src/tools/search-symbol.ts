/**
 * search-symbol.ts — Tool: search_symbol
 *
 * 在 ScanResult 中按名称/类型/模块搜索符号。
 * 支持模糊匹配（name 包含 query 字符串，大小写不敏感）。
 */
import type { ScanCache } from "../cache.js";
import type { SymbolKind } from "@kb-skills/core";

export interface SearchSymbolInput {
  query: string;
  kind?: string;
  module?: string;
  limit?: number;
}

export interface SearchSymbolResult {
  results: Array<{
    name: string;
    kind: SymbolKind;
    file: string;
    module: string;
    signature?: string;
    framework: string;
    exported: boolean;
  }>;
  total: number;
  query: string;
}

export const searchSymbol = async (
  cache: ScanCache,
  input: SearchSymbolInput,
): Promise<SearchSymbolResult> => {
  const { query, kind, module: moduleName, limit = 20 } = input;
  const scan = await cache.get();

  const queryLower = query.toLowerCase();

  const results = scan.modules
    .filter((m) => !moduleName || m.name === moduleName)
    .flatMap((m) =>
      m.symbols
        .filter((s) => {
          const nameMatch = s.name.toLowerCase().includes(queryLower);
          const kindMatch = !kind || s.kind === kind;
          return nameMatch && kindMatch;
        })
        .map((s) => ({
          name: s.name,
          kind: s.kind,
          file: s.file,
          module: m.name,
          signature: s.signature,
          framework: s.framework,
          exported: s.exported,
        })),
    )
    .slice(0, limit);

  return { results, total: results.length, query };
};
