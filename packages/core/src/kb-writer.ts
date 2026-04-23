/**
 * KB Writer — ported from `generate_kb.py`.
 *
 * Emits the 5-layer Markdown KB from a ScanResult. Output paths match the
 * Python edition exactly so both editions can be diffed 1:1.
 *
 *   kb/
 *   ├── server/<name>/{00_project_map,01_index_api,02_index_model,
 *   │                   03_index_service,04_index_config,changelog}.md
 *   │   ├── api/<routeName>.md
 *   │   └── services/<serviceName>.md
 *   └── frontend/<name>/{00_project_map,01_index_page,02_index_component,
 *                         03_index_api,04_index_store,05_index_types,
 *                         changelog}.md
 *       └── pages/<page-kebab>.md
 */
import path from "node:path";
import { writeFileEnsuring } from "./utils/fs";
import { kebab } from "./utils/path";
import type {
  KoaRaw,
  ModuleInfo,
  NestRaw,
  OrmKind,
  ReactRaw,
  ReactPageInfo,
  ReactNativeRaw,
  ScanResult,
  TsFileInfo,
  Vue3Raw,
  Vue2Raw,
} from "./types";

const ORM_LABEL: Record<OrmKind, string> = {
  mongoose: "Mongoose",
  prisma: "Prisma",
  typeorm: "TypeORM",
  sequelize: "Sequelize",
  drizzle: "Drizzle",
};

const isSqlOrm = (orm: OrmKind): boolean => orm !== "mongoose";

const nowStamp = (): string => {
  const d = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

const join = (lines: string[]): string => lines.join("\n") + "\n";

// ═══════════════════════════════════════════════════════════════════════
// Server (Koa) writers
// ═══════════════════════════════════════════════════════════════════════

const writeServerApiIndex = async (raw: KoaRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# API 路由索引", ""];
  L.push("## 路由挂载", "");
  L.push("| 路由文件 | 端点数 | 说明 |", "|---------|--------|------|");
  for (const r of raw.routes) L.push(`| ${r.name}.ts | ${r.endpoints.length} | ${r.name} 相关 API |`);

  L.push("", "## 全量 API 列表", "");
  L.push("| # | 方法 | 路径 | 中间件 | 路由文件 |", "|---|------|------|--------|---------|");
  let idx = 1;
  for (const r of raw.routes) {
    for (const e of r.endpoints) {
      const mw = e.middlewares.length > 0 ? e.middlewares.join(", ") : "—";
      L.push(`| ${idx} | ${e.method} | ${e.path} | ${mw} | ${r.name}.ts |`);
      idx += 1;
    }
  }
  await writeFileEnsuring(path.join(outDir, "01_index_api.md"), join(L));
};

const writeServerApiDetails = async (raw: KoaRaw, outDir: string): Promise<void> => {
  for (const r of raw.routes) {
    const L: string[] = [`# ${r.name} 路由`, ""];
    L.push(`**文件**: server/src/routes/${r.name}.ts`);
    L.push(`**端点数**: ${r.endpoints.length}`, "");
    L.push("## API 列表", "");
    for (const e of r.endpoints) {
      const mw = e.middlewares.length > 0 ? e.middlewares.join(", ") : "无";
      L.push(`### ${e.method} ${e.path}`, "");
      L.push(`**中间件**: ${mw}`, "");
    }
    await writeFileEnsuring(path.join(outDir, "api", `${r.name}.md`), join(L));
  }
};

const modelFileLabel = (raw: KoaRaw, modelName: string): string => {
  const orm = raw.orm ?? "mongoose";
  if (orm === "prisma") return "prisma/schema.prisma";
  if (orm === "typeorm") return `src/entities/${modelName}.ts`;
  return `server/src/models/${modelName}.ts`;
};

const writeServerModelIndex = async (raw: KoaRaw, outDir: string): Promise<void> => {
  const orm = raw.orm ?? "mongoose";
  const label = ORM_LABEL[orm];
  const sql = isSqlOrm(orm);

  const L: string[] = [`# ${label} Model 索引`, ""];
  L.push("## Model 总览", "");
  if (sql) {
    L.push(
      "| # | Model 名 | 表名 | 文件 | 字段数 | 说明 |",
      "|---|---------|------|------|--------|------|",
    );
    let idx = 1;
    for (const m of raw.models) {
      const table = m.tableName ?? m.name.toLowerCase();
      L.push(
        `| ${idx} | ${m.name} | ${table} | ${modelFileLabel(raw, m.name)} | ${m.fields.length} | — |`,
      );
      idx += 1;
    }
  } else {
    L.push(
      "| # | Model 名 | 文件 | 接口数 | 字段数 | 说明 |",
      "|---|---------|------|--------|--------|------|",
    );
    let idx = 1;
    for (const m of raw.models) {
      L.push(
        `| ${idx} | ${m.name} | models/${m.name}.ts | ${m.interfaces.length} | ${m.fields.length} | — |`,
      );
      idx += 1;
    }
  }

  L.push("", "## Model 详情", "");
  for (const m of raw.models) {
    L.push(`### ${m.name}`, "");
    L.push(`**文件**: ${modelFileLabel(raw, m.name)}`, "");
    if (sql && m.tableName) L.push(`**表名**: ${m.tableName}`, "");

    for (const iface of m.interfaces) {
      L.push(`**接口 \`${iface.name}\`**:`, "");
      if (iface.fields.length > 0) {
        L.push("| 字段 | 类型 | 可选 |", "|------|------|------|");
        for (const f of iface.fields) {
          const opt = f.optional ? "✅" : "—";
          L.push(`| ${f.name} | ${f.type} | ${opt} |`);
        }
        L.push("");
      }
    }

    if (m.fields.length > 0) {
      if (sql) {
        L.push("**表字段**:", "");
        L.push(
          "| 字段 | 列名 | 类型 | PK | 自增 | 唯一 | 可空 | 长度 | 默认值 | 关联 |",
          "|------|------|------|----|----|------|------|------|--------|------|",
        );
        for (const f of m.fields) {
          const pk = f.primary ? "✅" : "—";
          const ai = f.autoIncrement ? "✅" : "—";
          const uniq = f.unique ? "✅" : "—";
          const nullable = f.nullable ? "✅" : "—";
          const length =
            f.length !== undefined
              ? String(f.length)
              : f.precision !== undefined && f.scale !== undefined
                ? `${f.precision},${f.scale}`
                : "—";
          const relation = f.relation
            ? `${f.relation.target}${f.relation.foreignKey ? ` (fk=${f.relation.foreignKey})` : ""}`
            : f.ref ?? "—";
          L.push(
            `| ${f.name} | ${f.columnName ?? f.name} | ${f.type ?? "—"} | ${pk} | ${ai} | ${uniq} | ${nullable} | ${length} | ${f.default ?? "—"} | ${relation} |`,
          );
        }
      } else {
        L.push("**Schema 字段**:", "");
        L.push(
          "| 字段 | 类型 | 必填 | 唯一 | 关联 | 默认值 |",
          "|------|------|------|------|------|--------|",
        );
        for (const f of m.fields) {
          const req = f.required ? "✅" : "—";
          const uniq = f.unique ? "✅" : "—";
          L.push(
            `| ${f.name} | ${f.type ?? "—"} | ${req} | ${uniq} | ${f.ref ?? "—"} | ${f.default ?? "—"} |`,
          );
        }
      }
      L.push("");
    }
  }

  await writeFileEnsuring(path.join(outDir, "02_index_model.md"), join(L));
};

const writeServerServiceIndex = async (raw: KoaRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Service 索引", ""];
  L.push("## Service 总览", "");
  L.push(
    "| # | Service 名 | 文件 | 导出函数数 | 依赖 Model | 依赖 Service |",
    "|---|-----------|------|-----------|-----------|-------------|",
  );
  let idx = 1;
  for (const s of raw.services) {
    const models = s.dependencies.models.join(", ") || "—";
    const services = s.dependencies.services.join(", ") || "—";
    L.push(
      `| ${idx} | ${s.name} | services/${s.name}.ts | ${s.exports.length} | ${models} | ${services} |`,
    );
    idx += 1;
  }

  L.push("", "## Service 摘要", "");
  for (const s of raw.services) {
    L.push(`### ${s.name}`, "");
    L.push(`**文件**: server/src/services/${s.name}.ts`, "");
    if (s.exports.length > 0) {
      L.push("**导出函数**:", "", "| 函数 | 说明 |", "|------|------|");
      for (const exp of s.exports) L.push(`| ${exp} | — |`);
      L.push("");
    }
    const { models, services, external } = s.dependencies;
    if (models.length + services.length + external.length > 0) {
      L.push("**依赖**:", "", "| 依赖 | 类型 | 用途 |", "|------|------|------|");
      for (const x of models) L.push(`| ${x} | Model | — |`);
      for (const x of services) L.push(`| ${x} | Service | — |`);
      for (const x of external) L.push(`| ${x} | 外部库 | — |`);
      L.push("");
    }
  }

  await writeFileEnsuring(path.join(outDir, "03_index_service.md"), join(L));
};

const writeServerServiceDetails = async (raw: KoaRaw, outDir: string): Promise<void> => {
  for (const s of raw.services) {
    const complexity = s.exports.length >= 3 ? "复杂" : "简单";
    const L: string[] = [`# ${s.name}`, ""];
    L.push(`**文件**: server/src/services/${s.name}.ts`);
    L.push(`**复杂度**: ${complexity}`, "");
    L.push("## 职责", "", `${s.name} 业务逻辑服务。`, "");

    const { models, services, external } = s.dependencies;
    if (models.length + services.length + external.length > 0) {
      L.push("## 依赖", "", "| 依赖 | 类型 | 用途 |", "|------|------|------|");
      for (const x of models) L.push(`| ${x} | Model | — |`);
      for (const x of services) L.push(`| ${x} | Service | — |`);
      for (const x of external) L.push(`| ${x} | 外部库 | — |`);
      L.push("");
    }

    if (s.exports.length > 0) {
      if (complexity === "简单") {
        L.push("## 导出函数", "", "| 函数 | 说明 |", "|------|------|");
        for (const exp of s.exports) L.push(`| ${exp} | — |`);
      } else {
        L.push("## 导出函数详情", "");
        for (const exp of s.exports) {
          L.push(`### ${exp}`, "");
          L.push("⚠️ 待补充详细逻辑", "");
        }
      }
      L.push("");
    }

    await writeFileEnsuring(path.join(outDir, "services", `${s.name}.md`), join(L));
  }
};

const writeServerConfigIndex = async (raw: KoaRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 配置与中间件索引", ""];

  L.push("## 中间件", "");
  L.push("| # | 中间件名 | 文件 | 说明 |", "|---|---------|------|------|");
  let idx = 1;
  for (const mw of raw.middleware) {
    for (const exp of mw.exports) {
      L.push(`| ${idx} | ${exp} | middleware/${mw.name}.ts | — |`);
      idx += 1;
    }
  }
  L.push("");

  L.push("## 配置文件", "");
  L.push("| # | 文件 | 导出 | 说明 |", "|---|------|------|------|");
  idx = 1;
  for (const cfg of raw.config) {
    const exports = cfg.exports.join(", ") || "—";
    L.push(`| ${idx} | config/${path.basename(cfg.file)} | ${exports} | — |`);
    idx += 1;
  }
  L.push("");

  const orm = raw.orm ?? "mongoose";
  const dbBlurb =
    orm === "mongoose"
      ? "MongoDB 连接管理"
      : orm === "prisma"
        ? "Prisma Client 连接管理"
        : orm === "typeorm"
          ? "TypeORM DataSource 管理"
          : "Sequelize 连接管理";
  L.push("## 数据库", "");
  L.push("| # | 文件 | 说明 |", "|---|------|------|");
  for (const db of raw.db) {
    L.push(`| 1 | db/${path.basename(db.file)} | ${dbBlurb} |`);
  }
  L.push("");

  await writeFileEnsuring(path.join(outDir, "04_index_config.md"), join(L));
};

const writeChangelog = async (outDir: string, bodySuffix: string): Promise<void> => {
  const content = `# Changelog

## ${nowStamp()} — 初始生成

- 从源码扫描自动生成知识库
- ${bodySuffix}
`;
  await writeFileEnsuring(path.join(outDir, "changelog.md"), content);
};

const writeServerProjectMap = async (mod: ModuleInfo, raw: KoaRaw, outDir: string): Promise<void> => {
  const frameworkLabel = raw.framework === "express" ? "Express" : "Koa";
  const orm = raw.orm ?? "mongoose";
  const ormLabel = ORM_LABEL[orm];

  const L: string[] = [`# ${mod.name} — 后端项目全景`, ""];
  L.push(`**技术栈**: ${frameworkLabel} + TypeScript + ${ormLabel}`);
  L.push(`**路径**: ${mod.root}`, "");
  L.push("## 目录结构", "", "```");
  if (orm === "prisma") {
    L.push("prisma/");
    L.push("└── schema.prisma   # Prisma 数据模型");
    L.push("src/");
  } else {
    L.push("src/");
  }
  L.push("├── index.ts         # 应用入口");
  L.push(`├── routes/          # ${frameworkLabel} 路由`);
  L.push("├── services/        # 业务逻辑");
  if (orm === "mongoose") {
    L.push("├── models/          # Mongoose Model");
  } else if (orm === "typeorm") {
    L.push("├── entities/        # TypeORM Entity");
  } else if (orm === "sequelize") {
    L.push("├── models/          # Sequelize Model");
  }
  L.push("├── middleware/      # 中间件");
  L.push("├── config/          # 配置");
  L.push("└── db/              # 数据库连接");
  L.push("```", "");
  L.push("## 统计", "");
  L.push(`- 路由文件: ${raw.routes.length} 个`);
  L.push(`- Service: ${raw.services.length} 个`);
  L.push(`- Model: ${raw.models.length} 个`);
  L.push(`- 中间件: ${raw.middleware.length} 个`);
  const endpoints = raw.routes.reduce((acc, r) => acc + r.endpoints.length, 0);
  L.push(`- 端点总数: ${endpoints}`);
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

// ═══════════════════════════════════════════════════════════════════════
// React writers
// ═══════════════════════════════════════════════════════════════════════

const isPageFile = (p: TsFileInfo): boolean =>
  !!p.relPath && /\.(tsx|jsx)$/.test(p.relPath);

const writeReactProjectMap = async (
  mod: ModuleInfo,
  raw: ReactRaw,
  outDir: string,
): Promise<void> => {
  const L: string[] = [`# ${mod.name} — 前端项目全景`, ""];
  const uiLabel = raw.uiLibrary ? raw.uiLibrary.name : "(no UI lib detected)";

  if (raw.isNextJs) {
    L.push(`**技术栈**: Next.js + React + TypeScript + ${uiLabel}`);
    L.push(`**路径**: ${mod.root}`, "");
    L.push("## 目录结构", "", "```");
    L.push("├── app/              # App Router 页面 (Next.js 13+)");
    L.push("├── pages/            # Pages Router 页面 (可选)");
    L.push("├── components/       # 公共组件");
    L.push("├── lib/              # 工具函数 / API 封装");
    L.push("└── types/            # TypeScript 类型定义");
    L.push("```", "");
  } else {
    L.push(`**技术栈**: React + TypeScript + ${uiLabel} + Zustand`);
    L.push(`**路径**: ${mod.root}`, "");
    L.push("## 目录结构", "", "```", "src/");
    L.push("├── App.tsx           # 根组件 + 路由");
    L.push("├── api/              # API 请求封装");
    L.push("├── components/       # 公共组件");
    L.push("├── pages/            # 页面组件");
    L.push("├── store/            # Zustand 状态管理");
    L.push("└── types/            # TypeScript 类型定义");
    L.push("```", "");
  }

  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| 路径 | 组件 |", "|------|------|");
    for (const r of raw.routes) L.push(`| ${r.path} | ${r.component} |`);
    L.push("");
  }

  L.push("## 统计", "");
  L.push(`- 页面: ${raw.pages.filter(isPageFile).length} 个`);
  L.push(`- 组件: ${raw.components.length} 个`);
  L.push(`- API 文件: ${raw.apiFiles.length} 个`);
  L.push(`- Store 文件: ${raw.storeFiles.length} 个`);
  L.push(`- Types 文件: ${raw.typesFiles.length} 个`);
  L.push(`- Hooks: ${raw.hooks.length} 个`);
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

const writeReactPageIndex = async (raw: ReactRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 页面索引", ""];
  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| # | 路由路径 | 页面组件 |", "|---|---------|---------|");
    raw.routes.forEach((r, i) => L.push(`| ${i + 1} | ${r.path} | ${r.component} |`));
    L.push("");
  }

  const pages = raw.pages.filter(isPageFile) as ReactPageInfo[];
  L.push("## 页面功能摘要", "");
  L.push(
    "| # | 页面 | 文件 | useState 数 | API 调用 | 事件处理 |",
    "|---|------|------|------------|---------|---------|",
  );
  pages.forEach((p, i) => {
    const states = p.states?.length ?? 0;
    const apis = (p.apiCalls ?? []).slice(0, 3).join(", ") || "—";
    const handlers = p.handlers?.length ?? 0;
    L.push(`| ${i + 1} | ${p.name} | ${p.relPath ?? ""} | ${states} | ${apis} | ${handlers} |`);
  });
  L.push("");
  await writeFileEnsuring(path.join(outDir, "01_index_page.md"), join(L));
};

const writeReactPageDetails = async (raw: ReactRaw, outDir: string): Promise<void> => {
  const pages = raw.pages.filter(isPageFile) as ReactPageInfo[];
  for (const p of pages) {
    const kbName = kebab(p.name);
    const statesCount = p.states?.length ?? 0;
    const apisCount = p.apiCalls?.length ?? 0;
    const complexity = statesCount >= 4 || apisCount >= 2 ? "复杂" : "简单";

    const L: string[] = [`# ${p.name}`, ""];
    L.push(`**文件**: ${p.relPath ?? ""}`);
    L.push(`**复杂度**: ${complexity}`, "");
    L.push("## 功能概述", "", `${p.name} 页面。`, "");

    if (p.states?.length) {
      L.push("## 状态管理", "", "| 状态 | setter | 类型 | 初始值 |", "|------|--------|------|--------|");
      for (const s of p.states) {
        L.push(`| ${s.name} | ${s.setter} | ${s.type || "—"} | ${s.initial || "—"} |`);
      }
      L.push("");
    }
    if (p.apiCalls?.length) {
      L.push("## API 调用", "", "| API 方法 |", "|---------|");
      for (const a of p.apiCalls) L.push(`| api.${a} |`);
      L.push("");
    }
    if (p.hooks?.length) {
      L.push("## Hooks", "", "| Hook |", "|------|");
      for (const h of p.hooks) L.push(`| ${h} |`);
      L.push("");
    }
    if (p.handlers?.length) {
      L.push("## 事件处理函数", "", "| 函数名 |", "|--------|");
      for (const h of p.handlers) L.push(`| ${h} |`);
      L.push("");
    }

    await writeFileEnsuring(path.join(outDir, "pages", `${kbName}.md`), join(L));
  }
};

const writeReactComponentIndex = async (raw: ReactRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 公共组件索引", ""];
  if (raw.components.length === 0) {
    L.push("> 该模块无公共组件", "");
  } else {
    L.push("## 组件总览", "");
    L.push("| # | 组件名 | 文件 | Props 数 |", "|---|--------|------|---------|");
    raw.components.forEach((c, i) =>
      L.push(`| ${i + 1} | ${c.name} | ${c.relPath ?? ""} | ${c.props?.length ?? 0} |`),
    );
    L.push("");
    L.push("## 组件详情", "");
    for (const c of raw.components) {
      L.push(`### ${c.name}`, "", `**文件**: ${c.relPath ?? ""}`, "");
      if (c.props?.length) {
        L.push("**Props**:", "", "| Prop | 类型 | 可选 |", "|------|------|------|");
        for (const p of c.props) {
          L.push(`| ${p.name} | ${p.type} | ${p.optional ? "✅" : "—"} |`);
        }
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "02_index_component.md"), join(L));
};

/** 通用前端 API 封装索引（React / Vue 3 / Vue 2 共用） */
const writeApiIndex = async (
  apiFiles: TsFileInfo[],
  outDir: string,
): Promise<void> => {
  const L: string[] = ["# 前端 API 封装索引", ""];
  if (apiFiles.length === 0) {
    L.push("> 该模块无 API 封装文件", "");
  } else {
    for (const af of apiFiles) {
      L.push(`## ${path.basename(af.file)}`, "", `**文件**: ${af.relPath ?? ""}`, "");
      if (af.exports.length > 0) {
        L.push("**导出函数**:", "", "| # | 函数名 |", "|---|--------|" );
        af.exports.forEach((e, i) => L.push(`| ${i + 1} | ${e} |`));
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "03_index_api.md"), join(L));
};

/** @deprecated 保留别名，避免破坏现有调用 */
const writeReactApiIndex = (raw: ReactRaw, outDir: string) =>
  writeApiIndex(raw.apiFiles, outDir);
const writeReactStoreIndex = async (raw: ReactRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Zustand Store 索引", ""];
  if (raw.storeFiles.length === 0) {
    L.push("> 该模块无 Store 文件", "");
  } else {
    for (const sf of raw.storeFiles) {
      L.push(`## ${path.basename(sf.file)}`, "", `**文件**: ${sf.relPath ?? ""}`, "");
      if (sf.exports.length > 0) {
        L.push("**导出**:", "", "| 导出名 |", "|--------|");
        for (const e of sf.exports) L.push(`| ${e} |`);
        L.push("");
      }
      for (const iface of sf.interfaces) {
        L.push(`**接口 \`${iface.name}\`**:`, "");
        if (iface.fields.length > 0) {
          L.push("| 字段 | 类型 | 可选 |", "|------|------|------|");
          for (const f of iface.fields) {
            L.push(`| ${f.name} | ${f.type} | ${f.optional ? "✅" : "—"} |`);
          }
          L.push("");
        }
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "04_index_store.md"), join(L));
};

/** 通用 TypeScript 类型定义索引（React / Vue 3 / Vue 2 共用） */
const writeTypesIndex = async (
  typesFiles: TsFileInfo[],
  outDir: string,
): Promise<void> => {
  const L: string[] = ["# TypeScript 类型定义索引", ""];
  if (typesFiles.length === 0) {
    L.push("> 该模块无类型定义文件", "");
  } else {
    for (const tf of typesFiles) {
      L.push(`## ${path.basename(tf.file)}`, "", `**文件**: ${tf.relPath ?? ""}`, "");
      if (tf.interfaces.length > 0) {
        L.push("### 接口", "");
        for (const iface of tf.interfaces) {
          L.push(`#### ${iface.name}`, "");
          if (iface.fields.length > 0) {
            L.push("| 字段 | 类型 | 可选 |", "|------|------|------|" );
            for (const f of iface.fields) {
              L.push(`| ${f.name} | ${f.type} | ${f.optional ? "✅" : "—"} |`);
            }
            L.push("");
          }
        }
      }
      if (tf.types.length > 0) {
        L.push("### 类型别名", "", "| 类型名 | 定义 |", "|--------|------|" );
        for (const t of tf.types) L.push(`| ${t.name} | ${t.value.slice(0, 60)} |`);
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "05_index_types.md"), join(L));
};

/** @deprecated 保留别名，避免破坏现有调用 */
const writeReactTypesIndex = (raw: ReactRaw, outDir: string) =>
  writeTypesIndex(raw.typesFiles, outDir);
// ═══════════════════════════════════════════════════════════════════════
// Vue 3 writers
// ═══════════════════════════════════════════════════════════════════════

const writeVue3ProjectMap = async (
  mod: ModuleInfo,
  raw: Vue3Raw,
  outDir: string,
): Promise<void> => {
  const uiLabel = raw.uiLibrary ? raw.uiLibrary.name : "(no UI lib detected)";
  const L: string[] = [`# ${mod.name} — 前端项目全景`, ""];

  if (raw.isNuxt) {
    L.push(`**技术栈**: Nuxt 3 + Vue 3 + TypeScript + ${uiLabel}`);
    L.push(`**路径**: ${mod.root}`, "");
    L.push("## 目录结构", "", "```");
    L.push("├── pages/            # 页面（基于文件系统路由）");
    L.push("├── components/       # 公共组件（自动导入）");
    L.push("├── composables/      # 组合式函数（自动导入）");
    L.push("├── stores/           # Pinia 状态管理");
    L.push("├── utils/            # 工具函数（自动导入）");
    L.push("├── server/           # 服务端 API (server/api/)");
    L.push("└── types/            # TypeScript 类型定义");
    L.push("```", "");
  } else {
    L.push(`**技术栈**: Vue 3 + TypeScript + ${uiLabel} + Pinia`);
    L.push(`**路径**: ${mod.root}`, "");
    L.push("## 目录结构", "", "```", "src/");
    L.push("├── views/            # 页面视图 (.vue)");
    L.push("├── components/       # 公共组件 (.vue)");
    L.push("├── composables/      # 组合式函数 (useXxx)");
    L.push("├── stores/           # Pinia 状态管理");
    L.push("├── api/              # API 请求封装");
    L.push("├── router/           # vue-router 路由");
    L.push("└── types/            # TypeScript 类型定义");
    L.push("```", "");
  }

  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| 路径 | 组件 | 名称 |", "|------|------|------|");
    for (const r of raw.routes) L.push(`| ${r.path} | ${r.component} | ${r.name ?? "—"} |`);
    L.push("");
  }

  if (raw.uiLibrary && raw.uiLibrary.components.length > 0) {
    L.push("## UI 组件使用", "");
    L.push(`**库**: ${raw.uiLibrary.name}@${raw.uiLibrary.version ?? "*"}`, "");
    L.push(`**使用组件**: ${raw.uiLibrary.components.slice(0, 20).join(", ")}`, "");
  }

  L.push("## 统计", "");
  L.push(`- 视图: ${raw.views.length} 个`);
  L.push(`- 组件: ${raw.components.length} 个`);
  L.push(`- Composables: ${raw.composables.length} 个`);
  L.push(`- Store 文件: ${raw.stores.length} 个`);
  L.push(`- API 文件: ${raw.apiFiles.length} 个`);
  L.push(`- Types 文件: ${raw.typesFiles.length} 个`);
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

const writeVue3PageIndex = async (raw: Vue3Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# 视图索引", ""];
  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| # | 路由路径 | 组件 | 名称 |", "|---|---------|------|------|");
    raw.routes.forEach((r, i) => L.push(`| ${i + 1} | ${r.path} | ${r.component} | ${r.name ?? "—"} |`));
    L.push("");
  }
  L.push("## 视图功能摘要", "");
  L.push(
    "| # | 视图 | 文件 | ref 数 | computed 数 | watch 数 | API 调用 |",
    "|---|------|------|--------|------------|---------|---------|"  ,
  );
  raw.views.forEach((v, i) => {
    const apis = v.apiCalls.slice(0, 3).join(", ") || "—";
    L.push(`| ${i + 1} | ${v.name} | ${v.relPath ?? ""} | ${v.refs.length} | ${v.computeds.length} | ${v.watchCount} | ${apis} |`);
  });
  L.push("");
  await writeFileEnsuring(path.join(outDir, "01_index_page.md"), join(L));
};

const writeVue3ComponentIndex = async (raw: Vue3Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# 公共组件索引", ""];
  if (raw.components.length === 0) {
    L.push("> 该模块无公共组件", "");
  } else {
    L.push("## 组件总览", "");
    L.push("| # | 组件名 | 文件 | Props 数 | Emits 数 |", "|---|--------|------|---------|---------|"  );
    raw.components.forEach((c, i) =>
      L.push(`| ${i + 1} | ${c.name} | ${c.relPath ?? ""} | ${c.props.length} | ${c.emits.length} |`),
    );
    L.push("");
  }
  await writeFileEnsuring(path.join(outDir, "02_index_component.md"), join(L));
};

const writeVue3StoreIndex = async (raw: Vue3Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# Pinia Store 索引", ""];
  if (raw.stores.length === 0) {
    L.push("> 该模块无 Store 文件", "");
  } else {
    for (const s of raw.stores) {
      L.push(`## ${path.basename(s.file)}`, "", `**文件**: ${s.relPath ?? ""}`, "");
      if (s.storeId) L.push(`**Store ID**: ${s.storeId}`, "");
      if (s.exports.length > 0) {
        L.push("**导出**:", "", "| 导出名 |", "|--------|"  );
        for (const e of s.exports) L.push(`| ${e} |`);
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "04_index_store.md"), join(L));
};

// ═══════════════════════════════════════════════════════════════════════
// Vue 2 writers
// ═══════════════════════════════════════════════════════════════════════

const writeVue2ProjectMap = async (
  mod: ModuleInfo,
  raw: Vue2Raw,
  outDir: string,
): Promise<void> => {
  const uiLabel = raw.uiLibrary ? raw.uiLibrary.name : "(no UI lib detected)";
  const L: string[] = [`# ${mod.name} — 前端项目全景`, ""];
  L.push(`**技术栈**: Vue 2 + JavaScript / TypeScript + ${uiLabel} + Vuex`);
  L.push(`**路径**: ${mod.root}`, "");
  L.push("## 目录结构", "", "```", "src/");
  L.push("├── views/            # 页面视图 (.vue)");
  L.push("├── components/       # 公共组件 (.vue)");
  L.push("├── mixins/           # Vue Mixins");
  L.push("├── store/            # Vuex 状态管理");
  L.push("├── api/              # API 请求封装");
  L.push("├── router/           # vue-router 路由");
  L.push("└── types/            # TypeScript 类型定义");
  L.push("```", "");

  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| 路径 | 组件 | 名称 |", "|------|------|------|");
    for (const r of raw.routes) L.push(`| ${r.path} | ${r.component} | ${r.name ?? "—"} |`);
    L.push("");
  }

  if (raw.uiLibrary && raw.uiLibrary.components.length > 0) {
    L.push("## UI 组件使用", "");
    L.push(`**库**: ${raw.uiLibrary.name}@${raw.uiLibrary.version ?? "*"}`, "");
    L.push(`**使用组件**: ${raw.uiLibrary.components.slice(0, 20).join(", ")}`, "");
  }

  L.push("## 统计", "");
  L.push(`- 视图: ${raw.views.length} 个`);
  L.push(`- 组件: ${raw.components.length} 个`);
  L.push(`- Mixins: ${raw.mixins.length} 个`);
  L.push(`- Store 文件: ${raw.stores.length} 个`);
  L.push(`- API 文件: ${raw.apiFiles.length} 个`);
  L.push(`- Types 文件: ${raw.typesFiles.length} 个`);
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

const writeVue2PageIndex = async (raw: Vue2Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# 视图索引", ""];
  if (raw.routes.length > 0) {
    L.push("## 路由表", "", "| # | 路由路径 | 组件 | 名称 |", "|---|---------|------|------|");
    raw.routes.forEach((r, i) => L.push(`| ${i + 1} | ${r.path} | ${r.component} | ${r.name ?? "—"} |`));
    L.push("");
  }
  L.push("## 视图功能摘要", "");
  L.push(
    "| # | 视图 | 文件 | data 数 | computed 数 | methods 数 | API 调用 |",
    "|---|------|------|---------|------------|-----------|---------|"  ,
  );
  raw.views.forEach((v, i) => {
    const apis = v.apiCalls.slice(0, 3).join(", ") || "—";
    L.push(`| ${i + 1} | ${v.name} | ${v.relPath ?? ""} | ${v.dataProps.length} | ${v.computeds.length} | ${v.methods.length} | ${apis} |`);
  });
  L.push("");
  await writeFileEnsuring(path.join(outDir, "01_index_page.md"), join(L));
};

const writeVue2ComponentIndex = async (raw: Vue2Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# 公共组件索引", ""];
  if (raw.components.length === 0) {
    L.push("> 该模块无公共组件", "");
  } else {
    L.push("## 组件总览", "");
    L.push("| # | 组件名 | 文件 | Props 数 | Emits 数 |", "|---|--------|------|---------|---------|"  );
    raw.components.forEach((c, i) =>
      L.push(`| ${i + 1} | ${c.name} | ${c.relPath ?? ""} | ${c.props.length} | ${c.emits.length} |`),
    );
    L.push("");
  }
  await writeFileEnsuring(path.join(outDir, "02_index_component.md"), join(L));
};

const writeVue2StoreIndex = async (raw: Vue2Raw, outDir: string): Promise<void> => {
  const L: string[] = ["# Vuex Store 索引", ""];
  if (raw.stores.length === 0) {
    L.push("> 该模块无 Store 文件", "");
  } else {
    for (const s of raw.stores) {
      L.push(`## ${path.basename(s.file)}`, "", `**文件**: ${s.relPath ?? ""}`, "");
      if (s.namespace) L.push(`**命名空间**: ${s.namespace}`, "");
      if (s.stateProps.length > 0) {
        L.push("**State**:", "", "| 属性 |", "|------|"  );
        for (const p of s.stateProps) L.push(`| ${p} |`);
        L.push("");
      }
      if (s.mutations.length > 0) {
        L.push("**Mutations**:", "", "| 名称 |", "|------|"  );
        for (const m of s.mutations) L.push(`| ${m} |`);
        L.push("");
      }
      if (s.actions.length > 0) {
        L.push("**Actions**:", "", "| 名称 |", "|------|"  );
        for (const a of s.actions) L.push(`| ${a} |`);
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "04_index_store.md"), join(L));
};

// ═══════════════════════════════════════════════════════════════════
// React Native writers
// ═══════════════════════════════════════════════════════════════════

const writeRnProjectMap = async (
  mod: ModuleInfo,
  raw: ReactNativeRaw,
  outDir: string,
): Promise<void> => {
  const L: string[] = [`# ${mod.name} — React Native 项目全景`, ""];
  const platform = raw.isExpo ? "Expo" : "React Native (bare)";
  L.push(`**技术栈**: ${platform} + TypeScript`);
  L.push(`**路径**: ${mod.root}`, "");
  L.push("## 目录结构", "", "```", "src/");
  L.push("├── screens/          # 屏幕组件（等同 web 的 pages）");
  L.push("├── components/       # 公共组件");
  L.push("├── navigation/       # React Navigation 路由配置");
  L.push("├── hooks/            # 自定义 Hooks");
  L.push("├── store/            # 状态管理（Zustand / Redux）");
  L.push("├── api/              # API 请求封装");
  L.push("└── types/            # TypeScript 类型定义");
  L.push("```", "");

  if (raw.navigation.length > 0) {
    L.push("## 导航路由", "", "| 屏幕名 | 组件 |", "|--------|------|" );
    for (const r of raw.navigation) L.push(`| ${r.name} | ${r.component} |`);
    L.push("");
  }

  L.push("## 统计", "");
  L.push(`- 屏幕: ${raw.screens.length} 个`);
  L.push(`- 组件: ${raw.components.length} 个`);
  L.push(`- 导航路由: ${raw.navigation.length} 个`);
  L.push(`- Hooks: ${raw.hooks.length} 个`);
  L.push(`- Store 文件: ${raw.storeFiles.length} 个`);
  L.push(`- API 文件: ${raw.apiFiles.length} 个`);
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

const writeRnScreenIndex = async (raw: ReactNativeRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 屏幕索引", ""];
  if (raw.navigation.length > 0) {
    L.push("## 导航路由表", "", "| # | 屏幕名 | 组件 |", "|---|--------|------|" );
    raw.navigation.forEach((r, i) => L.push(`| ${i + 1} | ${r.name} | ${r.component} |`));
    L.push("");
  }
  L.push("## 屏幕功能摘要", "");
  L.push(
    "| # | 屏幕 | 文件 | useState 数 | useEffect 数 | API 调用 |",
    "|---|------|------|------------|------------|---------|" ,
  );
  raw.screens.forEach((s, i) => {
    const apis = s.apiCalls.slice(0, 3).join(", ") || "—";
    L.push(`| ${i + 1} | ${s.name} | ${s.relPath ?? ""} | ${s.states.length} | ${s.effectCount} | ${apis} |`);
  });
  L.push("");
  await writeFileEnsuring(path.join(outDir, "01_index_page.md"), join(L));
};

const writeRnComponentIndex = async (raw: ReactNativeRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# 公共组件索引", ""];
  if (raw.components.length === 0) {
    L.push("> 该模块无公共组件", "");
  } else {
    L.push("## 组件总览", "");
    L.push("| # | 组件名 | 文件 | Props 数 |", "|---|--------|------|---------|" );
    raw.components.forEach((c, i) =>
      L.push(`| ${i + 1} | ${c.name} | ${c.relPath ?? ""} | ${c.props?.length ?? 0} |`),
    );
    L.push("");
  }
  await writeFileEnsuring(path.join(outDir, "02_index_component.md"), join(L));
};

const writeRnStoreIndex = async (raw: ReactNativeRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Store 索引", ""];
  if (raw.storeFiles.length === 0) {
    L.push("> 该模块无 Store 文件", "");
  } else {
    for (const sf of raw.storeFiles) {
      L.push(`## ${path.basename(sf.file)}`, "", `**文件**: ${sf.relPath ?? ""}`, "");
      if (sf.exports.length > 0) {
        L.push("**导出**:", "", "| 导出名 |", "|--------|" );
        for (const e of sf.exports) L.push(`| ${e} |`);
        L.push("");
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "04_index_store.md"), join(L));
};

// ═══════════════════════════════════════════════════════════════════
// NestJS writers
// ═══════════════════════════════════════════════════════════════════
const writeNestProjectMap = async (
  mod: ModuleInfo,
  raw: NestRaw,
  outDir: string,
): Promise<void> => {
  const orm = raw.orm ?? "mongoose";
  const L: string[] = [
    `# ${mod.name} 项目地图`,
    "",
    `**框架**: NestJS`,
    `**ORM**: ${ORM_LABEL[orm] ?? orm}`,
    `**入口**: src/main.ts`,
    "",
    "## 目录结构",
    "",
    "```",
    "src/",
    "  main.ts",
  ];
  const moduleNames = raw.modules.map((m) => m.name);
  for (const m of moduleNames) L.push(`  ${m}.module.ts`);
  L.push("```", "");

  L.push("## 模块概览", "");
  L.push("| 模块 | Controllers | Providers | Exports |", "|------|-------------|-----------|---------|" );
  for (const m of raw.modules) {
    L.push(
      `| ${m.moduleName} | ${m.controllers.join(", ") || "—"} | ${m.providers.join(", ") || "—"} | ${m.moduleExports.join(", ") || "—"} |`,
    );
  }
  await writeFileEnsuring(path.join(outDir, "00_project_map.md"), join(L));
};

const writeNestApiIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# API 路由索引", ""];
  L.push("## Controller 挂载", "");
  L.push("| Controller | 前缀 | 端点数 |", "|------------|------|--------|" );
  for (const c of raw.controllers) {
    L.push(`| ${c.name} | /${c.prefix || ""} | ${c.endpoints.length} |`);
  }
  L.push("", "## 全量 API 列表", "");
  L.push("| # | 方法 | 路径 | Handler | Guards | Controller |", "|---|------|------|---------|--------|------------|" );
  let idx = 1;
  for (const c of raw.controllers) {
    for (const e of c.endpoints) {
      const guards = e.guards.length > 0 ? e.guards.join(", ") : "—";
      L.push(`| ${idx} | ${e.method} | ${e.path} | ${e.handler} | ${guards} | ${c.name} |`);
      idx += 1;
    }
  }
  await writeFileEnsuring(path.join(outDir, "01_index_api.md"), join(L));
};

const writeNestApiDetails = async (raw: NestRaw, outDir: string): Promise<void> => {
  for (const c of raw.controllers) {
    const L: string[] = [`# ${c.name}`, ""];
    L.push(`**文件**: ${c.relPath}`);
    L.push(`**路由前缀**: /${c.prefix || ""}`);
    L.push(`**端点数**: ${c.endpoints.length}`, "");
    L.push("## API 列表", "");
    for (const e of c.endpoints) {
      const guards = e.guards.length > 0 ? e.guards.join(", ") : "无";
      L.push(`### ${e.method} ${e.path}`, "");
      L.push(`**Handler**: \`${e.handler}\``);
      L.push(`**Guards**: ${guards}`, "");
    }
    await writeFileEnsuring(path.join(outDir, "api", `${c.name}.md`), join(L));
  }
};

const writeNestModelIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const orm = raw.orm ?? "mongoose";
  const label = ORM_LABEL[orm] ?? orm;
  const sql = isSqlOrm(orm);
  const L: string[] = [`# Model 索引 (${label})`, ""];
  if (raw.models.length === 0) {
    L.push("> 未检测到 Model 文件。");
  } else {
    L.push("| Model | 表名 | 字段数 | 文件 |", "|-------|------|--------|------|" );
    for (const m of raw.models) {
      const tableName = sql ? (m.tableName ?? m.name) : "—";
      L.push(`| ${m.modelName ?? m.name} | ${tableName} | ${m.fields.length} | ${m.relPath} |`);
    }
  }
  await writeFileEnsuring(path.join(outDir, "02_index_model.md"), join(L));
};

const writeNestServiceIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Service 索引", ""];
  if (raw.services.length === 0) {
    L.push("> 未检测到 Service 文件。");
  } else {
    L.push("| Service | 导出类 | 文件 |", "|---------|--------|------|" );
    for (const s of raw.services) {
      L.push(`| ${s.name} | ${s.exports.join(", ") || "—"} | ${s.relPath} |`);
    }
  }
  await writeFileEnsuring(path.join(outDir, "03_index_service.md"), join(L));
};

const writeNestProviderIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Provider 索引 (Guard / Interceptor / Pipe / Filter)", ""];
  const allProviders = [
    ...raw.guards,
    ...raw.interceptors,
    ...raw.pipes,
    ...raw.filters,
  ];
  if (allProviders.length === 0) {
    L.push("> 未检测到 Guard / Interceptor / Pipe / Filter 文件。");
  } else {
    L.push("| 名称 | 类型 | 导出类 | 文件 |", "|------|------|--------|------|" );
    for (const p of allProviders) {
      L.push(`| ${p.name} | ${p.providerKind} | ${p.exports.join(", ") || "—"} | ${p.relPath} |`);
    }
  }
  await writeFileEnsuring(path.join(outDir, "04_index_provider.md"), join(L));
};

const writeNestDtoIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# DTO 索引", ""];
  if (raw.dtos.length === 0) {
    L.push("> 未检测到 DTO 文件。");
  } else {
    L.push("| DTO 类 | 字段数 | 文件 |", "|--------|--------|------|" );
    for (const d of raw.dtos) {
      for (const cls of d.classes) {
        L.push(`| ${cls} | ${d.fields.length} | ${d.relPath} |`);
      }
    }
  }
  await writeFileEnsuring(path.join(outDir, "05_index_dto.md"), join(L));
};

const writeNestModuleIndex = async (raw: NestRaw, outDir: string): Promise<void> => {
  const L: string[] = ["# Module 索引", ""];
  if (raw.modules.length === 0) {
    L.push("> 未检测到 Module 文件。");
  } else {
    L.push("| Module | 导入 | Controllers | Providers | 导出 |", "|--------|------|-------------|-----------|------|" );
    for (const m of raw.modules) {
      L.push(
        `| ${m.moduleName} | ${m.imports.join(", ") || "—"} | ${m.controllers.join(", ") || "—"} | ${m.providers.join(", ") || "—"} | ${m.moduleExports.join(", ") || "—"} |`,
      );
    }
  }
  await writeFileEnsuring(path.join(outDir, "06_index_module.md"), join(L));
};

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

export interface WriteKbOptions {
  scan: ScanResult;
  kbRoot: string;
  /**
   * Called after each file is written. May return a Promise; writeKb will
   * await it before writing the next file, so hooks (e.g. markDone) never
   * race against each other on shared state like progress.md.
   */
  onFileWritten?: (relPath: string) => void | Promise<void>;
}

export const writeKb = async (opts: WriteKbOptions): Promise<void> => {
  const { scan, kbRoot } = opts;

  for (const mod of scan.modules) {
    if (
      mod.kind === "backend" &&
      (mod.raw?.framework === "koa" || mod.raw?.framework === "express")
    ) {
      const raw = mod.raw;
      const outDir = path.join(kbRoot, "server", mod.name);
      await writeServerProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/00_project_map.md`);
      await writeServerApiIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/01_index_api.md`);
      await writeServerApiDetails(raw, outDir);
      for (const r of raw.routes) await opts.onFileWritten?.(`server/${mod.name}/api/${r.name}.md`);
      await writeServerModelIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/02_index_model.md`);
      await writeServerServiceIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/03_index_service.md`);
      await writeServerServiceDetails(raw, outDir);
      for (const s of raw.services) await opts.onFileWritten?.(`server/${mod.name}/services/${s.name}.md`);
      await writeServerConfigIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/04_index_config.md`);
      await writeChangelog(outDir, "覆盖全量路由、Model、Service、配置");
      await opts.onFileWritten?.(`server/${mod.name}/changelog.md`);
    } else if (mod.kind === "frontend" && mod.raw?.framework === "react") {
      const raw = mod.raw;
      const outDir = path.join(kbRoot, "frontend", mod.name);
      await writeReactProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/00_project_map.md`);
      await writeReactPageIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/01_index_page.md`);
      await writeReactPageDetails(raw, outDir);
      const pages = (raw.pages as ReactPageInfo[]).filter((p) => isPageFile(p));
      for (const p of pages) await opts.onFileWritten?.(`frontend/${mod.name}/pages/${kebab(p.name)}.md`);
      await writeReactComponentIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/02_index_component.md`);
      await writeReactApiIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/03_index_api.md`);
      await writeReactStoreIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/04_index_store.md`);
      await writeReactTypesIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/05_index_types.md`);
      await writeChangelog(outDir, "覆盖全量页面、组件、API、Store、Types");
      await opts.onFileWritten?.(`frontend/${mod.name}/changelog.md`);
    } else if (mod.kind === "frontend" && mod.raw?.framework === "vue3") {
      const raw = mod.raw as Vue3Raw;
      const outDir = path.join(kbRoot, "frontend", mod.name);
      await writeVue3ProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/00_project_map.md`);
      await writeVue3PageIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/01_index_page.md`);
      await writeVue3ComponentIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/02_index_component.md`);
      await writeApiIndex(raw.apiFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/03_index_api.md`);
      await writeVue3StoreIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/04_index_store.md`);
      await writeTypesIndex(raw.typesFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/05_index_types.md`);
      await writeChangelog(outDir, "覆盖全量视图、组件、API、Store、Types");
      await opts.onFileWritten?.(`frontend/${mod.name}/changelog.md`);
    } else if (mod.kind === "frontend" && mod.raw?.framework === "vue2") {
      const raw = mod.raw as Vue2Raw;
      const outDir = path.join(kbRoot, "frontend", mod.name);
      await writeVue2ProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/00_project_map.md`);
      await writeVue2PageIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/01_index_page.md`);
      await writeVue2ComponentIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/02_index_component.md`);
      await writeApiIndex(raw.apiFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/03_index_api.md`);
      await writeVue2StoreIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/04_index_store.md`);
      await writeTypesIndex(raw.typesFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/05_index_types.md`);
      await writeChangelog(outDir, "覆盖全量视图、组件、API、Store、Types");
      await opts.onFileWritten?.(`frontend/${mod.name}/changelog.md`);
    } else if (mod.kind === "frontend" && mod.raw?.framework === "react-native") {
      const raw = mod.raw as ReactNativeRaw;
      const outDir = path.join(kbRoot, "frontend", mod.name);
      await writeRnProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/00_project_map.md`);
      await writeRnScreenIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/01_index_page.md`);
      await writeRnComponentIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/02_index_component.md`);
      await writeApiIndex(raw.apiFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/03_index_api.md`);
      await writeRnStoreIndex(raw, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/04_index_store.md`);
      await writeTypesIndex(raw.typesFiles, outDir);
      await opts.onFileWritten?.(`frontend/${mod.name}/05_index_types.md`);
      await writeChangelog(outDir, "覆盖全量 Screen、组件、API、Store、Types");
      await opts.onFileWritten?.(`frontend/${mod.name}/changelog.md`);
    } else if (mod.kind === "backend" && mod.raw?.framework === "nestjs") {
      const raw = mod.raw as NestRaw;
      const outDir = path.join(kbRoot, "server", mod.name);
      await writeNestProjectMap(mod, raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/00_project_map.md`);
      await writeNestApiIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/01_index_api.md`);
      await writeNestApiDetails(raw, outDir);
      for (const c of raw.controllers) await opts.onFileWritten?.(`server/${mod.name}/api/${c.name}.md`);
      await writeNestModelIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/02_index_model.md`);
      await writeNestServiceIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/03_index_service.md`);
      await writeNestProviderIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/04_index_provider.md`);
      await writeNestDtoIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/05_index_dto.md`);
      await writeNestModuleIndex(raw, outDir);
      await opts.onFileWritten?.(`server/${mod.name}/06_index_module.md`);
      await writeChangelog(outDir, "覆盖全量 Controller、Service、Model、Guard、DTO、Module");
      await opts.onFileWritten?.(`server/${mod.name}/changelog.md`);
    }
  }
};