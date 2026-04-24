/**
 * get-kb-file.ts — Tool: get_kb_file
 *
 * 直接读取 kbRoot 下的任意 KB 文件内容。
 * path 参数为相对于 kbRoot 的路径，如 "server/api/users.md"。
 */
import path from "node:path";
import { stat } from "node:fs/promises";
import { readTextOrNull } from "@kb-skills/core";
import type { McpContext } from "../context.js";

export interface GetKbFileInput {
  path: string;
}

export interface GetKbFileResult {
  content: string | null;
  exists: boolean;
  filePath: string;
  lastModified?: string;
  sizeBytes?: number;
}

export const getKbFile = async (
  ctx: McpContext,
  input: GetKbFileInput,
): Promise<GetKbFileResult> => {
  // 安全检查：防止路径穿越
  const resolved = path.resolve(ctx.kbRoot, input.path);
  if (!resolved.startsWith(ctx.kbRoot)) {
    return {
      content: null,
      exists: false,
      filePath: input.path,
    };
  }

  const content = await readTextOrNull(resolved);
  if (content === null) {
    return { content: null, exists: false, filePath: input.path };
  }

  let lastModified: string | undefined;
  let sizeBytes: number | undefined;
  try {
    const s = await stat(resolved);
    lastModified = s.mtime.toISOString();
    sizeBytes = s.size;
  } catch {
    // 忽略 stat 错误
  }

  return {
    content,
    exists: true,
    filePath: input.path,
    lastModified,
    sizeBytes,
  };
};
