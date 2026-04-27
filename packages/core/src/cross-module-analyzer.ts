/**
 * cross-module-analyzer.ts — 跨模块关联分析
 *
 * 分析前端 apiFiles 中的 API 调用，与后端路由做路径匹配，
 * 建立"后端路由 ↔ 前端调用者"的关联关系。
 *
 * 第二期 OAG 核心能力之一。
 */
import type {
  ScanResult,
  TsFileInfo,
  CrossModuleRelation,
} from "./types.js";

// ─── 路由路径匹配 ─────────────────────────────────────────────────────────────

/**
 * 将路由路径转换为正则表达式（支持 :param 和 * 通配符）
 * 例如：/api/users/:id → /^\/api\/users\/[^/]+$/
 */
const routeToRegex = (routePath: string): RegExp => {
  const escaped = routePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // 转义特殊字符（保留 /）
    .replace(/:[\w]+/g, "[^/]+") // :param → [^/]+
    .replace(/\*/g, ".*"); // * → .*
  return new RegExp(`^${escaped}$`);
};

/**
 * 检查前端 URL 是否匹配后端路由模式
 */
const matchRoute = (backendRoute: string, frontendUrl: string): boolean => {
  // 精确匹配
  if (backendRoute === frontendUrl) return true;

  // 模糊匹配（去掉查询参数）
  const cleanUrl = frontendUrl.split("?")[0]!.split("#")[0]!;

  try {
    const regex = routeToRegex(backendRoute);
    return regex.test(cleanUrl);
  } catch {
    return false;
  }
};

// ─── 从前端文件提取 API 调用 URL ──────────────────────────────────────────────

export interface ApiCallInfo {
  /** 调用的 URL，如 "/api/users" 或 `/api/${id}` */
  url: string;
  /** 调用表达式，如 api.getUsers() */
  callExpr: string;
  /** 是否为模板字符串（含变量） */
  isDynamic: boolean;
}

/**
 * 从文件内容中提取 API 调用 URL（供 adapter 扫描时使用）
 *
 * 支持以下模式：
 *   - fetch("/api/users")
 *   - axios.get("/api/users")
 *   - api.get("/api/users")
 *   - const URL = "/api/users"
 *   - baseURL + "/users"
 *   - 模板字符串：`/api/users/${id}`
 */
export const extractApiUrls = (content: string, fileName: string): ApiCallInfo[] => {
  const results: ApiCallInfo[] = [];
  const seen = new Set<string>();

  const addUrl = (url: string, callExpr: string, isDynamic = false): void => {
    const key = `${url}:${callExpr}`;
    if (!seen.has(key) && url.startsWith("/")) {
      seen.add(key);
      results.push({ url, callExpr, isDynamic });
    }
  };

  // 1. 字符串字面量 URL（单引号/双引号）
  const stringUrlRe =
    /(?:fetch|axios\.(?:get|post|put|patch|delete|request)|api\.(?:get|post|put|patch|delete))\s*\(\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(stringUrlRe)) {
    addUrl(m[1]!, m[0]!.split("(")[0]!.trim());
  }

  // 2. 模板字符串 URL
  const templateUrlRe =
    /(?:fetch|axios\.(?:get|post|put|patch|delete|request)|api\.(?:get|post|put|patch|delete))\s*\(\s*`([^`]+)`/g;
  for (const m of content.matchAll(templateUrlRe)) {
    const rawUrl = m[1]!;
    // 将模板变量替换为 :param 形式
    const normalizedUrl = rawUrl.replace(/\$\{[^}]+\}/g, ":param");
    if (normalizedUrl.startsWith("/")) {
      addUrl(normalizedUrl, m[0]!.split("(")[0]!.trim(), true);
    }
  }

  // 3. URL 常量定义
  const urlConstRe =
    /(?:const|let|var)\s+\w*[Uu][Rr][Ll]\w*\s*=\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(urlConstRe)) {
    addUrl(m[1]!, `${fileName}:urlConst`);
  }

  // 4. 对象属性中的 URL（如 { url: "/api/users" }）
  const objUrlRe = /url\s*:\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(objUrlRe)) {
    addUrl(m[1]!, `${fileName}:urlProp`);
  }

  return results;
};

// ─── 提取后端路由 ─────────────────────────────────────────────────────────────

interface BackendRouteInfo {
  /** 完整路由路径，如 /api/users/:id */
  path: string;
  /** HTTP 方法 */
  method: string;
  /** 所在文件 */
  file: string;
  /** 所属模块 */
  module: string;
}

const extractBackendRoutes = (
  scanResult: ScanResult,
): BackendRouteInfo[] => {
  const routes: BackendRouteInfo[] = [];

  for (const module of scanResult.modules) {
    const raw = module.raw;
    if (!raw) continue;

    if (raw.framework === "koa" || raw.framework === "express") {
      for (const routeFile of raw.routes) {
        for (const endpoint of routeFile.endpoints) {
          routes.push({
            path: endpoint.path,
            method: endpoint.method,
            file: routeFile.relPath,
            module: module.name,
          });
        }
      }
    }

    if (raw.framework === "nestjs") {
      for (const controller of raw.controllers) {
        const prefix = controller.prefix ? `/${controller.prefix}` : "";
        for (const endpoint of controller.endpoints) {
          const fullPath = `${prefix}${endpoint.path.startsWith("/") ? endpoint.path : `/${endpoint.path}`}`;
          routes.push({
            path: fullPath,
            method: endpoint.method,
            file: controller.relPath,
            module: module.name,
          });
        }
      }
    }
  }

  return routes;
};

// ─── 提取前端 API 调用 ────────────────────────────────────────────────────────

interface FrontendApiCall {
  url: string;
  callExpr: string;
  isDynamic: boolean;
  file: string;
  component: string;
  module: string;
}

const extractFrontendApiCalls = (
  scanResult: ScanResult,
): FrontendApiCall[] => {
  const calls: FrontendApiCall[] = [];

  for (const module of scanResult.modules) {
    const raw = module.raw;
    if (!raw) continue;

    // 收集需要扫描的文件列表
    const filesToScan: Array<{ file: TsFileInfo; component: string }> = [];

    if (raw.framework === "react") {
      for (const page of raw.pages) {
        filesToScan.push({
          file: page as TsFileInfo,
          component: (page as { name?: string }).name ?? "unknown",
        });
      }
      for (const apiFile of raw.apiFiles) {
        filesToScan.push({ file: apiFile, component: apiFile.file });
      }
    }

    if (raw.framework === "vue3") {
      for (const view of raw.views) {
        filesToScan.push({ file: view, component: view.name });
      }
      for (const apiFile of raw.apiFiles) {
        filesToScan.push({ file: apiFile, component: apiFile.file });
      }
    }

    if (raw.framework === "vue2") {
      for (const view of raw.views) {
        filesToScan.push({ file: view, component: view.name });
      }
      for (const apiFile of raw.apiFiles) {
        filesToScan.push({ file: apiFile, component: apiFile.file });
      }
    }

    // 从 extras 中提取 API URL（由适配器扫描时填充）
    for (const { file, component } of filesToScan) {
      const extras = (file as TsFileInfo & { extras?: Record<string, unknown> }).extras;
      const apiUrls = extras?.["apiUrls"] as string[] | undefined;

      if (apiUrls) {
        for (const url of apiUrls) {
          calls.push({
            url,
            callExpr: `${component}:apiCall`,
            isDynamic: url.includes(":"),
            file: file.relPath ?? file.file,
            component,
            module: module.name,
          });
        }
      }

      // 从 apiCalls 字段提取（React/Vue 页面扫描时已提取）
      const apiCalls = (file as { apiCalls?: string[] }).apiCalls;
      if (apiCalls) {
        for (const call of apiCalls) {
          // api.getUsers → 尝试推断 URL（启发式）
          const inferredUrl = inferUrlFromApiCall(call);
          if (inferredUrl) {
            calls.push({
              url: inferredUrl,
              callExpr: call,
              isDynamic: false,
              file: file.relPath ?? file.file,
              component,
              module: module.name,
            });
          }
        }
      }
    }
  }

  return calls;
};

/**
 * 从 API 调用名称推断 URL（启发式）
 * 例如：getUsers → /api/users, createUser → /api/users, getUserById → /api/users/:id
 */
const inferUrlFromApiCall = (callName: string): string | null => {
  // 去掉常见前缀
  const clean = callName
    .replace(/^(get|fetch|load|create|update|delete|remove|post|put|patch)/, "")
    .replace(/^(All|List|By\w+|One|Many)/, "");

  if (!clean) return null;

  // 驼峰转路径
  const path = clean
    .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
    .replace(/^-/, "")
    .replace(/-+/g, "-");

  if (!path || path.length < 2) return null;

  return `/api/${path}`;
};

// ─── 主分析函数 ───────────────────────────────────────────────────────────────

/**
 * 分析跨模块关联：后端路由 ↔ 前端调用者
 */
export const analyzeCrossModuleRelations = (
  scanResult: ScanResult,
  options: {
    /** 过滤指定后端路由 */
    apiRoute?: string;
    /** 过滤指定前端文件 */
    frontendFile?: string;
  } = {},
): CrossModuleRelation[] => {
  const backendRoutes = extractBackendRoutes(scanResult);
  const frontendCalls = extractFrontendApiCalls(scanResult);

  if (backendRoutes.length === 0 || frontendCalls.length === 0) {
    return [];
  }

  // 按后端路由分组
  const relationMap = new Map<string, CrossModuleRelation>();

  for (const route of backendRoutes) {
    // 路由过滤
    if (options.apiRoute && !matchRoute(route.path, options.apiRoute) && !matchRoute(options.apiRoute, route.path)) {
      continue;
    }

    const key = `${route.method.toUpperCase()}:${route.path}`;
    if (!relationMap.has(key)) {
      relationMap.set(key, {
        backendRoute: route.path,
        backendFile: route.file,
        backendModule: route.module,
        frontendCallers: [],
      });
    }

    const relation = relationMap.get(key)!;

    // 匹配前端调用
    for (const call of frontendCalls) {
      // 前端文件过滤
      if (options.frontendFile && !call.file.includes(options.frontendFile)) {
        continue;
      }

      if (matchRoute(route.path, call.url)) {
        // 避免重复
        const alreadyAdded = relation.frontendCallers.some(
          (c) => c.file === call.file && c.apiCall === call.callExpr,
        );
        if (!alreadyAdded) {
          relation.frontendCallers.push({
            file: call.file,
            component: call.component,
            apiCall: call.callExpr,
            module: call.module,
          });
        }
      }
    }
  }

  // 如果指定了前端文件过滤，只返回有匹配的路由
  return [...relationMap.values()].filter(
    (r) => !options.frontendFile || r.frontendCallers.length > 0,
  );
};

/**
 * 按前端文件查询：该文件调用了哪些后端路由
 */
export const findRoutesCalledByFile = (
  scanResult: ScanResult,
  frontendFile: string,
): CrossModuleRelation[] => {
  return analyzeCrossModuleRelations(scanResult, { frontendFile });
};

/**
 * 按后端路由查询：哪些前端文件调用了该路由
 */
export const findCallersByRoute = (
  scanResult: ScanResult,
  apiRoute: string,
): CrossModuleRelation[] => {
  return analyzeCrossModuleRelations(scanResult, { apiRoute });
};
