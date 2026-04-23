/**
 * KB Skills VSCode Extension — TreeDataProvider
 *
 * Tree structure:
 *   📦 server (Koa · backend · 42 symbols)
 *     ├── 🔀 路由 (12)
 *     │     ├── GET /api/users          → src/routes/user.ts
 *     │     └── POST /api/users         → src/routes/user.ts
 *     ├── ⚙ 服务 (8)
 *     └── 🗄 数据模型 (5)
 *   🖥 web (React · frontend · 28 symbols)
 *     ├── 📄 页面 (6)
 *     └── 🧩 组件 (14)
 */

import * as vscode from "vscode";
import * as path from "path";
import type { SymbolKind } from "@kb-skills/core";
import type {
  KbTreeNode,
  ModuleNode,
  GroupNode,
  SymbolNode,
  ScanCache,
  ScannedModule,
} from "./types";
import {
  getSymbolIcon,
  getSymbolLabel,
  getModuleIcon,
  getFrameworkName,
  sortSymbolKinds,
  toRelPath,
} from "./utils";

// ─── TreeItem ─────────────────────────────────────────────────────────────────

export class KbTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: KbTreeNode,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(KbTreeItem.getLabel(node), collapsibleState);
    this.contextValue = node.kind;
    this.tooltip = KbTreeItem.getTooltip(node);
    this.iconPath = KbTreeItem.getIcon(node);
    this.description = KbTreeItem.getDescription(node);

    if (node.kind === "symbol") {
      this.command = {
        command: "kbSkills.openFile",
        title: "打开文件",
        arguments: [node.file, node.name],
      };
      this.resourceUri = vscode.Uri.file(node.file);
    }

    if (node.kind === "error") {
      this.iconPath = new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("errorForeground"),
      );
    }

    if (node.kind === "loading") {
      this.iconPath = new vscode.ThemeIcon("loading~spin");
    }
  }

  private static getLabel(node: KbTreeNode): string {
    switch (node.kind) {
      case "module":
        return node.name;
      case "group":
        return `${getSymbolLabel(node.symbolKind)}`;
      case "symbol":
        return node.name;
      case "loading":
        return node.label;
      case "error":
        return "扫描失败";
      case "empty":
        return node.label;
    }
  }

  private static getDescription(node: KbTreeNode): string | undefined {
    switch (node.kind) {
      case "module":
        return `${getFrameworkName(node.framework)} · ${node.moduleKind === "backend" ? "后端" : "前端"} · ${node.symbolCount} 个符号`;
      case "group":
        return `${node.count}`;
      case "symbol":
        return node.relPath;
      default:
        return undefined;
    }
  }

  private static getTooltip(
    node: KbTreeNode,
  ): string | vscode.MarkdownString | undefined {
    switch (node.kind) {
      case "module": {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${node.name}**\n\n`);
        md.appendMarkdown(`- 框架: \`${getFrameworkName(node.framework)}\`\n`);
        md.appendMarkdown(`- 类型: ${node.moduleKind === "backend" ? "后端" : "前端"}\n`);
        md.appendMarkdown(`- 路径: \`${node.root}\`\n`);
        md.appendMarkdown(`- 符号数: ${node.symbolCount}\n`);
        return md;
      }
      case "group":
        return `${getSymbolLabel(node.symbolKind)} — 共 ${node.count} 个`;
      case "symbol": {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${node.name}**\n\n`);
        md.appendMarkdown(`- 类型: \`${node.symbolKind}\`\n`);
        md.appendMarkdown(`- 文件: \`${node.relPath}\`\n`);
        if (node.signature) {
          md.appendMarkdown(`\n\`\`\`typescript\n${node.signature}\n\`\`\``);
        }
        if (node.extras && Object.keys(node.extras).length > 0) {
          const extrasStr = JSON.stringify(node.extras, null, 2);
          md.appendMarkdown(`\n\`\`\`json\n${extrasStr}\n\`\`\``);
        }
        return md;
      }
      case "error":
        return node.message;
      default:
        return undefined;
    }
  }

  private static getIcon(
    node: KbTreeNode,
  ): vscode.ThemeIcon | vscode.Uri | undefined {
    switch (node.kind) {
      case "module":
        return getModuleIcon(node.moduleKind, node.framework);
      case "group":
        return getSymbolIcon(node.symbolKind);
      case "symbol":
        return getSymbolIcon(node.symbolKind);
      case "empty":
        return new vscode.ThemeIcon("info");
      default:
        return undefined;
    }
  }
}

// ─── TreeDataProvider ─────────────────────────────────────────────────────────

export class KbSkillsProvider
  implements vscode.TreeDataProvider<KbTreeNode>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<KbTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cache: ScanCache | null = null;
  private isLoading = false;
  private loadError: string | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  setLoading(): void {
    this.isLoading = true;
    this.loadError = null;
    this._onDidChangeTreeData.fire();
  }

  setCache(cache: ScanCache): void {
    this.cache = cache;
    this.isLoading = false;
    this.loadError = null;
    this._onDidChangeTreeData.fire();
  }

  setError(message: string): void {
    this.loadError = message;
    this.isLoading = false;
    this._onDidChangeTreeData.fire();
  }

  clearCache(): void {
    this.cache = null;
    this.isLoading = false;
    this.loadError = null;
    this._onDidChangeTreeData.fire();
  }

  getScannedAt(): string | null {
    return this.cache?.scannedAt ?? null;
  }

  // ─── TreeDataProvider impl ───────────────────────────────────────────────────

  getTreeItem(element: KbTreeNode): vscode.TreeItem {
    const collapsible =
      element.kind === "module" || element.kind === "group"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    // Auto-expand modules if only one module
    const autoExpand =
      element.kind === "module" &&
      (this.cache?.modules.length ?? 0) === 1;

    return new KbTreeItem(
      element,
      autoExpand
        ? vscode.TreeItemCollapsibleState.Expanded
        : collapsible,
    );
  }

  getChildren(element?: KbTreeNode): KbTreeNode[] {
    // Root level
    if (!element) return this.getRootNodes();

    if (element.kind === "module") return this.getGroupNodes(element);
    if (element.kind === "group") return this.getSymbolNodes(element);

    return [];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getRootNodes(): KbTreeNode[] {
    if (this.isLoading) {
      return [{ kind: "loading", id: "loading", label: "正在扫描项目..." }];
    }

    if (this.loadError) {
      return [{ kind: "error", id: "error", message: this.loadError }];
    }

    if (!this.cache || this.cache.modules.length === 0) {
      return [
        {
          kind: "empty",
          id: "empty",
          label: "未找到模块，请先运行扫描",
        },
      ];
    }

    return this.cache.modules.map((mod): ModuleNode => ({
      kind: "module",
      id: `module:${mod.name}`,
      name: mod.name,
      moduleKind: mod.kind,
      framework: mod.framework,
      root: mod.root,
      symbolCount: mod.symbols.length,
    }));
  }

  private getGroupNodes(moduleNode: ModuleNode): KbTreeNode[] {
    const mod = this.findModule(moduleNode.name);
    if (!mod) return [];

    // Collect unique symbol kinds
    const kindSet = new Set<SymbolKind>();
    for (const sym of mod.symbols) kindSet.add(sym.kind);

    if (kindSet.size === 0) {
      return [{ kind: "empty", id: `${moduleNode.id}:empty`, label: "无符号" }];
    }

    const sortedKinds = sortSymbolKinds([...kindSet]);

    return sortedKinds.map((symbolKind): GroupNode => {
      const count = mod.symbols.filter((s) => s.kind === symbolKind).length;
      return {
        kind: "group",
        id: `group:${moduleNode.name}:${symbolKind}`,
        moduleId: moduleNode.name,
        symbolKind,
        label: getSymbolLabel(symbolKind),
        count,
      };
    });
  }

  private getSymbolNodes(groupNode: GroupNode): KbTreeNode[] {
    const mod = this.findModule(groupNode.moduleId);
    if (!mod) return [];

    const symbols = mod.symbols.filter((s) => s.kind === groupNode.symbolKind);

    return symbols.map((sym, idx): SymbolNode => {
      // sym.file 可能是绝对路径，也可能是相对路径（相对于 mod.root）
      const absoluteFile = path.isAbsolute(sym.file)
        ? sym.file
        : path.join(mod.root, sym.file);
      const relPath = toRelPath(absoluteFile, mod.root);

      return {
        kind: "symbol",
        id: `symbol:${groupNode.moduleId}:${groupNode.symbolKind}:${idx}`,
        moduleId: groupNode.moduleId,
        symbolKind: sym.kind,
        name: sym.name,
        file: absoluteFile,   // ← 始终存绝对路径，供 openFile 命令使用
        relPath,
        framework: sym.framework,
        signature: sym.signature,
        extras: sym.extras,
      };
    });
  }

  private findModule(name: string): ScannedModule | undefined {
    return this.cache?.modules.find((m) => m.name === name);
  }
}
