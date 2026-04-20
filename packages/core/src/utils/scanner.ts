/**
 * Regex-based lightweight "AST" extractor for TS/TSX/JS/JSX.
 *
 * Ported 1:1 from `agency-agents/apps/skills/doc-code-to-kb/scripts/scan_project.py`
 * (function `scan_ts_file`).
 *
 * We deliberately avoid a real TS compiler here: regex is orders of magnitude
 * faster and has proven good enough for KB generation in practice.
 */
import { readFile } from "node:fs/promises";
import type {
  KoaInterface,
  KoaInterfaceField,
  TsFileInfo,
} from "../types";

const readSafely = async (file: string): Promise<string | null> => {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
};

export const scanTsFile = async (file: string): Promise<TsFileInfo | null> => {
  const content = await readSafely(file);
  if (content === null) return null;

  const info: TsFileInfo = {
    file,
    imports: [],
    exports: [],
    functions: [],
    components: [],
    interfaces: [],
    types: [],
    hooks: [],
    constants: [],
  };

  // ── import ───────────────────────────────────────────────────────────
  const importRe =
    /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g;
  for (const m of content.matchAll(importRe)) {
    const [, namedGroup, defaultImport, source] = m;
    if (namedGroup) {
      const names = namedGroup
        .split(",")
        .map((n) => n.trim().split(" as ")[0]!.trim())
        .filter(Boolean);
      info.imports.push({ names, source: source!, type: "named" });
    }
    if (defaultImport) {
      info.imports.push({ names: [defaultImport], source: source!, type: "default" });
    }
  }

  // ── exports (named) ──────────────────────────────────────────────────
  for (const m of content.matchAll(
    /export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g,
  )) {
    info.exports.push(m[1]!);
  }
  const defaultExport = content.match(
    /export\s+default\s+(?:function\s+)?(\w+)/,
  );
  if (defaultExport) info.exports.push(defaultExport[1]!);

  // ── function / arrow fn names ────────────────────────────────────────
  const fnRe =
    /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\S+\s*)?=>)/g;
  for (const m of content.matchAll(fnRe)) {
    const name = m[1] ?? m[2];
    if (name) info.functions.push(name);
  }

  // ── React components ────────────────────────────────────────────────
  for (const m of content.matchAll(
    /(?:export\s+)?(?:const|function)\s+([A-Z]\w+)/g,
  )) {
    const name = m[1]!;
    if (!info.components.includes(name)) info.components.push(name);
  }

  // ── interfaces ───────────────────────────────────────────────────────
  const ifaceRe =
    /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
  for (const m of content.matchAll(ifaceRe)) {
    const name = m[1]!;
    const start = m.index! + m[0].length;
    let depth = 1;
    let pos = start;
    while (pos < content.length && depth > 0) {
      const ch = content[pos]!;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      pos++;
    }
    const body = content.slice(start, pos - 1);
    const fields: KoaInterfaceField[] = [];
    for (const fm of body.matchAll(/(\w+)(\?)?:\s*([^;\n]+)/g)) {
      fields.push({
        name: fm[1]!,
        optional: Boolean(fm[2]),
        type: fm[3]!.trim().replace(/;$/, ""),
      });
    }
    const iface: KoaInterface = { name, fields };
    info.interfaces.push(iface);
  }

  // ── type aliases ─────────────────────────────────────────────────────
  for (const m of content.matchAll(
    /(?:export\s+)?type\s+(\w+)\s*=\s*([^;\n]+)/g,
  )) {
    info.types.push({ name: m[1]!, value: m[2]!.trim() });
  }

  // ── React hook calls ─────────────────────────────────────────────────
  for (const m of content.matchAll(/(use\w+)\s*\(/g)) {
    const hook = m[1]!;
    if (!info.hooks.includes(hook)) info.hooks.push(hook);
  }

  // ── exported constants (lower-case only) ────────────────────────────
  for (const m of content.matchAll(
    /export\s+const\s+(\w+)\s*(?::\s*\S+\s*)?=\s*(?![\s(])/g,
  )) {
    const name = m[1]!;
    if (name[0]! >= "A" && name[0]! <= "Z") continue;
    if (!info.constants.includes(name)) info.constants.push(name);
  }

  return info;
};

/** Read a file as text, returning null on error. */
export const readText = readSafely;