/**
 * search-semantic.ts — Tool: search_semantic
 *
 * 基于 TF-IDF + 余弦相似度的本地语义搜索。
 * 无需外部 API Key，完全本地运行，对 KB 文件内容做向量化检索。
 *
 * 算法说明：
 *   - 使用 TF-IDF 对 KB 文件内容建立词频向量
 *   - 查询时计算查询向量与文档向量的余弦相似度
 *   - 支持中英文分词（基于空格 + 标点符号分割）
 *   - 向量索引在首次调用时懒加载，后续调用复用内存索引
 */
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseKbMeta } from "@kb-skills/core";
import type { McpContext } from "../context.js";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface SearchSemanticInput {
  query: string;
  topK?: number;
  module?: string;
}

export interface SemanticSearchItem {
  filePath: string;
  /** 相对于 kbRoot 的路径 */
  relativePath: string;
  title: string;
  module: string;
  /** 相关度评分 0-1 */
  score: number;
  /** 内容摘要（前 200 字符） */
  summary: string;
  /** 从 Front Matter 解析的元数据 */
  meta?: {
    symbol: string;
    kind: string;
    file: string;
    dependencies: string[];
  };
}

export interface SearchSemanticResult {
  results: SemanticSearchItem[];
  total: number;
  query: string;
  indexedFiles: number;
}

// ─── TF-IDF 向量索引 ──────────────────────────────────────────────────────────

interface DocVector {
  filePath: string;
  relativePath: string;
  title: string;
  module: string;
  content: string;
  /** TF-IDF 词频向量 */
  tfIdf: Map<string, number>;
}

/** 内存中的向量索引，key 为 kbRoot */
const vectorIndexCache = new Map<string, DocVector[]>();

/**
 * 分词：将文本拆分为词元（支持中英文）
 *
 * 策略：
 *   - 英文/数字：按空格分割，过滤长度 <= 1 的词
 *   - 中文：提取连续中文字符串，同时生成 unigram（单字）和 bigram（双字滑动窗口）
 *     bigram 能有效捕获「订单」「支付」「取消」等双字词
 */
const tokenize = (text: string): string[] => {
  const tokens: string[] = [];
  const lower = text.toLowerCase();

  // 提取英文/数字词元（长度 > 1）
  const engTokens = lower
    .replace(/[\u4e00-\u9fa5]/g, " ") // 中文替换为空格
    .replace(/[^a-z0-9\s_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  tokens.push(...engTokens);

  // 提取中文词元：unigram + bigram
  const chineseSegments = lower.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const seg of chineseSegments) {
    // unigram（单字）
    for (const char of seg) {
      tokens.push(char);
    }
    // bigram（双字滑动窗口）
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
    // trigram（三字，捕获更长短语）
    for (let i = 0; i < seg.length - 2; i++) {
      tokens.push(seg.slice(i, i + 3));
    }
  }

  return tokens.filter(Boolean);
};

/**
 * 计算 TF（词频）
 */
const computeTf = (tokens: string[]): Map<string, number> => {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  const total = tokens.length || 1;
  const tf = new Map<string, number>();
  for (const [token, count] of freq) {
    tf.set(token, count / total);
  }
  return tf;
};

/**
 * 计算余弦相似度
 */
const cosineSimilarity = (
  vecA: Map<string, number>,
  vecB: Map<string, number>,
): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [token, valA] of vecA) {
    const valB = vecB.get(token) ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
  }
  for (const [, valB] of vecB) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
};

// ─── 收集 KB 文件 ─────────────────────────────────────────────────────────────

const collectKbFiles = async (
  kbRoot: string,
  moduleFilter?: string,
): Promise<Array<{ filePath: string; relativePath: string; module: string }>> => {
  if (!existsSync(kbRoot)) return [];

  const results: Array<{ filePath: string; relativePath: string; module: string }> = [];

  const scanDir = async (dir: string, relBase: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relPath = path.join(relBase, entry);

      if (entry.endsWith(".md")) {
        // 从路径推断模块名（kbRoot/server/xxx → "server"）
        const moduleName = relBase.split(path.sep)[0] ?? relBase;
        if (moduleFilter && moduleName !== moduleFilter) continue;
        results.push({
          filePath: fullPath,
          relativePath: relPath,
          module: moduleName,
        });
      } else {
        // 递归子目录
        try {
          const { stat } = await import("node:fs/promises");
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            await scanDir(fullPath, relPath);
          }
        } catch {
          // 忽略
        }
      }
    }
  };

  await scanDir(kbRoot, "");
  return results;
};

// ─── 构建向量索引 ─────────────────────────────────────────────────────────────

const buildVectorIndex = async (
  kbRoot: string,
  moduleFilter?: string,
): Promise<DocVector[]> => {
  const files = await collectKbFiles(kbRoot, moduleFilter);
  const docs: DocVector[] = [];

  for (const { filePath, relativePath, module } of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // 提取标题（第一个 # 行）
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1] ?? path.basename(filePath, ".md");

    const tokens = tokenize(content);
    const tfIdf = computeTf(tokens);

    docs.push({ filePath, relativePath, title, module, content, tfIdf });
  }

  return docs;
};

// ─── 主搜索函数 ───────────────────────────────────────────────────────────────

export const searchSemantic = async (
  ctx: McpContext,
  input: SearchSemanticInput,
): Promise<SearchSemanticResult> => {
  const { query, topK = 10, module: moduleFilter } = input;

  // 懒加载向量索引（按 kbRoot 缓存）
  const cacheKey = `${ctx.kbRoot}:${moduleFilter ?? "all"}`;
  let index = vectorIndexCache.get(cacheKey);
  if (!index) {
    index = await buildVectorIndex(ctx.kbRoot, moduleFilter);
    vectorIndexCache.set(cacheKey, index);
  }

  if (index.length === 0) {
    return { results: [], total: 0, query, indexedFiles: 0 };
  }

  // 构建查询向量
  const queryTokens = tokenize(query);
  const queryVec = computeTf(queryTokens);

  // 计算相似度并排序
  const scored = index
    .map((doc) => ({
      doc,
      score: cosineSimilarity(queryVec, doc.tfIdf),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const results: SemanticSearchItem[] = scored.map(({ doc, score }) => {
    // 解析 Front Matter 元数据
    const meta = parseKbMeta(doc.content);
    // 生成内容摘要（去除 Front Matter 后的前 200 字符）
    const bodyStart = doc.content.indexOf("\n## ");
    const bodyText =
      bodyStart !== -1 ? doc.content.slice(bodyStart).trim() : doc.content;
    const summary = bodyText.replace(/[#*`\-|]/g, "").trim().slice(0, 200);

    return {
      filePath: doc.filePath,
      relativePath: doc.relativePath,
      title: doc.title,
      module: doc.module,
      score: Math.round(score * 1000) / 1000,
      summary,
      meta: meta
        ? {
            symbol: meta.symbol,
            kind: meta.kind,
            file: meta.file,
            dependencies: meta.dependencies,
          }
        : undefined,
    };
  });

  return {
    results,
    total: results.length,
    query,
    indexedFiles: index.length,
  };
};

/**
 * 清除指定 kbRoot 的向量索引缓存（run_scan 后调用）
 */
export const invalidateSemanticIndex = (kbRoot: string): void => {
  for (const key of vectorIndexCache.keys()) {
    if (key.startsWith(kbRoot)) {
      vectorIndexCache.delete(key);
    }
  }
};
