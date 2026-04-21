/**
 * Lightweight parser for Prisma schema files.
 *
 * We intentionally avoid depending on `@prisma/internals` (heavy + unstable)
 * and instead do a focused regex parse that covers the 95% case of a
 * real-world `prisma/schema.prisma`:
 *
 *   - `model X { ... }` blocks (nested `{}` tracked via depth counter)
 *   - scalar fields with modifiers: `@id`, `@unique`, `@default(...)`,
 *     `@db.VarChar(n)`, `@db.Decimal(p, s)`, `@map("col_name")`
 *   - relation fields (foreign keys) via `@relation(fields: [fk], references: [pk])`
 *   - table remapping via `@@map("table_name")`
 *
 * Unsupported on purpose: `enum`, `view`, `type`, `generator`, `datasource`.
 * These are silently skipped — `kb-writer` does not render them today.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { KoaModelFile, ModelField, ModelFieldRelation } from "../../types";

const PRISMA_SCALAR_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Boolean",
  "DateTime",
  "Float",
  "Decimal",
  "Json",
  "Bytes",
]);

interface ParsedField {
  field: ModelField;
}

/**
 * Parse a single line inside a `model {}` body into a ModelField.
 * Returns `null` for comments, blank lines, and block-level `@@` directives.
 */
const parseFieldLine = (line: string): ParsedField | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("@@")) return null;

  const headMatch = trimmed.match(/^(\w+)\s+(\S+)(.*)$/);
  if (!headMatch) return null;
  const [, name, rawType, rest = ""] = headMatch;
  if (!name || !rawType) return null;

  const isList = rawType.endsWith("[]");
  const isOptional = rawType.endsWith("?");
  const baseType = rawType.replace(/[?\[\]]/g, "");

  const isScalar = PRISMA_SCALAR_TYPES.has(baseType);
  const isRelation = !isScalar && /^[A-Z]/.test(baseType);

  const field: ModelField = {
    name,
    type: baseType,
  };

  if (isScalar) {
    field.nullable = isOptional;
  }

  // @id → primary key
  if (/\s@id(?:\b|$)/.test(rest) || /^@id(?:\b|$)/.test(rest.trim())) {
    field.primary = true;
  }

  // @unique
  if (/\s@unique(?:\b|$)/.test(rest) || /^@unique(?:\b|$)/.test(rest.trim())) {
    field.unique = true;
  }

  // @default(...)  — walk the matching parens so `autoincrement()` works.
  const defaultIdx = rest.indexOf("@default(");
  if (defaultIdx >= 0) {
    const start = defaultIdx + "@default(".length;
    let depth = 1;
    let pos = start;
    while (pos < rest.length && depth > 0) {
      const ch = rest[pos]!;
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0) break;
      pos++;
    }
    const raw = rest.slice(start, pos).trim();
    if (raw === "autoincrement()") {
      field.autoIncrement = true;
    } else if (raw.length > 0) {
      field.default = raw;
    }
  }

  // @db.VarChar(n)
  const varcharMatch = rest.match(/@db\.VarChar\(\s*(\d+)\s*\)/);
  if (varcharMatch) {
    field.length = Number(varcharMatch[1]);
  }

  // @db.Decimal(p, s)
  const decimalMatch = rest.match(/@db\.Decimal\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (decimalMatch) {
    field.precision = Number(decimalMatch[1]);
    field.scale = Number(decimalMatch[2]);
  }

  // @map("column_name")
  const mapMatch = rest.match(/@map\(\s*["']([^"']+)["']\s*\)/);
  if (mapMatch) {
    field.columnName = mapMatch[1];
  }

  // @relation(fields: [fk], references: [pk])
  if (isRelation) {
    const relation: ModelFieldRelation = {
      kind: isList ? "one-to-many" : "many-to-one",
      target: baseType,
    };
    const relMatch = rest.match(
      /@relation\s*\([^)]*fields\s*:\s*\[\s*([^\]]+)\s*\][^)]*\)/,
    );
    if (relMatch) {
      const fk = relMatch[1]!.split(",")[0]!.trim();
      if (fk) relation.foreignKey = fk;
    }
    field.relation = relation;
  }

  return { field };
};

interface ParsedModel {
  name: string;
  fields: ModelField[];
  tableName?: string;
}

/** Parse a full `model { ... }` block body (between the outer braces). */
const parseModelBody = (modelName: string, body: string): ParsedModel => {
  const fields: ModelField[] = [];
  let tableName: string | undefined;

  for (const line of body.split("\n")) {
    const mapMatch = line.match(/@@map\(\s*["']([^"']+)["']\s*\)/);
    if (mapMatch) {
      tableName = mapMatch[1];
      continue;
    }
    const parsed = parseFieldLine(line);
    if (parsed) fields.push(parsed.field);
  }

  return { name: modelName, fields, tableName };
};

/**
 * Walk the full schema text and yield every `model X { ... }` block body.
 * Handles nested `{}` (e.g. inside `@default({})`) via a depth counter.
 */
const extractModelBlocks = (content: string): Array<{ name: string; body: string }> => {
  const blocks: Array<{ name: string; body: string }> = [];
  const re = /\bmodel\s+(\w+)\s*\{/g;
  for (const m of content.matchAll(re)) {
    const name = m[1]!;
    const bodyStart = m.index! + m[0].length;
    let depth = 1;
    let pos = bodyStart;
    while (pos < content.length && depth > 0) {
      const ch = content[pos]!;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth === 0) break;
      pos++;
    }
    blocks.push({ name, body: content.slice(bodyStart, pos) });
  }
  return blocks;
};

/**
 * Parse a Prisma schema text into our internal `KoaModelFile[]` shape.
 *
 * @param content   Full text of `schema.prisma`.
 * @param relPath   Path to embed in each model's `relPath` (for KB rendering).
 */
export const parsePrismaSchema = (content: string, relPath: string): KoaModelFile[] => {
  return extractModelBlocks(content).map(({ name, body }) => {
    const parsed = parseModelBody(name, body);
    const model: KoaModelFile = {
      name: parsed.name,
      relPath,
      modelName: parsed.name,
      orm: "prisma",
      interfaces: [],
      fields: parsed.fields,
    };
    if (parsed.tableName) model.tableName = parsed.tableName;
    return model;
  });
};

/**
 * Read `<serverRoot>/prisma/schema.prisma` (if present) and return parsed
 * models. Returns an empty array when the schema is missing or unreadable.
 *
 * @param serverRoot   Absolute backend module root.
 * @param relPathBase  Optional path prefix used for `model.relPath` (defaults
 *                      to a POSIX-style `"prisma/schema.prisma"`).
 */
export const scanPrismaSchemaFile = async (
  serverRoot: string,
  relPathBase = "prisma/schema.prisma",
): Promise<KoaModelFile[]> => {
  const schemaPath = path.join(serverRoot, "prisma", "schema.prisma");
  try {
    const content = await readFile(schemaPath, "utf8");
    return parsePrismaSchema(content, relPathBase);
  } catch {
    return [];
  }
};
