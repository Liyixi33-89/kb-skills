/**
 * @kb-skills/adapter-koa — Scan adapter for Koa + Mongoose backends.
 *
 * Ported from `scan_project.py` (functions scan_server / scan_koa_route /
 * scan_mongoose_model / scan_koa_service / scan_koa_middleware).
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
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
  scanMongooseModel,
  scanDrizzleSchemas,
  type KoaEndpoint,
  type KoaMiddlewareFile,
  type KoaRaw,
  type KoaRouteFile,
  type KoaServiceFile,
  type ModuleInfo,
  type OrmKind,
  type ScanAdapter,
  type SymbolInfo,
  type TsFileInfo,
} from "@kb-skills/core";

export interface KoaAdapterOptions {
  /** Optional override for the module name (default: "server"). */
  moduleName?: string;
}

const KOA_PKG_HINTS = ["koa", "@koa/router", "koa-router", "koa-body"];

// ─── route scanner ──────────────────────────────────────────────────────

const scanKoaRoute = async (file: string): Promise<KoaRouteFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const endpoints: KoaEndpoint[] = [];
  const re =
    /router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi;
  for (const m of content.matchAll(re)) {
    const method = m[1]!.toUpperCase();
    const pathStr = m[2]!;
    // find current line to detect inline middlewares
    const lineStart = content.lastIndexOf("\n", m.index!) + 1;
    const lineEndRaw = content.indexOf("\n", m.index! + m[0].length);
    const lineEnd = lineEndRaw > 0 ? lineEndRaw : content.length;
    const line = content.slice(lineStart, lineEnd);
    const middlewares: string[] = [];
    for (const mw of line.matchAll(/(requireAuth|requireAdmin|requireRole)/g)) {
      middlewares.push(mw[1]!);
    }
    endpoints.push({ method, path: pathStr, middlewares });
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    endpoints,
  };
};

// ─── service scanner ────────────────────────────────────────────────────

const scanKoaService = async (file: string): Promise<KoaServiceFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const exports: string[] = [];
  const deps = { models: [] as string[], services: [] as string[], external: [] as string[] };

  const importRe =
    /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g;
  for (const m of content.matchAll(importRe)) {
    const source = m[3]!;
    const names = m[1]
      ? m[1]!.split(",").map((n) => n.trim().split(" as ")[0]!.trim()).filter(Boolean)
      : m[2]
        ? [m[2]!]
        : [];
    if (/(^|\/)models\//.test(source)) deps.models.push(...names);
    else if (/(^|\/)services\//.test(source)) deps.services.push(...names);
    else if (!source.startsWith(".")) deps.external.push(source);
  }

  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) {
    exports.push(m[1]!);
  }
  for (const m of content.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g)) {
    exports.push(m[1]!);
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    exports,
    dependencies: deps,
  };
};

// ─── middleware scanner ─────────────────────────────────────────────────

const scanKoaMiddleware = async (file: string): Promise<KoaMiddlewareFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  const exports: string[] = [];
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) {
    exports.push(m[1]!);
  }

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    exports,
  };
};

// ─── main scan ──────────────────────────────────────────────────────────

const scanServer = async (serverRoot: string): Promise<KoaRaw> => {
  const src = path.join(serverRoot, "src");
  const deps = await readDepsFromPackageJson(serverRoot);
  const orm: OrmKind = detectOrm(deps) ?? "mongoose";

  const raw: KoaRaw = {
    framework: "koa",
    orm,
    routes: [],
    models: [],
    services: [],
    middleware: [],
    config: [],
    scripts: [],
    db: [],
  };

  // routes
  for (const f of await listFiles(path.join(src, "routes"), [".ts"])) {
    const info = await scanKoaRoute(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.routes.push(info);
    }
  }
  // models — route by ORM
  if (orm === "prisma") {
    raw.models = await scanPrismaSchemaFile(serverRoot);
  } else if (orm === "typeorm") {
    raw.models = await scanTypeormEntities(serverRoot);
  } else if (orm === "sequelize") {
    raw.models = await scanSequelizeModels(serverRoot);
  } else if (orm === "drizzle") {
    raw.models = await scanDrizzleSchemas(serverRoot);
  } else if (orm === "mongoose") {
    for (const f of await listFiles(path.join(src, "models"), [".ts"])) {
      const info = await scanMongooseModel(f);
      if (info) {
        info.relPath = relPosix(serverRoot, f);
        raw.models.push(info);
      }
    }
  }
  // For any ORM not handled above, `raw.models` stays empty — kb-writer
  // still produces a valid skeleton index.
  // services
  for (const f of await listFiles(path.join(src, "services"), [".ts"])) {
    const info = await scanKoaService(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.services.push(info);
    }
  }
  // middleware
  for (const f of await listFiles(path.join(src, "middleware"), [".ts"])) {
    const info = await scanKoaMiddleware(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.middleware.push(info);
    }
  }
  // config
  for (const f of await listFiles(path.join(src, "config"), [".ts"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.config.push(info);
    }
  }
  // scripts
  for (const f of await listFiles(path.join(src, "scripts"), [".ts"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.scripts.push(info);
    }
  }
  // db
  for (const f of await listFiles(path.join(src, "db"), [".ts"])) {
    const info = await scanTsFile(f);
    if (info) {
      info.relPath = relPosix(serverRoot, f);
      raw.db.push(info);
    }
  }
  // entry
  const entryFile = path.join(src, "index.ts");
  const entryInfo = await scanTsFile(entryFile);
  if (entryInfo) {
    entryInfo.relPath = "src/index.ts";
    raw.entry = entryInfo;
  }

  return raw;
};

const flattenToSymbols = (raw: KoaRaw): SymbolInfo[] => {
  const symbols: SymbolInfo[] = [];
  for (const r of raw.routes) {
    for (const e of r.endpoints) {
      symbols.push({
        kind: "route",
        name: `${e.method} ${e.path}`,
        file: r.relPath,
        exported: true,
        framework: "koa",
        extras: { middlewares: e.middlewares, routeFile: r.name },
      });
    }
  }
  for (const m of raw.models) {
    symbols.push({
      kind: "model",
      name: m.modelName ?? m.name,
      file: m.relPath,
      exported: true,
      framework: "koa",
    });
  }
  for (const s of raw.services) {
    for (const exp of s.exports) {
      symbols.push({
        kind: "service",
        name: exp,
        file: s.relPath,
        exported: true,
        framework: "koa",
        extras: { serviceFile: s.name },
      });
    }
  }
  for (const mw of raw.middleware) {
    for (const exp of mw.exports) {
      symbols.push({
        kind: "middleware",
        name: exp,
        file: mw.relPath,
        exported: true,
        framework: "koa",
      });
    }
  }
  return symbols;
};

const createKoaAdapter = (options: KoaAdapterOptions = {}): ScanAdapter => {
  const moduleName = options.moduleName ?? "server";
  return {
    name: "koa",

    async detect(projectRoot: string): Promise<boolean> {
      try {
        const pkg = JSON.parse(
          await readFile(path.join(projectRoot, "package.json"), "utf8"),
        ) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        return KOA_PKG_HINTS.some((hint) => hint in deps);
      } catch {
        return false;
      }
    },

    async scan(modulePath: string): Promise<ModuleInfo> {
      const raw = await scanServer(modulePath);
      return {
        name: moduleName,
        root: modulePath,
        kind: "backend",
        symbols: flattenToSymbols(raw),
        raw,
      };
    },
  };
};

export default createKoaAdapter;
export { createKoaAdapter };
// Re-export type for convenience.
export type { TsFileInfo };