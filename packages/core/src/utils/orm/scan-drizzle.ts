/**
 * Drizzle ORM schema scanner.
 *
 * Drizzle uses a TypeScript-first, code-as-schema approach. Tables are defined
 * via `pgTable()`, `mysqlTable()`, or `sqliteTable()` calls. We do a focused
 * regex parse that covers the 95% real-world case:
 *
 *   - `export const users = pgTable("users", { ... })`
 *   - Column helpers: `integer`, `text`, `varchar`, `boolean`, `timestamp`,
 *     `serial`, `bigint`, `real`, `numeric`, `json`, `jsonb`, `uuid`, `date`
 *   - `.primaryKey()`, `.notNull()`, `.unique()`, `.default(...)`,
 *     `.references(() => otherTable.id)`
 *
 * Unsupported on purpose: `relations()` helper, `$inferSelect` / `$inferInsert`
 * type inference. These are silently skipped.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { listFiles } from "../fs";
import type { KoaModelFile, ModelField } from "../../types";

const DRIZZLE_TYPE_MAP: Record<string, string> = {
  serial: "Int",
  bigserial: "BigInt",
  integer: "Int",
  int: "Int",
  bigint: "BigInt",
  smallint: "Int",
  real: "Float",
  doublePrecision: "Float",
  numeric: "Decimal",
  decimal: "Decimal",
  text: "String",
  varchar: "String",
  char: "String",
  boolean: "Boolean",
  timestamp: "DateTime",
  timestamptz: "DateTime",
  date: "Date",
  time: "String",
  json: "Json",
  jsonb: "Json",
  uuid: "String",
  bytea: "Bytes",
};

const normaliseType = (raw: string): string =>
  DRIZZLE_TYPE_MAP[raw.toLowerCase()] ?? raw;

// ── Single column line parser ──────────────────────────────────────────────

/**
 * Parse one line inside a `pgTable(...)` column object.
 *
 * Example lines:
 *   `  id: serial("id").primaryKey(),`
 *   `  email: varchar("email", { length: 255 }).notNull().unique(),`
 *   `  userId: integer("user_id").notNull().references(() => users.id),`
 */
const parseColumnLine = (line: string): ModelField | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) return null;

  // `fieldName: columnHelper("col_name", ...)...`
  const headMatch = trimmed.match(/^(\w+)\s*:\s*(\w+)\s*\(/);
  if (!headMatch) return null;

  const [, fieldName, helper] = headMatch;
  if (!fieldName || !helper) return null;

  const field: ModelField = {
    name: fieldName,
    type: normaliseType(helper),
  };

  // .primaryKey()
  if (/\.primaryKey\(\)/.test(trimmed)) field.primary = true;

  // .notNull()  → nullable = false
  if (/\.notNull\(\)/.test(trimmed)) field.nullable = false;

  // .unique()
  if (/\.unique\(\)/.test(trimmed)) field.unique = true;

  // .$defaultFn / .default(...)
  const defaultMatch = trimmed.match(/\.default\s*\(([^)]+)\)/);
  if (defaultMatch) field.default = defaultMatch[1]!.trim();

  // .references(() => table.col)
  const refMatch = trimmed.match(/\.references\s*\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)/);
  if (refMatch) {
    field.relation = {
      kind: "many-to-one",
      target: refMatch[1]!,
      foreignKey: fieldName,
    };
  }

  // varchar / char length: varchar("col", { length: 255 })
  const lengthMatch = trimmed.match(/\{\s*length\s*:\s*(\d+)/);
  if (lengthMatch) field.length = Number(lengthMatch[1]);

  // numeric precision/scale: numeric("col", { precision: 10, scale: 2 })
  const precMatch = trimmed.match(/precision\s*:\s*(\d+)/);
  if (precMatch) field.precision = Number(precMatch[1]);
  const scaleMatch = trimmed.match(/scale\s*:\s*(\d+)/);
  if (scaleMatch) field.scale = Number(scaleMatch[1]);

  // serial / bigserial → autoIncrement
  if (/^(serial|bigserial)$/i.test(helper)) field.autoIncrement = true;

  return field;
};

// ── Table block extractor ──────────────────────────────────────────────────

/**
 * Extract all `pgTable / mysqlTable / sqliteTable` definitions from a
 * TypeScript source string.
 */
export const parseDrizzleSchema = (content: string, relPath: string): KoaModelFile[] => {
  const results: KoaModelFile[] = [];

  // Match: export const <name> = pgTable("<tableName>", {
  const tableRe =
    /export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;

  for (const m of content.matchAll(tableRe)) {
    const exportName = m[1]!;
    const tableName = m[2]!;

    // Walk the column object body (track brace depth)
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
    const body = content.slice(bodyStart, pos);

    const fields: ModelField[] = [];
    for (const line of body.split("\n")) {
      const field = parseColumnLine(line);
      if (field) fields.push(field);
    }

    // Derive a PascalCase model name from the export name (e.g. "users" → "User")
    const modelName =
      exportName.charAt(0).toUpperCase() +
      exportName.slice(1).replace(/s$/, ""); // naive singularise

    results.push({
      name: exportName,
      relPath,
      modelName,
      tableName,
      orm: "drizzle",
      interfaces: [],
      fields,
    });
  }

  return results;
};

/**
 * Scan all `*.ts` files under `<serverRoot>/src/db/schema/` (or
 * `<serverRoot>/src/schema/` as fallback) and return parsed Drizzle models.
 *
 * Returns an empty array when no schema files are found.
 */
export const scanDrizzleSchemas = async (serverRoot: string): Promise<KoaModelFile[]> => {
  const candidates = [
    path.join(serverRoot, "src", "db", "schema"),
    path.join(serverRoot, "src", "schema"),
    path.join(serverRoot, "db", "schema"),
    path.join(serverRoot, "drizzle"),
  ];

  const models: KoaModelFile[] = [];

  for (const dir of candidates) {
    let files: string[];
    try {
      files = await listFiles(dir, [".ts"]);
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const content = await readFile(file, "utf8");
        // Quick guard: only parse files that actually import from drizzle-orm
        if (!content.includes("drizzle-orm") && !content.includes("pgTable") &&
            !content.includes("mysqlTable") && !content.includes("sqliteTable")) {
          continue;
        }
        const relPath = path
          .relative(serverRoot, file)
          .split(path.sep)
          .join("/");
        const parsed = parseDrizzleSchema(content, relPath);
        models.push(...parsed);
      } catch {
        // skip unreadable files
      }
    }
    // Stop at the first directory that yielded results
    if (models.length > 0) break;
  }

  return models;
};
