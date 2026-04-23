/**
 * KB Skills VSCode Extension — Type definitions
 */

import type { SymbolKind, ModuleKind } from "@kb-skills/core";

// ─── Tree node discriminated union ───────────────────────────────────────────

export type NodeKind = "module" | "group" | "symbol" | "loading" | "error" | "empty";

export interface ModuleNode {
  kind: "module";
  id: string;
  name: string;
  moduleKind: ModuleKind;
  framework: string;
  root: string;
  symbolCount: number;
}

export interface GroupNode {
  kind: "group";
  id: string;
  moduleId: string;
  symbolKind: SymbolKind;
  label: string;
  count: number;
}

export interface SymbolNode {
  kind: "symbol";
  id: string;
  moduleId: string;
  symbolKind: SymbolKind;
  name: string;
  /** Absolute file path */
  file: string;
  /** Relative path for display */
  relPath: string;
  framework: string;
  signature?: string;
  extras?: Record<string, unknown>;
}

export interface LoadingNode {
  kind: "loading";
  id: string;
  label: string;
}

export interface ErrorNode {
  kind: "error";
  id: string;
  message: string;
}

export interface EmptyNode {
  kind: "empty";
  id: string;
  label: string;
}

export type KbTreeNode =
  | ModuleNode
  | GroupNode
  | SymbolNode
  | LoadingNode
  | ErrorNode
  | EmptyNode;

// ─── Scan result cache ────────────────────────────────────────────────────────

export interface ScannedModule {
  name: string;
  root: string;
  kind: ModuleKind;
  framework: string;
  symbols: Array<{
    kind: SymbolKind;
    name: string;
    file: string;
    signature?: string;
    exported: boolean;
    framework: string;
    extras?: Record<string, unknown>;
  }>;
}

export interface ScanCache {
  scannedAt: string;
  projectRoot: string;
  modules: ScannedModule[];
}
