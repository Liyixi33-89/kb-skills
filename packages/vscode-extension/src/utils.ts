/**
 * KB Skills VSCode Extension — Icon & label utilities
 */

import * as vscode from "vscode";
import type { SymbolKind, ModuleKind } from "@kb-skills/core";

// ─── Symbol kind → ThemeIcon ──────────────────────────────────────────────────

const SYMBOL_ICONS: Record<SymbolKind, string> = {
  route: "arrow-right",
  service: "gear",
  model: "database",
  middleware: "filter",
  page: "browser",
  component: "symbol-class",
  store: "archive",
  api: "cloud",
  type: "symbol-interface",
  config: "settings-gear",
};

export const getSymbolIcon = (kind: SymbolKind): vscode.ThemeIcon =>
  new vscode.ThemeIcon(SYMBOL_ICONS[kind] ?? "symbol-misc");

// ─── Symbol kind → Chinese label ─────────────────────────────────────────────

const SYMBOL_LABELS: Record<SymbolKind, string> = {
  route: "路由",
  service: "服务",
  model: "数据模型",
  middleware: "中间件",
  page: "页面",
  component: "组件",
  store: "状态管理",
  api: "API",
  type: "类型定义",
  config: "配置",
};

export const getSymbolLabel = (kind: SymbolKind): string =>
  SYMBOL_LABELS[kind] ?? kind;

// ─── Module kind → icon ───────────────────────────────────────────────────────

export const getModuleIcon = (moduleKind: ModuleKind, framework: string): vscode.ThemeIcon => {
  if (moduleKind === "backend") return new vscode.ThemeIcon("server");
  // frontend icons by framework
  const frameworkIconMap: Record<string, string> = {
    react: "symbol-event",
    "react-native": "device-mobile",
    vue3: "symbol-event",
    vue2: "symbol-event",
    nextjs: "symbol-event",
    nuxt: "symbol-event",
  };
  return new vscode.ThemeIcon(frameworkIconMap[framework] ?? "symbol-event");
};

// ─── Framework display name ───────────────────────────────────────────────────

const FRAMEWORK_NAMES: Record<string, string> = {
  koa: "Koa",
  express: "Express",
  nestjs: "NestJS",
  react: "React",
  "react-native": "React Native",
  vue3: "Vue 3",
  vue2: "Vue 2",
  nextjs: "Next.js",
  nuxt: "Nuxt",
};

export const getFrameworkName = (framework: string): string =>
  FRAMEWORK_NAMES[framework] ?? framework;

// ─── Symbol kind sort order ───────────────────────────────────────────────────

const KIND_ORDER: SymbolKind[] = [
  "route",
  "page",
  "component",
  "service",
  "model",
  "middleware",
  "store",
  "api",
  "type",
  "config",
];

export const sortSymbolKinds = (kinds: SymbolKind[]): SymbolKind[] =>
  [...kinds].sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a);
    const bi = KIND_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

// ─── Relative path helper ─────────────────────────────────────────────────────

export const toRelPath = (absolutePath: string, projectRoot: string): string => {
  if (!absolutePath.startsWith(projectRoot)) return absolutePath;
  return absolutePath.slice(projectRoot.length).replace(/^[\\/]/, "");
};
