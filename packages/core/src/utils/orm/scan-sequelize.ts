/**
 * Lightweight parser for Sequelize model files.
 *
 * Sequelize has three very different authoring styles in the wild; this
 * parser supports all of them and normalizes their output into the same
 * `KoaModelFile` shape that Prisma / TypeORM scanners already use.
 *
 * Supported styles:
 *
 *   ① Function-style — classic `sequelize.define`
 *      const User = sequelize.define("User", {
 *        email: { type: DataTypes.STRING, unique: true },
 *        age:   DataTypes.INTEGER,
 *      }, { tableName: "users" });
 *
 *   ② Class-inheritance — `Model.init` (official recommendation)
 *      class User extends Model {}
 *      User.init({
 *        id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
 *        email: { type: DataTypes.STRING(255), unique: true },
 *      }, { sequelize, tableName: "users" });
 *
 *   ③ Decorator-style — `sequelize-typescript`
 *      @Table({ tableName: "users" })
 *      export class User extends Model<User> {
 *        @PrimaryKey @AutoIncrement @Column id!: number;
 *        @Column({ type: DataType.STRING(255), unique: true }) email!: string;
 *      }
 *
 * Field type normalization:
 *   - `DataTypes.STRING` / `DataType.STRING` / bare `STRING` → `"STRING"`
 *   - `DataTypes.STRING(255)` → `{ type: "STRING", length: 255 }`
 *   - `DataTypes.DECIMAL(10, 2)` → `{ type: "DECIMAL", precision: 10, scale: 2 }`
 *
 * Intentionally out of scope: associations (`hasMany`/`belongsTo`) defined
 * in external `associate()` blocks, hooks, scopes, paranoid options.
 */
import path from "node:path";
import { listFiles } from "../fs";
import { readText } from "../scanner";
import type { KoaModelFile, ModelField, ModelFieldRelation } from "../../types";

/** Find the matching closing `}` for an opening `{` at `openIdx`. Returns -1 if unbalanced. */
const matchBrace = (source: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i]!;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
};

/** Find the matching closing `)` for an opening `(` at `openIdx`. */
const matchParen = (source: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
};

/**
 * Split a braced/parenthesized body at top-level commas. Respects nesting of
 * `{ }`, `[ ]`, `( )` and single/double/back-tick string literals. We need
 * this because decorator-option / field-option objects frequently contain
 * inner function calls (e.g. `DataTypes.STRING(255)`) that naive `.split(",")`
 * would destroy.
 */
const splitTopLevelCommas = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let lastCut = 0;
  let inStr: string | null = null;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(lastCut, i));
      lastCut = i + 1;
    }
  }
  const tail = body.slice(lastCut);
  if (tail.trim()) parts.push(tail);
  return parts;
};

/**
 * Parse a Sequelize data type expression into `{ type, length?, precision?, scale? }`.
 *
 * Accepts any of:
 *   - `DataTypes.STRING`
 *   - `DataType.STRING`              (sequelize-typescript)
 *   - `Sequelize.STRING`
 *   - `STRING`                       (destructured import)
 *   - `DataTypes.STRING(255)`
 *   - `DataTypes.DECIMAL(10, 2)`
 */
export interface ParsedSeqType {
  type?: string;
  length?: number;
  precision?: number;
  scale?: number;
}

export const parseSequelizeType = (expr: string): ParsedSeqType => {
  const out: ParsedSeqType = {};
  const trimmed = expr.trim();
  if (!trimmed) return out;

  // Strip the `DataTypes.` / `DataType.` / `Sequelize.` / `db.` prefix.
  const stripped = trimmed.replace(/^(?:DataTypes|DataType|Sequelize|db)\s*\.\s*/, "");

  // Function-call form: `STRING(255)` or `DECIMAL(10, 2)`
  const callMatch = stripped.match(/^([A-Z_][A-Z0-9_]*)\s*\(([^)]*)\)/i);
  if (callMatch) {
    out.type = callMatch[1]!.toUpperCase();
    const args = splitTopLevelCommas(callMatch[2]!).map((s) => s.trim());
    if (args.length === 1 && /^\d+$/.test(args[0]!)) {
      out.length = Number(args[0]);
    } else if (args.length >= 2 && /^\d+$/.test(args[0]!) && /^\d+$/.test(args[1]!)) {
      out.precision = Number(args[0]);
      out.scale = Number(args[1]);
    }
    return out;
  }

  // Bare identifier form: `STRING`, `INTEGER`
  const identMatch = stripped.match(/^([A-Z_][A-Z0-9_]*)/i);
  if (identMatch) {
    out.type = identMatch[1]!.toUpperCase();
  }
  return out;
};

/**
 * Parse a Sequelize field-options object body (the stuff between `{` and `}`)
 * into a `ModelField`. Handles:
 *   - `type: DataTypes.STRING(255)`
 *   - `primaryKey: true`, `autoIncrement: true`
 *   - `unique: true`, `allowNull: false`
 *   - `field: "snake_case_col"`  → `columnName`
 *   - `defaultValue: "x"` / `defaultValue: DataTypes.NOW` → `default`
 *   - `references: { model: "users", key: "id" }` → relation (many-to-one)
 */
const parseFieldOptionsBody = (name: string, body: string): ModelField => {
  const field: ModelField = { name };
  const segments = splitTopLevelCommas(body);

  for (const seg of segments) {
    const m = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.trim().replace(/,\s*$/, "");

    if (key === "type") {
      const parsed = parseSequelizeType(raw);
      if (parsed.type) field.type = parsed.type;
      if (parsed.length !== undefined) field.length = parsed.length;
      if (parsed.precision !== undefined) field.precision = parsed.precision;
      if (parsed.scale !== undefined) field.scale = parsed.scale;
    } else if (key === "primaryKey") {
      if (raw === "true") field.primary = true;
    } else if (key === "autoIncrement") {
      if (raw === "true") field.autoIncrement = true;
    } else if (key === "unique") {
      // `unique: true` or `unique: "some_index_name"`
      if (raw === "true" || /^["'`]/.test(raw)) field.unique = true;
    } else if (key === "allowNull") {
      if (raw === "true") field.nullable = true;
      else if (raw === "false") field.nullable = false;
    } else if (key === "field") {
      const s = raw.match(/^["'`]([^"'`]+)["'`]/);
      if (s) field.columnName = s[1];
    } else if (key === "defaultValue") {
      field.default = raw.replace(/^["'`]|["'`]$/g, "");
    } else if (key === "references") {
      // `references: { model: "users", key: "id" }` — produce many-to-one relation
      const braceStart = raw.indexOf("{");
      if (braceStart >= 0) {
        const braceEnd = matchBrace(raw, braceStart);
        if (braceEnd > braceStart) {
          const refBody = raw.slice(braceStart + 1, braceEnd);
          const modelMatch = refBody.match(/model\s*:\s*["'`]([^"'`]+)["'`]/);
          if (modelMatch) {
            const rel: ModelFieldRelation = {
              kind: "many-to-one",
              target: modelMatch[1]!,
              foreignKey: name,
            };
            field.relation = rel;
          }
        }
      }
    }
  }

  return field;
};

/**
 * Parse the attributes object body — the first arg to `define()` / `init()`.
 *
 * Each top-level key is a field. Its value is either:
 *   - a type expression directly (`DataTypes.STRING`) — shorthand
 *   - an options object `{ type: ..., unique: true, ... }`
 */
const parseAttributesBody = (body: string): ModelField[] => {
  const fields: ModelField[] = [];
  const segments = splitTopLevelCommas(body);

  for (const seg of segments) {
    const m = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
    if (!m) continue;
    const fieldName = m[1]!;
    const rhs = m[2]!.trim().replace(/,\s*$/, "");

    // Options-object shorthand: starts with `{`
    if (rhs.startsWith("{")) {
      const end = matchBrace(rhs, 0);
      if (end < 0) continue;
      fields.push(parseFieldOptionsBody(fieldName, rhs.slice(1, end)));
      continue;
    }

    // Type-expression shorthand: `email: DataTypes.STRING`
    const parsed = parseSequelizeType(rhs);
    const field: ModelField = { name: fieldName };
    if (parsed.type) field.type = parsed.type;
    if (parsed.length !== undefined) field.length = parsed.length;
    if (parsed.precision !== undefined) field.precision = parsed.precision;
    if (parsed.scale !== undefined) field.scale = parsed.scale;
    fields.push(field);
  }

  return fields;
};

/**
 * Extract the tableName / modelName from a Sequelize options object body
 * (the `{ sequelize, tableName: "users", ... }` second argument).
 */
const extractInitOptions = (body: string): { tableName?: string; modelName?: string } => {
  const out: { tableName?: string; modelName?: string } = {};
  const tm = body.match(/tableName\s*:\s*["'`]([^"'`]+)["'`]/);
  if (tm) out.tableName = tm[1];
  const mm = body.match(/modelName\s*:\s*["'`]([^"'`]+)["'`]/);
  if (mm) out.modelName = mm[1];
  return out;
};

// ─── Style ①: sequelize.define("Name", { ... }, { ... }) ────────────────

interface ParsedDefinedModel {
  name: string;
  tableName?: string;
  fields: ModelField[];
}

const extractDefineModels = (source: string): ParsedDefinedModel[] => {
  const out: ParsedDefinedModel[] = [];
  // Match `sequelize.define(` or `db.define(` or any identifier.define(
  const defineRe = /\b([A-Za-z_$][\w$]*)\.define\s*\(/g;
  for (const m of source.matchAll(defineRe)) {
    const openParen = m.index! + m[0].length - 1;
    const closeParen = matchParen(source, openParen);
    if (closeParen < 0) continue;

    const callBody = source.slice(openParen + 1, closeParen);
    const args = splitTopLevelCommas(callBody);
    if (args.length < 2) continue;

    const nameArg = args[0]!.trim();
    const nameMatch = nameArg.match(/^["'`]([^"'`]+)["'`]/);
    if (!nameMatch) continue;
    const modelName = nameMatch[1]!;

    const attrArg = args[1]!.trim();
    if (!attrArg.startsWith("{")) continue;
    const attrEnd = matchBrace(attrArg, 0);
    if (attrEnd < 0) continue;
    const fields = parseAttributesBody(attrArg.slice(1, attrEnd));

    let tableName: string | undefined;
    if (args[2]) {
      const optsArg = args[2]!.trim();
      if (optsArg.startsWith("{")) {
        const optsEnd = matchBrace(optsArg, 0);
        if (optsEnd > 0) {
          const opts = extractInitOptions(optsArg.slice(1, optsEnd));
          tableName = opts.tableName;
        }
      }
    }

    out.push({ name: modelName, tableName, fields });
  }
  return out;
};

// ─── Style ②: class User extends Model {} + User.init({...}, {...}) ─────

const extractInitModels = (source: string): ParsedDefinedModel[] => {
  const out: ParsedDefinedModel[] = [];
  // Match `ClassName.init(`; exclude the `Model.init` base-class call form
  // — real init calls are always on the subclass, never literally on `Model`.
  const initRe = /\b([A-Z][\w$]*)\.init\s*\(/g;
  for (const m of source.matchAll(initRe)) {
    const className = m[1]!;
    if (className === "Model") continue;

    const openParen = m.index! + m[0].length - 1;
    const closeParen = matchParen(source, openParen);
    if (closeParen < 0) continue;

    const callBody = source.slice(openParen + 1, closeParen);
    const args = splitTopLevelCommas(callBody);
    if (args.length < 2) continue;

    const attrArg = args[0]!.trim();
    if (!attrArg.startsWith("{")) continue;
    const attrEnd = matchBrace(attrArg, 0);
    if (attrEnd < 0) continue;
    const fields = parseAttributesBody(attrArg.slice(1, attrEnd));

    let tableName: string | undefined;
    const optsArg = args[1]!.trim();
    if (optsArg.startsWith("{")) {
      const optsEnd = matchBrace(optsArg, 0);
      if (optsEnd > 0) {
        const opts = extractInitOptions(optsArg.slice(1, optsEnd));
        tableName = opts.tableName ?? opts.modelName;
      }
    }

    out.push({ name: className, tableName, fields });
  }
  return out;
};

// ─── Style ③: @Table class X extends Model { @Column ... } ──────────────

interface DecoratorCall {
  name: string;
  args: string;
}

const skipWhitespaceBackwards = (source: string, from: number): number => {
  let i = from;
  while (i > 0) {
    const ch = source[i - 1]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i--;
      continue;
    }
    break;
  }
  return i;
};

const matchParenBackwards = (source: string, closeIdx: number): number => {
  let depth = 1;
  let i = closeIdx - 1;
  while (i >= 0 && depth > 0) {
    const ch = source[i]!;
    if (ch === ")") depth++;
    else if (ch === "(") depth--;
    if (depth === 0) return i;
    i--;
  }
  return -1;
};

const collectDecoratorsBefore = (source: string, position: number): DecoratorCall[] => {
  const decorators: DecoratorCall[] = [];
  let cursor = skipWhitespaceBackwards(source, position);

  while (cursor > 0) {
    const prev = source[cursor - 1]!;

    if (prev === ")") {
      const closeParenIdx = cursor - 1;
      const openParenIdx = matchParenBackwards(source, closeParenIdx);
      if (openParenIdx < 0) break;

      const identEnd = openParenIdx;
      let identStart = identEnd;
      while (identStart > 0 && /[A-Za-z0-9_$]/.test(source[identStart - 1]!)) {
        identStart--;
      }
      if (identStart === identEnd) break;
      if (identStart === 0 || source[identStart - 1] !== "@") break;

      decorators.push({
        name: source.slice(identStart, identEnd),
        args: source.slice(openParenIdx + 1, closeParenIdx),
      });
      cursor = skipWhitespaceBackwards(source, identStart - 1);
      continue;
    }

    if (/[A-Za-z0-9_$]/.test(prev)) {
      const identEnd = cursor;
      let identStart = identEnd;
      while (identStart > 0 && /[A-Za-z0-9_$]/.test(source[identStart - 1]!)) {
        identStart--;
      }
      if (identStart > 0 && source[identStart - 1] === "@") {
        decorators.push({
          name: source.slice(identStart, identEnd),
          args: "",
        });
        cursor = skipWhitespaceBackwards(source, identStart - 1);
        continue;
      }
      break;
    }
    break;
  }

  return decorators.reverse();
};

const extractTableName = (args: string): string | undefined => {
  const trimmed = args.trim();
  if (!trimmed) return undefined;
  const stringMatch = trimmed.match(/^["'`]([^"'`]+)["'`]/);
  if (stringMatch) return stringMatch[1];
  const objMatch = trimmed.match(/tableName\s*:\s*["'`]([^"'`]+)["'`]/);
  if (objMatch) return objMatch[1];
  return undefined;
};

const decoratorsToField = (
  decorators: DecoratorCall[],
  fieldName: string,
  rawType: string,
  isOptional: boolean,
): ModelField | null => {
  const field: ModelField = { name: fieldName };
  const scalarType = rawType.replace(/\s*\|\s*null$/i, "").replace(/[\[\]]/g, "");
  if (scalarType) field.type = scalarType;
  if (isOptional) field.nullable = true;

  let isColumnDecorated = false;

  for (const deco of decorators) {
    if (deco.name === "Column") {
      isColumnDecorated = true;
      if (deco.args.trim()) {
        const argStr = deco.args.trim();
        // `@Column(DataType.STRING(255))` — first arg is a type expression
        if (!argStr.startsWith("{")) {
          const parsed = parseSequelizeType(argStr);
          if (parsed.type) field.type = parsed.type;
          if (parsed.length !== undefined) field.length = parsed.length;
          if (parsed.precision !== undefined) field.precision = parsed.precision;
          if (parsed.scale !== undefined) field.scale = parsed.scale;
        } else {
          // `@Column({ type: DataType.STRING(255), unique: true })`
          const end = matchBrace(argStr, 0);
          if (end > 0) {
            const optField = parseFieldOptionsBody(fieldName, argStr.slice(1, end));
            // Merge option-derived props into our field (name stays the same).
            if (optField.type) field.type = optField.type;
            if (optField.length !== undefined) field.length = optField.length;
            if (optField.precision !== undefined) field.precision = optField.precision;
            if (optField.scale !== undefined) field.scale = optField.scale;
            if (optField.primary) field.primary = true;
            if (optField.autoIncrement) field.autoIncrement = true;
            if (optField.unique) field.unique = true;
            if (optField.nullable !== undefined) field.nullable = optField.nullable;
            if (optField.columnName) field.columnName = optField.columnName;
            if (optField.default !== undefined) field.default = optField.default;
            if (optField.relation) field.relation = optField.relation;
          }
        }
      }
    } else if (deco.name === "PrimaryKey") {
      isColumnDecorated = true;
      field.primary = true;
    } else if (deco.name === "AutoIncrement") {
      field.autoIncrement = true;
    } else if (deco.name === "Unique") {
      field.unique = true;
    } else if (deco.name === "AllowNull") {
      // `@AllowNull(false)` → nullable=false; `@AllowNull` / `@AllowNull(true)` → true
      field.nullable = !/\bfalse\b/.test(deco.args);
    } else if (deco.name === "Default") {
      if (deco.args.trim()) field.default = deco.args.trim().replace(/^["'`]|["'`]$/g, "");
    } else if (deco.name === "ForeignKey") {
      isColumnDecorated = true;
      // `@ForeignKey(() => User)` → many-to-one with current field as FK
      const targetMatch = deco.args.match(/=>\s*(\w+)/);
      if (targetMatch) {
        field.relation = {
          kind: "many-to-one",
          target: targetMatch[1]!,
          foreignKey: fieldName,
        };
      }
    } else if (deco.name === "BelongsTo") {
      const t = deco.args.match(/=>\s*(\w+)/);
      if (t) field.relation = { kind: "many-to-one", target: t[1]! };
    } else if (deco.name === "HasMany") {
      const t = deco.args.match(/=>\s*(\w+)/);
      if (t) field.relation = { kind: "one-to-many", target: t[1]! };
    } else if (deco.name === "HasOne") {
      const t = deco.args.match(/=>\s*(\w+)/);
      if (t) field.relation = { kind: "one-to-one", target: t[1]! };
    } else if (deco.name === "BelongsToMany") {
      const t = deco.args.match(/=>\s*(\w+)/);
      if (t) field.relation = { kind: "many-to-many", target: t[1]! };
    }
  }

  // Relation decorators alone are enough to emit the field — same as TypeORM.
  if (field.relation) return field;
  return isColumnDecorated ? field : null;
};

const extractDecoratedClasses = (source: string): ParsedDefinedModel[] => {
  const out: ParsedDefinedModel[] = [];
  const tableRe = /@Table\s*(\([^)]*\))?\s*(?:export\s+)?class\s+(\w+)/g;

  for (const m of source.matchAll(tableRe)) {
    const tableArgs = m[1] ? m[1].slice(1, -1) : "";
    const className = m[2]!;
    const tableName = extractTableName(tableArgs);

    const afterMatch = m.index! + m[0].length;
    const braceOpen = source.indexOf("{", afterMatch);
    if (braceOpen < 0) continue;
    const braceClose = matchBrace(source, braceOpen);
    if (braceClose < 0) continue;
    const classBody = source.slice(braceOpen + 1, braceClose);

    const fields: ModelField[] = [];
    const fieldRe = /(?:^|\n|\))\s*(\w+)\s*([!?])?\s*:\s*([^;=\n{]+?)\s*(?:;|=|\n)/g;
    for (const fm of classBody.matchAll(fieldRe)) {
      const fieldName = fm[1]!;
      const marker = fm[2];
      const rawType = fm[3]!.trim();
      if (rawType.startsWith("(")) continue;
      if (fieldName === "constructor") continue;

      const nameIdx = fm.index! + fm[0].indexOf(fieldName);
      const decorators = collectDecoratorsBefore(classBody, nameIdx);
      if (decorators.length === 0) continue;

      const field = decoratorsToField(decorators, fieldName, rawType, marker === "?");
      if (field) fields.push(field);
    }

    out.push({ name: className, tableName, fields });
  }
  return out;
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Parse a single Sequelize source file into `KoaModelFile[]`.
 *
 * A file may simultaneously contain all three styles (rare but possible);
 * each declaration is returned as a distinct model.
 */
export const parseSequelizeFile = (content: string, relPath: string): KoaModelFile[] => {
  const parsed: ParsedDefinedModel[] = [
    ...extractDefineModels(content),
    ...extractInitModels(content),
    ...extractDecoratedClasses(content),
  ];

  return parsed.map((p) => {
    const model: KoaModelFile = {
      name: p.name,
      relPath,
      modelName: p.name,
      orm: "sequelize",
      interfaces: [],
      fields: p.fields,
    };
    if (p.tableName) model.tableName = p.tableName;
    return model;
  });
};

/**
 * Scan `<serverRoot>/src/{models,entities,entity}/**.ts` for Sequelize model
 * declarations. Directory priority mirrors the real-world distribution:
 * `models/` first (Sequelize community standard), then TypeORM-ish fallbacks.
 *
 * Returns an empty array when no candidate directory exists.
 */
export const scanSequelizeModels = async (serverRoot: string): Promise<KoaModelFile[]> => {
  const src = path.join(serverRoot, "src");
  const candidateDirs = [
    path.join(src, "models"),
    path.join(src, "entities"),
    path.join(src, "entity"),
  ];

  const models: KoaModelFile[] = [];
  const seenFiles = new Set<string>();

  for (const dir of candidateDirs) {
    for (const file of await listFiles(dir, [".ts"])) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const content = await readText(file);
      if (content === null) continue;
      // Cheap gate — skip files with no Sequelize fingerprint at all.
      if (!/\b(?:sequelize|Sequelize|Model|@Table)\b/.test(content)) continue;

      const relPath = path
        .relative(serverRoot, file)
        .split(path.sep)
        .join("/");
      const parsed = parseSequelizeFile(content, relPath);
      if (parsed.length > 0) models.push(...parsed);
    }
  }

  return models;
};
