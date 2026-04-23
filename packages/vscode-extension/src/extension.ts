/**
 * KB Skills VSCode Extension — Entry point
 *
 * Lifecycle:
 *   activate → find config → auto-scan (if enabled) → register commands
 *   deactivate → dispose
 */

import * as vscode from "vscode";
import * as path from "path";
import { KbSkillsProvider } from "./KbSkillsProvider";
import { findConfigFile, scanProject } from "./scanner";
import type { SymbolNode } from "./types";

// ─── State ────────────────────────────────────────────────────────────────────

let provider: KbSkillsProvider;
let statusBarItem: vscode.StatusBarItem;
let scanInProgress = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getProjectRoot = (): string | null => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  return folders[0]!.uri.fsPath;
};

const getConfig = () =>
  vscode.workspace.getConfiguration("kbSkills");

const updateStatusBar = (text: string, tooltip?: string): void => {
  statusBarItem.text = `$(kb-skills-icon) ${text}`;
  statusBarItem.tooltip = tooltip ?? text;
  statusBarItem.show();
};

// ─── Core scan logic ──────────────────────────────────────────────────────────

const runScan = async (): Promise<void> => {
  if (scanInProgress) {
    vscode.window.showInformationMessage("KB Skills: 扫描正在进行中，请稍候...");
    return;
  }

  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    vscode.window.showWarningMessage("KB Skills: 未找到工作区根目录");
    return;
  }

  const configOverride = getConfig().get<string>("configFile") || undefined;
  const configFile = findConfigFile(projectRoot, configOverride);

  if (!configFile) {
    provider.setError(
      "未找到 kb-skills.config.ts\n请先运行 kb-skills init 初始化项目",
    );
    updateStatusBar("$(warning) 未配置", "未找到 kb-skills.config.ts");
    return;
  }

  scanInProgress = true;
  provider.setLoading();
  updateStatusBar("$(loading~spin) 扫描中...");

  try {
    const cache = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "KB Skills",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "正在加载配置..." });

        const result = await scanProject(
          projectRoot,
          configFile,
          (msg) => progress.report({ message: msg }),
        );

        return result;
      },
    );

    provider.setCache(cache);

    const totalSymbols = cache.modules.reduce(
      (sum, m) => sum + m.symbols.length,
      0,
    );
    const moduleCount = cache.modules.length;

    updateStatusBar(
      `$(check) ${moduleCount} 模块 · ${totalSymbols} 符号`,
      `上次扫描: ${new Date(cache.scannedAt).toLocaleString("zh-CN")}`,
    );

    vscode.window.showInformationMessage(
      `KB Skills 扫描完成：${moduleCount} 个模块，${totalSymbols} 个符号`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    provider.setError(message);
    updateStatusBar("$(error) 扫描失败", message);
    vscode.window.showErrorMessage(`KB Skills 扫描失败: ${message}`);
  } finally {
    scanInProgress = false;
  }
};

// ─── Open file command ────────────────────────────────────────────────────────

const handleOpenFile = async (
  filePath: string,
  symbolName?: string,
): Promise<void> => {
  if (!filePath) return;

  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: false,
    });

    // Try to navigate to the symbol definition
    if (symbolName) {
      const text = doc.getText();
      const searchPatterns = [
        // function/const/class declaration
        new RegExp(`(?:export\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${escapeRegex(symbolName)}\\b`),
        // object key
        new RegExp(`\\b${escapeRegex(symbolName)}\\s*[:(]`),
        // route string
        new RegExp(`["']${escapeRegex(symbolName)}["']`),
      ];

      for (const pattern of searchPatterns) {
        const match = pattern.exec(text);
        if (match) {
          const pos = doc.positionAt(match.index);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter,
          );
          break;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`KB Skills: 无法打开文件 — ${message}`);
  }
};

const escapeRegex = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Copy symbol name command ─────────────────────────────────────────────────

const handleCopySymbolName = async (node: unknown): Promise<void> => {
  const symbolNode = node as SymbolNode | undefined;
  if (!symbolNode || symbolNode.kind !== "symbol") return;
  await vscode.env.clipboard.writeText(symbolNode.name);
  vscode.window.showInformationMessage(`已复制: ${symbolNode.name}`);
};

// ─── Refresh command (no re-scan, just re-render) ─────────────────────────────

const handleRefresh = (): void => {
  provider.clearCache();
  void runScan();
};

// ─── Activate ─────────────────────────────────────────────────────────────────

export const activate = (context: vscode.ExtensionContext): void => {
  // Create provider
  provider = new KbSkillsProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView("kbSkillsModules", {
    treeDataProvider: provider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = "kbSkills.scan";
  statusBarItem.text = "$(search) KB Skills";
  statusBarItem.tooltip = "点击扫描项目";
  statusBarItem.show();

  // Register commands
  const commands = [
    vscode.commands.registerCommand("kbSkills.scan", () => void runScan()),
    vscode.commands.registerCommand("kbSkills.refresh", handleRefresh),
    vscode.commands.registerCommand(
      "kbSkills.openFile",
      (filePath: string, symbolName?: string) =>
        void handleOpenFile(filePath, symbolName),
    ),
    vscode.commands.registerCommand(
      "kbSkills.copySymbolName",
      (node: unknown) => void handleCopySymbolName(node),
    ),
  ];

  // Watch for config file changes → auto re-scan
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    "**/kb-skills.config.{ts,mts,js,mjs,cjs}",
  );
  configWatcher.onDidChange(() => {
    vscode.window.showInformationMessage(
      "KB Skills: 配置文件已变更，正在重新扫描...",
    );
    void runScan();
  });
  configWatcher.onDidCreate(() => void runScan());

  // Update tree view title with last scan time
  provider.onDidChangeTreeData(() => {
    const scannedAt = provider.getScannedAt();
    if (scannedAt) {
      treeView.title = `项目模块 (${new Date(scannedAt).toLocaleTimeString("zh-CN")})`;
    }
  });

  context.subscriptions.push(
    treeView,
    statusBarItem,
    configWatcher,
    ...commands,
  );

  // Auto-scan on activation if enabled
  const autoScan = getConfig().get<boolean>("autoScanOnOpen", true);
  if (autoScan) {
    // Delay slightly to let VSCode finish loading
    setTimeout(() => void runScan(), 500);
  }
};

// ─── Deactivate ───────────────────────────────────────────────────────────────

export const deactivate = (): void => {
  statusBarItem?.dispose();
};
