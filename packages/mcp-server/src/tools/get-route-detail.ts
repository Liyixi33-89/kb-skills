/**
 * get-route-detail.ts — Tool: get_route_detail
 *
 * 按路由路径模糊查找，返回对应的 KB 文件内容 + 源码文件路径。
 * 同时支持后端路由（api/<route>.md）和前端页面路由（pages/<page>.md）。
 */
import path from "node:path";
import { readdir } from "node:fs/promises";
import { readTextOrNull, isDir } from "@kb-skills/core";
import type { McpContext } from "../context.js";
import type { ScanCache } from "../cache.js";
import type { KoaRaw, ReactRaw } from "@kb-skills/core";

export interface GetRouteDetailInput {
  route: string;
  module?: string;
}

export interface RouteDetailResult {
  found: boolean;
  route?: string;
  method?: string;
  module?: string;
  kbContent: string | null;
  kbFilePath?: string;
  sourceFilePath?: string;
}

// 将路由路径规范化为文件名（去掉前导斜杠，替换 / 为 -）
const routeToFileName = (route: string): string =>
  route
    .replace(/^\/+/, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .toLowerCase();

export const getRouteDetail = async (
  ctx: McpContext,
  cache: ScanCache,
  input: GetRouteDetailInput,
): Promise<RouteDetailResult> => {
  const { route, module: moduleName } = input;
  const scan = await cache.get();
  const queryLower = route.toLowerCase();

  for (const m of scan.modules) {
    if (moduleName && m.name !== moduleName) continue;

    const typeDir = m.kind === "backend" ? "server" : "frontend";
    const subDir = m.kind === "backend" ? "api" : "pages";
    const kbModDir = path.join(ctx.kbRoot, typeDir, m.name, subDir);

    if (!(await isDir(kbModDir))) continue;

    // 列出所有 .md 文件，找最匹配的
    let files: string[] = [];
    try {
      files = (await readdir(kbModDir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    // 优先精确匹配文件名，其次模糊匹配
    const normalized = routeToFileName(route);
    const exactMatch = files.find(
      (f) => f.replace(".md", "") === normalized,
    );
    const fuzzyMatch = files.find((f) =>
      f.toLowerCase().includes(queryLower.replace(/^\/+/, "")),
    );
    const matched = exactMatch ?? fuzzyMatch;

    if (!matched) continue;

    const kbFilePath = path.join(kbModDir, matched);
    const kbContent = await readTextOrNull(kbFilePath);

    // 从 raw 中找到对应的源码文件路径
    let sourceFilePath: string | undefined;
    let method: string | undefined;

    if (m.kind === "backend") {
      const raw = m.raw as KoaRaw | undefined;
      const routeFile = raw?.routes.find((r) =>
        r.name.toLowerCase().includes(queryLower.replace(/^\/+/, "")),
      );
      if (routeFile) {
        sourceFilePath = routeFile.relPath;
        method = routeFile.endpoints[0]?.method;
      }
    } else {
      const raw = m.raw as ReactRaw | undefined;
      const page = raw?.pages.find((p) =>
        (p.relPath ?? "").toLowerCase().includes(queryLower.replace(/^\/+/, "")),
      );
      if (page) {
        sourceFilePath = page.relPath;
      }
    }

    return {
      found: true,
      route: matched.replace(".md", ""),
      method,
      module: m.name,
      kbContent,
      kbFilePath: path.relative(ctx.kbRoot, kbFilePath),
      sourceFilePath,
    };
  }

  return { found: false, kbContent: null };
};
