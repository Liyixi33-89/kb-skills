/**
 * kb-meta.ts — KB 文件 YAML Front Matter 工具
 *
 * 提供：
 *   - serializeKbMeta：将 KbFileMeta 序列化为 YAML Front Matter 字符串
 *   - parseKbMeta：从 KB 文件内容中解析 YAML Front Matter
 *   - injectKbMeta：在 Markdown 内容头部注入 Front Matter
 *   - stripKbMeta：去除 Front Matter，返回纯 Markdown 正文
 */
import type { KbFileMeta, SymbolKind } from "../types.js";

const FRONT_MATTER_DELIMITER = "---";

// ─── 序列化 ───────────────────────────────────────────────────────────────────

/**
 * 将 KbFileMeta 序列化为 YAML Front Matter 字符串（含首尾 ---）
 */
export const serializeKbMeta = (meta: KbFileMeta): string => {
  const yamlLines: string[] = [
    FRONT_MATTER_DELIMITER,
    `symbol: ${meta.symbol}`,
    `kind: ${meta.kind}`,
    `file: ${meta.file}`,
    `module: ${meta.module}`,
    `dependencies: [${meta.dependencies.map((d) => `"${d}"`).join(", ")}]`,
    `calledBy: [${meta.calledBy.map((c) => `"${c}"`).join(", ")}]`,
    `exports: [${meta.exports.map((e) => `"${e}"`).join(", ")}]`,
    `updatedAt: ${meta.updatedAt}`,
    FRONT_MATTER_DELIMITER,
  ];
  return yamlLines.join("\n");
};

// ─── 解析 ─────────────────────────────────────────────────────────────────────

/**
 * 从 KB 文件内容中解析 YAML Front Matter，返回 KbFileMeta 或 null
 */
export const parseKbMeta = (content: string): KbFileMeta | null => {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(FRONT_MATTER_DELIMITER)) return null;

  const endIndex = trimmed.indexOf(
    `\n${FRONT_MATTER_DELIMITER}`,
    FRONT_MATTER_DELIMITER.length,
  );
  if (endIndex === -1) return null;

  const yamlBody = trimmed.slice(FRONT_MATTER_DELIMITER.length + 1, endIndex);

  try {
    return parseYamlBody(yamlBody);
  } catch {
    return null;
  }
};

/**
 * 简易 YAML 解析（仅支持 Front Matter 中用到的字段格式，避免引入 yaml 依赖）
 */
const parseYamlBody = (yaml: string): KbFileMeta | null => {
  const lines = yaml.split("\n");
  const record: Record<string, string> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    record[key] = value;
  }

  const symbol = record["symbol"];
  const kind = record["kind"] as SymbolKind | undefined;
  const file = record["file"];
  const module = record["module"];
  const updatedAt = record["updatedAt"];

  if (!symbol || !kind || !file || !module || !updatedAt) return null;

  return {
    symbol,
    kind,
    file,
    module,
    dependencies: parseYamlArray(record["dependencies"] ?? "[]"),
    calledBy: parseYamlArray(record["calledBy"] ?? "[]"),
    exports: parseYamlArray(record["exports"] ?? "[]"),
    updatedAt,
  };
};

/**
 * 解析简单的 YAML 内联数组，如 `["a", "b", "c"]`
 */
const parseYamlArray = (value: string): string[] => {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']/, "").replace(/["']$/, ""))
    .filter(Boolean);
};

// ─── 注入 / 剥离 ──────────────────────────────────────────────────────────────

/**
 * 在 Markdown 内容头部注入 Front Matter
 * 若已有 Front Matter，则替换旧的
 */
export const injectKbMeta = (meta: KbFileMeta, markdownBody: string): string => {
  const stripped = stripKbMeta(markdownBody);
  return `${serializeKbMeta(meta)}\n${stripped}`;
};

/**
 * 去除 Front Matter，返回纯 Markdown 正文
 */
export const stripKbMeta = (content: string): string => {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(FRONT_MATTER_DELIMITER)) return content;

  const endIndex = trimmed.indexOf(
    `\n${FRONT_MATTER_DELIMITER}`,
    FRONT_MATTER_DELIMITER.length,
  );
  if (endIndex === -1) return content;

  return trimmed.slice(endIndex + FRONT_MATTER_DELIMITER.length + 2);
};
