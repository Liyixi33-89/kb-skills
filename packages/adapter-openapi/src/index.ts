/**
 * @kb-skills/adapter-openapi — OpenAPI / Swagger spec adapter.
 *
 * 解析项目中的 openapi.json / swagger.yaml / openapi.yaml，
 * 将接口路径和 Schema 定义注入 KB，让 AI 知道完整的接口契约：
 *   - 请求参数（path / query / header / cookie）
 *   - 请求体结构（requestBody schema）
 *   - 响应体结构（responses schema）
 *   - 组件 Schema（components/schemas）
 *
 * 生成的 KB 文件路径：kb/openapi/<name>/
 *   ├── 00_overview.md        — 接口总览
 *   ├── 01_index_paths.md     — 路径索引
 *   ├── schemas/<tag>.md      — 按 tag 分组的接口契约详情
 *   └── components.md         — Schema 组件定义
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  writeFileEnsuring,
  type ModuleInfo,
  type ScanAdapter,
  type SymbolInfo,
} from "@kb-skills/core";

// ─── OpenAPI 类型定义（最小化，不依赖外部库）────────────────────────────────

interface OaSchema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OaSchema>;
  items?: OaSchema;
  required?: string[];
  enum?: unknown[];
  $ref?: string;
  allOf?: OaSchema[];
  oneOf?: OaSchema[];
  anyOf?: OaSchema[];
  nullable?: boolean;
  example?: unknown;
  default?: unknown;
}

interface OaParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OaSchema;
}

interface OaMediaType {
  schema?: OaSchema;
  example?: unknown;
}

interface OaRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, OaMediaType>;
}

interface OaResponse {
  description?: string;
  content?: Record<string, OaMediaType>;
}

interface OaOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OaParameter[];
  requestBody?: OaRequestBody;
  responses?: Record<string, OaResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
}

type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace";

type OaPathItem = Partial<Record<HttpMethod, OaOperation>> & {
  parameters?: OaParameter[];
  summary?: string;
  description?: string;
};

interface OaComponents {
  schemas?: Record<string, OaSchema>;
  securitySchemes?: Record<string, unknown>;
}

interface OaInfo {
  title: string;
  version: string;
  description?: string;
}

interface OaSpec {
  openapi?: string;
  swagger?: string;
  info: OaInfo;
  paths?: Record<string, OaPathItem>;
  components?: OaComponents;
  tags?: Array<{ name: string; description?: string }>;
  servers?: Array<{ url: string; description?: string }>;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 将 $ref 路径解析为 schema 名称，如 "#/components/schemas/User" → "User" */
const refToName = (ref: string): string => ref.split("/").pop() ?? ref;

/** 将 OaSchema 渲染为简洁的类型字符串 */
const schemaToTypeStr = (schema: OaSchema | undefined, depth = 0): string => {
  if (!schema) return "any";
  if (schema.$ref) return refToName(schema.$ref);
  if (schema.allOf) return schema.allOf.map((s) => schemaToTypeStr(s, depth)).join(" & ");
  if (schema.oneOf) return schema.oneOf.map((s) => schemaToTypeStr(s, depth)).join(" | ");
  if (schema.anyOf) return schema.anyOf.map((s) => schemaToTypeStr(s, depth)).join(" | ");
  if (schema.type === "array") return `${schemaToTypeStr(schema.items, depth)}[]`;
  if (schema.type === "object" && schema.properties && depth < 2) {
    const fields = Object.entries(schema.properties)
      .map(([k, v]) => `${k}: ${schemaToTypeStr(v, depth + 1)}`)
      .join("; ");
    return `{ ${fields} }`;
  }
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  return schema.type ?? "any";
};

/** 将 OaSchema 渲染为 Markdown 字段表格 */
const schemaToTable = (schema: OaSchema, components?: OaComponents): string[] => {
  const L: string[] = [];
  // 解引用 $ref
  if (schema.$ref && components?.schemas) {
    const name = refToName(schema.$ref);
    const resolved = components.schemas[name];
    if (resolved) return schemaToTable(resolved, components);
  }
  if (schema.allOf) {
    for (const s of schema.allOf) L.push(...schemaToTable(s, components));
    return L;
  }
  if (!schema.properties) return L;

  L.push("| 字段 | 类型 | 必填 | 说明 |");
  L.push("|------|------|------|------|");
  const required = new Set(schema.required ?? []);
  for (const [name, field] of Object.entries(schema.properties)) {
    const type = schemaToTypeStr(field);
    const req = required.has(name) ? "✅" : "—";
    const desc = field.description ?? (field.enum ? `枚举: ${field.enum.join(", ")}` : "—");
    L.push(`| ${name} | \`${type}\` | ${req} | ${desc} |`);
  }
  return L;
};

/** 解析 YAML（极简实现，仅支持 JSON-compatible YAML，不引入外部依赖） */
const parseYamlOrJson = async (filePath: string): Promise<OaSpec> => {
  const content = await readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();

  // JSON 直接解析
  if (ext === ".json") {
    return JSON.parse(content) as OaSpec;
  }

  // YAML：使用动态 import 尝试加载 js-yaml（如果项目已安装），否则降级到 JSON.parse
  try {
    // 尝试 js-yaml（很多项目已有）
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — 可选依赖，运行时动态加载
    const jsYaml = await import("js-yaml").catch(() => null) as { load: (s: string) => unknown } | null;
    if (jsYaml) {
      return jsYaml.load(content) as OaSpec;
    }
    // 尝试 yaml 包
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — 可选依赖，运行时动态加载
    const yamlPkg = await import("yaml").catch(() => null) as { parse: (s: string) => unknown } | null;
    if (yamlPkg) {
      return yamlPkg.parse(content) as OaSpec;
    }
  } catch {
    // 忽略
  }

  // 最后降级：尝试 JSON.parse（有些 YAML 文件实际上是 JSON 格式）
  try {
    return JSON.parse(content) as OaSpec;
  } catch {
    throw new Error(
      `无法解析 ${filePath}。请安装 js-yaml 或 yaml 包：pnpm add -D js-yaml`,
    );
  }
};

/** 在项目根目录查找 OpenAPI 规范文件 */
const findSpecFile = async (projectRoot: string): Promise<string | null> => {
  const candidates = [
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "api/openapi.json",
    "api/openapi.yaml",
    "api/swagger.json",
    "api/swagger.yaml",
    "docs/openapi.json",
    "docs/openapi.yaml",
    "docs/swagger.json",
    "docs/swagger.yaml",
    "src/openapi.json",
    "src/openapi.yaml",
    "src/swagger.json",
    "src/swagger.yaml",
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(projectRoot, candidate);
    try {
      await readFile(fullPath);
      return fullPath;
    } catch {
      // 继续尝试下一个
    }
  }
  return null;
};

// ─── KB 写入函数 ─────────────────────────────────────────────────────────────

const join = (lines: string[]): string => lines.join("\n") + "\n";

/** 写入接口总览文件 */
const writeOverview = async (spec: OaSpec, outDir: string): Promise<void> => {
  const L: string[] = [`# ${spec.info.title} — OpenAPI 接口总览`, ""];
  L.push(`**版本**: ${spec.info.version}`);
  if (spec.info.description) L.push(`**描述**: ${spec.info.description}`);
  if (spec.servers?.length) {
    L.push("", "## 服务地址", "");
    for (const s of spec.servers) {
      L.push(`- \`${s.url}\`${s.description ? ` — ${s.description}` : ""}`);
    }
  }

  const paths = spec.paths ?? {};
  const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete"];
  let totalEndpoints = 0;
  const tagMap = new Map<string, number>();

  for (const [, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;
      totalEndpoints++;
      for (const tag of op.tags ?? ["default"]) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }
  }

  L.push("", "## 统计", "");
  L.push(`- 接口路径数: ${Object.keys(paths).length}`);
  L.push(`- 端点总数: ${totalEndpoints}`);
  if (spec.components?.schemas) {
    L.push(`- Schema 组件数: ${Object.keys(spec.components.schemas).length}`);
  }

  if (tagMap.size > 0) {
    L.push("", "## 按 Tag 分组", "");
    L.push("| Tag | 端点数 |", "|-----|--------|");
    for (const [tag, count] of [...tagMap.entries()].sort()) {
      L.push(`| ${tag} | ${count} |`);
    }
  }

  await writeFileEnsuring(path.join(outDir, "00_overview.md"), join(L));
};

/** 写入路径索引文件 */
const writePathsIndex = async (spec: OaSpec, outDir: string): Promise<void> => {
  const L: string[] = ["# 接口路径索引", ""];
  const paths = spec.paths ?? {};
  const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

  L.push("| # | 方法 | 路径 | 摘要 | Tag | 鉴权 |");
  L.push("|---|------|------|------|-----|------|");

  let idx = 1;
  for (const [routePath, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;
      const summary = op.summary ?? op.description?.slice(0, 40) ?? "—";
      const tags = (op.tags ?? ["default"]).join(", ");
      const auth = op.security !== undefined
        ? (op.security.length === 0 ? "无" : "✅")
        : "—";
      L.push(`| ${idx} | \`${method.toUpperCase()}\` | \`${routePath}\` | ${summary} | ${tags} | ${auth} |`);
      idx++;
    }
  }

  await writeFileEnsuring(path.join(outDir, "01_index_paths.md"), join(L));
};

/** 写入按 Tag 分组的接口契约详情 */
const writeSchemasByTag = async (spec: OaSpec, outDir: string): Promise<void> => {
  const paths = spec.paths ?? {};
  const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete"];
  const components = spec.components;

  // 按 tag 收集操作
  const tagOps = new Map<string, Array<{ method: string; path: string; op: OaOperation }>>();

  for (const [routePath, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;
      const tags = op.tags?.length ? op.tags : ["default"];
      for (const tag of tags) {
        if (!tagOps.has(tag)) tagOps.set(tag, []);
        tagOps.get(tag)!.push({ method: method.toUpperCase(), path: routePath, op });
      }
    }
  }

  for (const [tag, ops] of tagOps.entries()) {
    const L: string[] = [`# ${tag} — 接口契约`, ""];
    L.push(`**接口数**: ${ops.length}`, "");

    for (const { method, path: routePath, op } of ops) {
      L.push(`## \`${method} ${routePath}\``, "");
      if (op.summary) L.push(`**摘要**: ${op.summary}`, "");
      if (op.description) L.push(`**描述**: ${op.description}`, "");
      if (op.deprecated) L.push("> ⚠️ **已废弃**", "");
      if (op.operationId) L.push(`**operationId**: \`${op.operationId}\``, "");

      // 鉴权
      if (op.security !== undefined) {
        if (op.security.length === 0) {
          L.push("**鉴权**: 无（公开接口）", "");
        } else {
          const schemes = op.security.flatMap((s) => Object.keys(s)).join(", ");
          L.push(`**鉴权**: ${schemes}`, "");
        }
      }

      // 路径/查询参数
      const allParams = [
        ...(paths[routePath]?.parameters ?? []),
        ...(op.parameters ?? []),
      ];
      if (allParams.length > 0) {
        L.push("### 参数", "");
        L.push("| 名称 | 位置 | 类型 | 必填 | 说明 |");
        L.push("|------|------|------|------|------|");
        for (const p of allParams) {
          const type = schemaToTypeStr(p.schema);
          const req = p.required ? "✅" : "—";
          L.push(`| \`${p.name}\` | ${p.in} | \`${type}\` | ${req} | ${p.description ?? "—"} |`);
        }
        L.push("");
      }

      // 请求体
      if (op.requestBody) {
        L.push("### 请求体", "");
        if (op.requestBody.description) L.push(`${op.requestBody.description}`, "");
        const content = op.requestBody.content ?? {};
        for (const [mediaType, media] of Object.entries(content)) {
          L.push(`**Content-Type**: \`${mediaType}\``, "");
          if (media.schema) {
            const tableLines = schemaToTable(media.schema, components);
            if (tableLines.length > 0) {
              L.push(...tableLines);
            } else {
              L.push(`类型: \`${schemaToTypeStr(media.schema)}\``);
            }
          }
          L.push("");
        }
      }

      // 响应体
      if (op.responses) {
        L.push("### 响应", "");
        for (const [statusCode, response] of Object.entries(op.responses)) {
          const desc = response.description ?? "—";
          L.push(`#### ${statusCode} — ${desc}`, "");
          const content = response.content ?? {};
          for (const [mediaType, media] of Object.entries(content)) {
            L.push(`**Content-Type**: \`${mediaType}\``, "");
            if (media.schema) {
              const tableLines = schemaToTable(media.schema, components);
              if (tableLines.length > 0) {
                L.push(...tableLines);
              } else {
                L.push(`类型: \`${schemaToTypeStr(media.schema)}\``);
              }
            }
            L.push("");
          }
        }
      }

      L.push("---", "");
    }

    // tag 名称转为安全文件名
    const safeTag = tag.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
    await writeFileEnsuring(path.join(outDir, "schemas", `${safeTag}.md`), join(L));
  }
};

/** 写入 Schema 组件定义文件 */
const writeComponents = async (spec: OaSpec, outDir: string): Promise<void> => {
  const schemas = spec.components?.schemas;
  if (!schemas || Object.keys(schemas).length === 0) return;

  const L: string[] = ["# Schema 组件定义", ""];
  L.push(`共 ${Object.keys(schemas).length} 个 Schema 组件`, "");

  for (const [name, schema] of Object.entries(schemas)) {
    L.push(`## ${name}`, "");
    if (schema.description) L.push(`${schema.description}`, "");
    const tableLines = schemaToTable(schema, spec.components);
    if (tableLines.length > 0) {
      L.push(...tableLines);
    } else if (schema.type) {
      L.push(`类型: \`${schemaToTypeStr(schema)}\``);
    }
    L.push("");
  }

  await writeFileEnsuring(path.join(outDir, "components.md"), join(L));
};

// ─── 主扫描逻辑 ──────────────────────────────────────────────────────────────

const scanOpenApiSpec = async (
  specFile: string,
  projectRoot: string,
): Promise<{ spec: OaSpec; symbols: SymbolInfo[] }> => {
  const spec = await parseYamlOrJson(specFile);
  const symbols: SymbolInfo[] = [];
  const paths = spec.paths ?? {};
  const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete", "head", "options"];

  // 将每个接口路径转换为 SymbolInfo（kind: "route"）
  for (const [routePath, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;

      const name = `${method.toUpperCase()} ${routePath}`;
      symbols.push({
        kind: "route",
        name,
        file: path.relative(projectRoot, specFile).replace(/\\/g, "/"),
        signature: op.operationId,
        exported: true,
        framework: "openapi",
        extras: {
          operationId: op.operationId,
          summary: op.summary,
          tags: op.tags ?? [],
          deprecated: op.deprecated ?? false,
          hasRequestBody: !!op.requestBody,
          responseStatuses: Object.keys(op.responses ?? {}),
          paramCount: (op.parameters ?? []).length,
        },
      });
    }
  }

  // 将 Schema 组件转换为 SymbolInfo（kind: "type"）
  const schemas = spec.components?.schemas ?? {};
  for (const [schemaName, schema] of Object.entries(schemas)) {
    symbols.push({
      kind: "type",
      name: schemaName,
      file: path.relative(projectRoot, specFile).replace(/\\/g, "/"),
      exported: true,
      framework: "openapi",
      extras: {
        description: schema.description,
        fieldCount: Object.keys(schema.properties ?? {}).length,
        type: schema.type,
      },
    });
  }

  return { spec, symbols };
};

// ─── 公共 API ────────────────────────────────────────────────────────────────

export interface OpenApiAdapterOptions {
  /**
   * 手动指定 OpenAPI 规范文件路径（相对于 projectRoot 或绝对路径）。
   * 不指定时自动在项目根目录查找常见文件名。
   */
  specFile?: string;
  /** 模块名称，用于 KB 目录命名（默认: "openapi"）。 */
  moduleName?: string;
  /**
   * KB 输出根目录（默认: `<projectRoot>/kb`）。
   * 设置后会在此目录下生成 `openapi/<moduleName>/` 子目录。
   */
  kbRoot?: string;
}

/**
 * 写入 OpenAPI KB 文件。
 * 可在 scan 之后单独调用，也可通过 adapter.scan() 自动触发。
 */
export const writeOpenApiKb = async (
  spec: OaSpec,
  outDir: string,
): Promise<void> => {
  await writeOverview(spec, outDir);
  await writePathsIndex(spec, outDir);
  await writeSchemasByTag(spec, outDir);
  await writeComponents(spec, outDir);
};

const createOpenApiAdapter = (options: OpenApiAdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "openapi";

  return {
    name: "openapi",

    async detect(projectRoot: string): Promise<boolean> {
      if (options.specFile) {
        const fullPath = path.isAbsolute(options.specFile)
          ? options.specFile
          : path.join(projectRoot, options.specFile);
        try {
          await readFile(fullPath);
          return true;
        } catch {
          return false;
        }
      }
      const found = await findSpecFile(projectRoot);
      return found !== null;
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      // 确定规范文件路径
      let specFile: string;
      if (options.specFile) {
        specFile = path.isAbsolute(options.specFile)
          ? options.specFile
          : path.join(modulePath, options.specFile);
      } else {
        const found = await findSpecFile(modulePath);
        if (!found) {
          throw new Error(
            `adapter-openapi: 在 ${modulePath} 中未找到 OpenAPI 规范文件。\n` +
            `支持的文件名: openapi.json, openapi.yaml, swagger.json, swagger.yaml\n` +
            `或通过 options.specFile 手动指定路径。`,
          );
        }
        specFile = found;
      }

      const { spec, symbols } = await scanOpenApiSpec(specFile, modulePath);

      // 如果指定了 kbRoot，自动写入 KB 文件
      if (options.kbRoot) {
        const outDir = path.join(options.kbRoot, "openapi", moduleName);
        await writeOpenApiKb(spec, outDir);
      }

      return {
        name: moduleName,
        root: modulePath,
        kind: "backend",
        symbols,
        raw: undefined,
      };
    },
  };
};

export default createOpenApiAdapter;
export { createOpenApiAdapter };
export type { OaSpec, OaSchema, OaOperation, OaParameter, OaRequestBody, OaResponse };
