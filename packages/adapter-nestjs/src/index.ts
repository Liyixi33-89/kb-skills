/**
 * @kb-skills/adapter-nestjs — Scan adapter for NestJS backends.
 *
 * Extracts routes (via @Controller + HTTP method decorators), services,
 * guards, interceptors, pipes, filters, DTOs, and modules.
 * Reuses the same ORM scanners (Prisma / TypeORM / Sequelize / Mongoose)
 * as the Koa/Express adapters via `@kb-skills/core`.
 *
 * Output shape: `NestRaw` — a dedicated payload type that `kb-writer` can
 * render into a NestJS-flavoured KB.
 */
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import {
  listFiles,
  relPosix,
  scanTsFile,
  readText,
  detectOrm,
  readDepsFromPackageJson,
  scanPrismaSchemaFile,
  scanTypeormEntities,
  scanSequelizeModels,
  type KoaInterface,
  type KoaInterfaceField,
  type KoaModelFile,
  type KoaSchemaField,
  type ModuleInfo,
  type NestControllerFile,
  type NestDtoFile,
  type NestEndpoint,
  type NestModuleFile,
  type NestProviderFile,
  type NestRaw,
  type NestServiceFile,
  type OrmKind,
  type ScanAdapter,
  type ScanRaw,
  type SymbolInfo,
  type TsFileInfo,
} from "@kb-skills/core";

// Re-export core NestJS types for consumers who import from this package.
export type {
  NestControllerFile,
  NestDtoFile,
  NestEndpoint,
  NestModuleFile,
  NestProviderFile,
  NestRaw,
  NestServiceFile,
};
// ─── constants ───────────────────────────────────────────────────────────────

const NESTJS_PKG_HINTS = ["@nestjs/core", "@nestjs/common", "@nestjs/platform-express", "@nestjs/platform-fastify"];

const HTTP_METHODS_NEST = ["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All"];

// ─── controller scanner ──────────────────────────────────────────────────────

/**
 * Extracts routes from a NestJS controller file.
 *
 * Handles:
 *   @Controller('prefix') / @Controller()
 *   @Get('path') / @Post('path') / etc. on class methods
 *   @UseGuards(GuardName) on class or method level
 */
const scanNestController = async (file: string): Promise<NestControllerFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  // Extract controller prefix: @Controller('prefix') or @Controller(`prefix`)
  const prefixMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
  const prefix = prefixMatch ? prefixMatch[1]! : "";

  const endpoints: NestEndpoint[] = [];

  // Split by method decorator blocks — find each @Get/@Post/etc. occurrence
  const methodPattern = new RegExp(
    `@(${HTTP_METHODS_NEST.join("|")})\\s*\\(\\s*['"\`]?([^'"\`\\)]*?)['"\`]?\\s*\\)`,
    "g",
  );

  for (const m of content.matchAll(methodPattern)) {
    const httpMethod = m[1]!.toUpperCase();
    const routePath = m[2]!.trim();

    // Find the handler method name: look for the next `async? methodName(` after the decorator
    const afterDecorator = content.slice(m.index! + m[0].length);
    const handlerMatch = afterDecorator.match(/^\s*(?:@\w+[^)]*\)\s*)*(?:async\s+)?(\w+)\s*\(/);
    const handler = handlerMatch ? handlerMatch[1]! : "unknown";

    // Collect guards from @UseGuards(...) on the same method block
    const guards: string[] = [];
    // Look backwards from the decorator for @UseGuards
    const before = content.slice(0, m.index!);
    const guardBlockMatch = before.match(/@UseGuards\s*\(([^)]+)\)\s*$/);
    if (guardBlockMatch) {
      for (const g of guardBlockMatch[1]!.split(",")) {
        const gName = g.trim();
        if (gName) guards.push(gName);
      }
    }

    // Build full path: prefix + route path
    const fullPath = [prefix, routePath].filter(Boolean).join("/");

    endpoints.push({ method: httpMethod, path: `/${fullPath}`, handler, guards });
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    prefix,
    endpoints,
  };
};

// ─── service scanner ─────────────────────────────────────────────────────────

const scanNestService = async (file: string): Promise<NestServiceFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const exports: string[] = [];
  const deps = { models: [] as string[], services: [] as string[], external: [] as string[] };

  // Extract imports
  const importRe =
    /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g;
  for (const m of content.matchAll(importRe)) {
    const source = m[3]!;
    const names = m[1]
      ? m[1]!.split(",").map((n) => n.trim().split(" as ")[0]!.trim()).filter(Boolean)
      : m[2]
        ? [m[2]!]
        : [];
    if (/(^|\/)(?:entities|models)\//.test(source)) deps.models.push(...names);
    else if (/(^|\/)(?:services|providers)\//.test(source)) deps.services.push(...names);
    else if (!source.startsWith(".")) deps.external.push(source);
  }

  // Extract exported class names
  for (const m of content.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    exports.push(m[1]!);
  }
  // Also pick up exported functions/consts
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) {
    exports.push(m[1]!);
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    exports,
    dependencies: deps,
  };
};

// ─── provider scanner (guard / interceptor / pipe / filter) ──────────────────

const scanNestProvider = async (
  file: string,
  providerKind: string,
): Promise<NestProviderFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const exports: string[] = [];
  for (const m of content.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    exports.push(m[1]!);
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    providerKind,
    exports,
  };
};

// ─── DTO scanner ─────────────────────────────────────────────────────────────

const scanNestDto = async (file: string): Promise<NestDtoFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const classes: string[] = [];
  for (const m of content.matchAll(/export\s+class\s+(\w+)/g)) {
    classes.push(m[1]!);
  }

  // Extract fields from the first class body
  const fields: KoaInterfaceField[] = [];
  const classBodyMatch = content.match(/export\s+class\s+\w+[^{]*\{([\s\S]*?)(?=\nexport\s+class|\n*$)/);
  if (classBodyMatch) {
    const body = classBodyMatch[1]!;
    // Match property declarations: `name?: type;` or `name: type;`
    for (const fm of body.matchAll(/^\s+(?:@\w+[^\n]*\n\s+)*(\w+)(\?)?:\s*([^;=\n]+)/gm)) {
      fields.push({
        name: fm[1]!,
        optional: Boolean(fm[2]),
        type: fm[3]!.trim(),
      });
    }
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    classes,
    fields,
  };
};

// ─── module scanner ──────────────────────────────────────────────────────────

const scanNestModule = async (file: string): Promise<NestModuleFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  // Must have @Module decorator
  if (!/@Module\s*\(/.test(content)) return null;

  const moduleName =
    content.match(/export\s+class\s+(\w+)/)?.[1] ?? path.basename(file, path.extname(file));

  const extractArray = (key: string): string[] => {
    const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*?)\\]`, "s");
    const m = content.match(re);
    if (!m) return [];
    return m[1]!
      .split(",")
      .map((s) => s.trim().replace(/\/\/[^\n]*/g, "").trim())
      .filter(Boolean);
  };

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    moduleName,
    imports: extractArray("imports"),
    controllers: extractArray("controllers"),
    providers: extractArray("providers"),
    moduleExports: extractArray("exports"),
  };
};

// ─── mongoose model scanner (reused from express adapter) ────────────────────

const scanMongooseModel = async (file: string): Promise<KoaModelFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const interfaces: KoaInterface[] = [];
  const ifaceRe = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]+)\}/gs;
  for (const m of content.matchAll(ifaceRe)) {
    const name = m[1]!;
    const body = m[2]!;
    const fields: KoaInterfaceField[] = [];
    for (const fm of body.matchAll(/(\w+)(\?)?:\s*([^;\n]+)/g)) {
      fields.push({ name: fm[1]!, optional: Boolean(fm[2]), type: fm[3]!.trim().replace(/;$/, "") });
    }
    interfaces.push({ name, fields });
  }

  const fields: KoaSchemaField[] = [];
  const schemaMatch = content.match(/new\s+(?:mongoose\.)?Schema\s*\(\s*\{([\s\S]*?)\}\s*[,)]/);
  if (schemaMatch) {
    const schemaBody = schemaMatch[1]!;
    for (const fm of schemaBody.matchAll(/(\w+)\s*:\s*\{([^}]+)\}/g)) {
      const fieldName = fm[1]!;
      const body = fm[2]!;
      const info: KoaSchemaField = { name: fieldName };
      const typeMatch = body.match(/type\s*:\s*(\w+)/);
      if (typeMatch) info.type = typeMatch[1]!;
      info.required = /required/i.test(body) && /true/i.test(body);
      info.unique = /unique/i.test(body) && /true/i.test(body);
      const refMatch = body.match(/ref\s*:\s*["'](\w+)["']/);
      if (refMatch) info.ref = refMatch[1]!;
      const defMatch = body.match(/default\s*:\s*([^,\n]+)/);
      if (defMatch) info.default = defMatch[1]!.trim();
      const enumMatch = body.match(/enum\s*:\s*\[([^\]]+)\]/);
      if (enumMatch) info.enum = enumMatch[1]!.trim();
      fields.push(info);
    }
    for (const fm of schemaBody.matchAll(
      /(\w+)\s*:\s*(String|Number|Boolean|Date|ObjectId|Mixed|Buffer|Map)\b/g,
    )) {
      if (!fields.some((f) => f.name === fm[1]!)) {
        fields.push({ name: fm[1]!, type: fm[2]! });
      }
    }
  }

  const modelMatch = content.match(/mongoose\.model\s*[<(]\s*["']?(\w+)/);

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    modelName: modelMatch ? modelMatch[1]! : undefined,
    interfaces,
    fields,
  };
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts files matching a filename pattern.
 * `listFiles` is non-recursive (single directory), so we walk the tree manually.
 */
const collectByPattern = async (
  root: string,
  pattern: RegExp,
): Promise<string[]> => {
  const results: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && pattern.test(entry.name)) {
        results.push(full);
      }
    }
  };

  await walk(root);
  return results.sort();
};

// ─── main scan ───────────────────────────────────────────────────────────────

const scanNestServer = async (serverRoot: string): Promise<NestRaw> => {
  const src = path.join(serverRoot, "src");
  const deps = await readDepsFromPackageJson(serverRoot);
  const orm: OrmKind = detectOrm(deps) ?? "mongoose";

  const raw: NestRaw = {
    framework: "nestjs",
    orm,
    controllers: [],
    services: [],
    models: [],
    guards: [],
    interceptors: [],
    pipes: [],
    filters: [],
    dtos: [],
    modules: [],
    config: [],
  };

  // ── controllers ──────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.controller\.ts$/)) {
    const info = await scanNestController(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.controllers.push(info);
    }
  }

  // ── models / entities ────────────────────────────────────────────────────
  if (orm === "prisma") {
    raw.models = await scanPrismaSchemaFile(serverRoot);
  } else if (orm === "typeorm") {
    raw.models = await scanTypeormEntities(serverRoot);
  } else if (orm === "sequelize") {
    raw.models = await scanSequelizeModels(serverRoot);
  } else {
    // mongoose — scan src/schemas/ and src/models/
    for (const dir of ["schemas", "models"]) {
      for (const f of await listFiles(path.join(src, dir), [".ts"]).catch(() => [])) {
        const info = await scanMongooseModel(f);
        if (info) {
          info.relPath = relPosix(serverRoot, f);
          info.orm = "mongoose";
          raw.models.push(info);
        }
      }
    }
    // Also scan *.schema.ts files anywhere under src/
    for (const f of await collectByPattern(src, /\.schema\.ts$/)) {
      if (!raw.models.some((m) => m.relPath === relPosix(serverRoot, f))) {
        const info = await scanMongooseModel(f);
        if (info) {
          info.relPath = relPosix(serverRoot, f);
          info.orm = "mongoose";
          raw.models.push(info);
        }
      }
    }
  }

  // ── services ─────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.service\.ts$/)) {
    const info = await scanNestService(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.services.push(info);
    }
  }

  // ── guards ───────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.guard\.ts$/)) {
    const info = await scanNestProvider(f, "guard");
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.guards.push(info);
    }
  }

  // ── interceptors ─────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.interceptor\.ts$/)) {
    const info = await scanNestProvider(f, "interceptor");
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.interceptors.push(info);
    }
  }

  // ── pipes ────────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.pipe\.ts$/)) {
    const info = await scanNestProvider(f, "pipe");
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.pipes.push(info);
    }
  }

  // ── filters ──────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.filter\.ts$/)) {
    const info = await scanNestProvider(f, "filter");
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.filters.push(info);
    }
  }

  // ── DTOs ─────────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.dto\.ts$/)) {
    const info = await scanNestDto(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.dtos.push(info);
    }
  }

  // ── modules ──────────────────────────────────────────────────────────────
  for (const f of await collectByPattern(src, /\.module\.ts$/)) {
    const info = await scanNestModule(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.modules.push(info);
    }
  }

  // ── config ───────────────────────────────────────────────────────────────
  for (const f of await listFiles(path.join(src, "config"), [".ts"]).catch(() => [])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.config.push(info);
    }
  }

  // ── entry ────────────────────────────────────────────────────────────────
  const entryInfo = await scanTsFile(path.join(src, "main.ts"));
  if (entryInfo) {
    entryInfo.relPath = "src/main.ts";
    raw.entry = entryInfo;
  }

  return raw;
};

// ─── flatten to symbols ──────────────────────────────────────────────────────

const flattenToSymbols = (raw: NestRaw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];

  for (const c of raw.controllers) {
    for (const e of c.endpoints) {
      symbols.push({
        kind: "route",
        name: `${e.method} ${e.path}`,
        file: c.relPath,
        exported: true,
        framework: "nestjs",
        extras: {
          handler: e.handler,
          guards: e.guards,
          controller: c.name,
          prefix: c.prefix,
        },
      });
    }
  }

  for (const m of raw.models) {
    symbols.push({
      kind: "model",
      name: m.modelName ?? m.name,
      file: m.relPath,
      exported: true,
      framework: "nestjs",
    });
  }

  for (const s of raw.services) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "service",
        name: exp,
        file: s.relPath,
        exported: true,
        framework: "nestjs",
        extras: { serviceFile: s.name },
      });
    }
  }

  for (const g of raw.guards) {
    for (const exp of g.exports) {
      symbols.push({
        kind: "middleware",
        name: exp,
        file: g.relPath,
        exported: true,
        framework: "nestjs",
        extras: { providerKind: "guard" },
      });
    }
  }

  for (const i of raw.interceptors) {
    for (const exp of i.exports) {
      symbols.push({
        kind: "middleware",
        name: exp,
        file: i.relPath,
        exported: true,
        framework: "nestjs",
        extras: { providerKind: "interceptor" },
      });
    }
  }

  for (const p of raw.pipes) {
    for (const exp of p.exports) {
      symbols.push({
        kind: "middleware",
        name: exp,
        file: p.relPath,
        exported: true,
        framework: "nestjs",
        extras: { providerKind: "pipe" },
      });
    }
  }

  for (const f of raw.filters) {
    for (const exp of f.exports) {
      symbols.push({
        kind: "middleware",
        name: exp,
        file: f.relPath,
        exported: true,
        framework: "nestjs",
        extras: { providerKind: "filter" },
      });
    }
  }

  for (const d of raw.dtos) {
    for (const cls of d.classes) {
      symbols.push({
        kind: "type",
        name: cls,
        file: d.relPath,
        exported: true,
        framework: "nestjs",
        extras: { dtoFile: d.name },
      });
    }
  }

  return symbols;
};

// ─── adapter factory ─────────────────────────────────────────────────────────

export interface NestAdapterOptions {
  /** Optional override for the module name (default: "server"). */
  moduleName?: string;
}

const createNestAdapter = (options: NestAdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "server";
  return {
    name: "nestjs",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        return NESTJS_PKG_HINTS.some((hint) => hint in deps);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanNestServer(modulePath);
      return {
        name: moduleName,
        root: modulePath,
        kind: "backend",
        symbols: flattenToSymbols(raw),
      raw: raw as ScanRaw,
      };
    },
  };
};

export default createNestAdapter;
export { createNestAdapter };
export type { TsFileInfo };
