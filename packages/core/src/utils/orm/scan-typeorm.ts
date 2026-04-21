/**
 * Lightweight parser for TypeORM entity files.
 *
 * Like `scan-prisma.ts`, we avoid depending on TypeORM's own metadata
 * reflection (requires running the code) and do a focused regex parse that
 * covers the 95% case of real-world entity declarations:
 *
 *   - `@Entity()` / `@Entity("table_name")` / `@Entity({ name: "..." })`
 *   - `@Column()` / `@Column({ type, length, nullable, default, unique })`
 *   - `@PrimaryGeneratedColumn()` / `@PrimaryGeneratedColumn("uuid")`
 *   - `@PrimaryColumn()`
 *   - `@ManyToOne(() => Target) @JoinColumn({ name: "targetId" })`
 *   - `@OneToMany(() => Target, t => t.back)`
 *   - `@OneToOne` / `@ManyToMany`
 *
 * Unsupported on purpose: inheritance (`@ChildEntity`), embedded columns,
 * custom transformers, tree repositories.
 */
import path from "node:path";
import { listFiles } from "../fs";
import { readText } from "../scanner";
import type { KoaModelFile, ModelField, ModelFieldRelation } from "../../types";

const TYPEORM_RELATION_DECORATORS: Record<string, ModelFieldRelation["kind"]> = {
  OneToOne: "one-to-one",
  ManyToOne: "many-to-one",
  OneToMany: "one-to-many",
  ManyToMany: "many-to-many",
};

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

/** Extract a string literal or `{ name: "..." }` option from a decorator call. */
const extractEntityTableName = (callArgs: string): string | undefined => {
  const trimmed = callArgs.trim();
  if (!trimmed) return undefined;
  // Pattern 1: "table_name"
  const stringMatch = trimmed.match(/^["'`]([^"'`]+)["'`]/);
  if (stringMatch) return stringMatch[1];
  // Pattern 2: { name: "table_name" }
  const objMatch = trimmed.match(/name\s*:\s*["'`]([^"'`]+)["'`]/);
  if (objMatch) return objMatch[1];
  return undefined;
};

/** Parse a `{ key: value, ... }` decorator options block into a flat map. */
const parseDecoratorOptions = (body: string): Record<string, string> => {
  const opts: Record<string, string> = {};
  // Match key: value pairs at the top level (simple case — doesn't handle nested objects deeply)
  const re = /(\w+)\s*:\s*("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`[^`]*`|[^,\n]+)/g;
  for (const m of body.matchAll(re)) {
    const key = m[1]!;
    let value = m[2]!.trim().replace(/,\s*$/, "");
    // Strip matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith("`") && value.endsWith("`"))
    ) {
      value = value.slice(1, -1);
    }
    opts[key] = value;
  }
  return opts;
};

interface DecoratorCall {
  name: string;
  /** Raw args between the outer `()`, or `""` for `@Foo()` / `@Foo`. */
  args: string;
}

/** Skip whitespace + comments backwards, return the new index (one past the last non-whitespace char). */
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

/**
 * Find the matching opening `(` for a closing `)` at `closeIdx`.
 * Returns -1 when unbalanced.
 */
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

/**
 * Read every decorator call (`@Name(...)` or bare `@Name`) directly attached
 * to the property declaration whose name starts at `position`.
 *
 * Decorators are collected by scanning *backwards* from `position` and
 * repeatedly matching either:
 *   - `@Ident` (bare)
 *   - `@Ident(...)` (with balanced parens, possibly containing braces)
 * Whitespace / newlines between decorators is permitted. We stop at the
 * first non-whitespace, non-decorator character (e.g. `;`, `{`, `}`), which
 * marks the boundary of the previous property / the class body start.
 */
const collectDecoratorsBefore = (source: string, position: number): DecoratorCall[] => {
  const decorators: DecoratorCall[] = [];
  let cursor = skipWhitespaceBackwards(source, position);

  while (cursor > 0) {
    const prev = source[cursor - 1]!;

    if (prev === ")") {
      // Decorator with args: @Ident(...)
      const closeParenIdx = cursor - 1;
      const openParenIdx = matchParenBackwards(source, closeParenIdx);
      if (openParenIdx < 0) break;

      // Expect `@Ident` immediately before the `(`.
      const identEnd = openParenIdx;
      let identStart = identEnd;
      while (identStart > 0 && /[A-Za-z0-9_$]/.test(source[identStart - 1]!)) {
        identStart--;
      }
      if (identStart === identEnd) break;
      if (identStart === 0 || source[identStart - 1] !== "@") break;

      const name = source.slice(identStart, identEnd);
      const args = source.slice(openParenIdx + 1, closeParenIdx);
      decorators.push({ name, args });

      cursor = skipWhitespaceBackwards(source, identStart - 1);
      continue;
    }

    // Bare decorator case: ...@Ident<whitespace><field name>
    if (/[A-Za-z0-9_$]/.test(prev)) {
      let identEnd = cursor;
      let identStart = identEnd;
      while (identStart > 0 && /[A-Za-z0-9_$]/.test(source[identStart - 1]!)) {
        identStart--;
      }
      if (identStart > 0 && source[identStart - 1] === "@") {
        const name = source.slice(identStart, identEnd);
        decorators.push({ name, args: "" });
        cursor = skipWhitespaceBackwards(source, identStart - 1);
        continue;
      }
      break;
    }

    break;
  }

  // We collected them in reverse order; restore source order.
  return decorators.reverse();
};

/** Extract the arrow-function target type from a relation decorator's first arg. */
const extractRelationTarget = (args: string): string | undefined => {
  // `() => TargetClass` — possibly followed by `, opts` or `, t => t.something`
  const m = args.match(/\(\s*\)\s*=>\s*(\w+)/);
  return m?.[1];
};

/** Extract `{ name: "..." }` from `@JoinColumn`. */
const extractJoinColumnName = (args: string): string | undefined => {
  const m = args.match(/name\s*:\s*["'`]([^"'`]+)["'`]/);
  return m?.[1];
};

/** Turn a stack of decorators into a `ModelField` (returning `null` if not a column). */
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
  let relation: ModelFieldRelation | null = null;
  let joinColumnName: string | undefined;

  for (const deco of decorators) {
    if (deco.name === "Column") {
      isColumnDecorated = true;
      if (deco.args.trim()) {
        // @Column("varchar", { length: 255 }) or @Column({ ... })
        const firstArg = deco.args.trim();
        // Leading string literal → type
        const leadingString = firstArg.match(/^["'`]([^"'`]+)["'`]/);
        if (leadingString) field.type = leadingString[1];
        const braceStart = firstArg.indexOf("{");
        if (braceStart >= 0) {
          const braceEnd = matchBrace(firstArg, braceStart);
          if (braceEnd > braceStart) {
            const opts = parseDecoratorOptions(firstArg.slice(braceStart + 1, braceEnd));
            if (opts.type) field.type = opts.type;
            if (opts.length) field.length = Number(opts.length);
            if (opts.precision) field.precision = Number(opts.precision);
            if (opts.scale) field.scale = Number(opts.scale);
            if (opts.nullable) field.nullable = opts.nullable === "true";
            if (opts.unique) field.unique = opts.unique === "true";
            if (opts.default !== undefined) field.default = opts.default;
            if (opts.name) field.columnName = opts.name;
          }
        }
      }
    } else if (deco.name === "PrimaryGeneratedColumn") {
      isColumnDecorated = true;
      field.primary = true;
      const uuidMatch = deco.args.match(/["'`]uuid["'`]/);
      if (!uuidMatch) field.autoIncrement = true;
    } else if (deco.name === "PrimaryColumn") {
      isColumnDecorated = true;
      field.primary = true;
    } else if (deco.name in TYPEORM_RELATION_DECORATORS) {
      const target = extractRelationTarget(deco.args);
      if (target) {
        relation = {
          kind: TYPEORM_RELATION_DECORATORS[deco.name]!,
          target,
        };
      }
    } else if (deco.name === "JoinColumn") {
      joinColumnName = extractJoinColumnName(deco.args);
    }
  }

  if (relation) {
    if (joinColumnName) relation.foreignKey = joinColumnName;
    field.relation = relation;
    return field;
  }

  return isColumnDecorated ? field : null;
};

interface ParsedEntityClass {
  name: string;
  tableName?: string;
  fields: ModelField[];
}

/**
 * Walk the source and yield every `@Entity(...) class Name { ... }` declaration.
 */
const extractEntityClasses = (source: string): ParsedEntityClass[] => {
  const out: ParsedEntityClass[] = [];
  // Match: @Entity optionally followed by (...), then whitespace, then `export class Name` or `class Name`
  const entityRe = /@Entity\s*(\([^)]*\))?\s*(?:export\s+)?class\s+(\w+)/g;
  for (const m of source.matchAll(entityRe)) {
    const entityArgs = m[1] ? m[1].slice(1, -1) : "";
    const className = m[2]!;
    const tableName = extractEntityTableName(entityArgs);

    // Find class body opening brace after the match
    const afterMatch = m.index! + m[0].length;
    const braceOpen = source.indexOf("{", afterMatch);
    if (braceOpen < 0) continue;
    const braceClose = matchBrace(source, braceOpen);
    if (braceClose < 0) continue;
    const classBody = source.slice(braceOpen + 1, braceClose);

    // Iterate fields. A field is a line matching `name[!?]?: Type;` — we need to walk
    // carefully because decorators can span multiple lines, and may even share the
    // same line as the field declaration (`@PrimaryGeneratedColumn() id!: number;`).
    const fields: ModelField[] = [];
    // Allow the field name to be preceded by either a newline/line start or the
    // closing `)` of the previous decorator on the same line.
    const fieldRe = /(?:^|\n|\))\s*(\w+)\s*([!?])?\s*:\s*([^;=\n{]+?)\s*(?:;|=|\n)/g;
    for (const fm of classBody.matchAll(fieldRe)) {
      const fieldName = fm[1]!;
      const marker = fm[2];
      const rawType = fm[3]!.trim();

      // Skip method-style signatures: if rawType looks like "(", it's a method.
      if (rawType.startsWith("(")) continue;
      // Skip reserved-ish names
      if (fieldName === "constructor") continue;

      // Position of this field's name in the class body
      const nameIdx = fm.index! + fm[0].indexOf(fieldName);
      const decorators = collectDecoratorsBefore(classBody, nameIdx);
      if (decorators.length === 0) continue;

      const field = decoratorsToField(
        decorators,
        fieldName,
        rawType,
        marker === "?",
      );
      if (field) fields.push(field);
    }

    out.push({ name: className, tableName, fields });
  }
  return out;
};

/**
 * Parse a TypeORM entity file text into our internal `KoaModelFile[]` shape.
 *
 * A single file may contain multiple `@Entity` classes; each is returned as
 * its own `KoaModelFile`.
 */
export const parseTypeormEntity = (content: string, relPath: string): KoaModelFile[] => {
  return extractEntityClasses(content).map((parsed) => {
    const model: KoaModelFile = {
      name: parsed.name,
      relPath,
      modelName: parsed.name,
      orm: "typeorm",
      interfaces: [],
      fields: parsed.fields,
    };
    if (parsed.tableName) model.tableName = parsed.tableName;
    return model;
  });
};

/**
 * Scan `<serverRoot>/src/{entities,entity,models}/**.ts` for TypeORM entity
 * declarations. Multiple candidate directories are tried in order of
 * decreasing popularity in real-world TypeORM projects.
 *
 * Returns an empty array when none of the directories exist.
 */
export const scanTypeormEntities = async (serverRoot: string): Promise<KoaModelFile[]> => {
  const src = path.join(serverRoot, "src");
  const candidateDirs = [
    path.join(src, "entities"),
    path.join(src, "entity"),
    path.join(src, "models"),
  ];

  const models: KoaModelFile[] = [];
  const seenFiles = new Set<string>();

  for (const dir of candidateDirs) {
    for (const file of await listFiles(dir, [".ts"])) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const content = await readText(file);
      if (content === null) continue;
      if (!/@Entity\b/.test(content)) continue;

      const relPath = path
        .relative(serverRoot, file)
        .split(path.sep)
        .join("/");
      models.push(...parseTypeormEntity(content, relPath));
    }
  }

  return models;
};
