/**
 * get-module-map.ts — Tool: get_module_map
 *
 * 返回项目模块全景：模块列表 + 各模块的 00_project_map.md 内容。
 */
import path from "node:path";
import { readTextOrNull } from "@kb-skills/core";
import type { McpContext } from "../context.js";
import type { ScanCache } from "../cache.js";

export interface GetModuleMapInput {
  module?: string;
}

export interface ModuleMapEntry {
  name: string;
  kind: "frontend" | "backend";
  framework: string;
  symbolCount: number;
  kbMapContent: string | null;
}

export interface GetModuleMapResult {
  modules: ModuleMapEntry[];
  projectRoot: string;
  kbRoot: string;
}

export const getModuleMap = async (
  ctx: McpContext,
  cache: ScanCache,
  input: GetModuleMapInput,
): Promise<GetModuleMapResult> => {
  const { module: moduleName } = input;
  const scan = await cache.get();

  const filtered = scan.modules.filter(
    (m) => !moduleName || m.name === moduleName,
  );

  const modules: ModuleMapEntry[] = await Promise.all(
    filtered.map(async (m) => {
      // 读取 kb/server/<name>/00_project_map.md 或 kb/frontend/<name>/00_project_map.md
      const typeDir = m.kind === "backend" ? "server" : "frontend";
      const mapFile = path.join(
        ctx.kbRoot,
        typeDir,
        m.name,
        "00_project_map.md",
      );
      const kbMapContent = await readTextOrNull(mapFile);

      // 从 raw 中提取 framework
      const framework =
        (m.raw as { framework?: string } | undefined)?.framework ?? "unknown";

      return {
        name: m.name,
        kind: m.kind,
        framework,
        symbolCount: m.symbols.length,
        kbMapContent,
      };
    }),
  );

  return {
    modules,
    projectRoot: ctx.projectRoot,
    kbRoot: ctx.kbRoot,
  };
};
