/**
 * Mongoose model scanner — shared across all backend adapters.
 *
 * Extracted from `adapter-koa` / `adapter-express` so every backend adapter
 * can reuse the same logic without duplication.
 */
import path from "node:path";
import { readText } from "../scanner";
import type { KoaInterface, KoaInterfaceField, KoaModelFile, KoaSchemaField } from "../../types";

/**
 * Extract the body of `new mongoose.Schema({ ... })` using brace-depth tracking.
 * Returns `null` when no Schema call is found.
 */
const extractSchemaBody = (content: string): string | null => {
  const schemaStart = content.search(/new\s+(?:mongoose\.)?Schema\s*\(\s*\{/);
  if (schemaStart < 0) return null;

  // Find the opening `{` of the schema object
  const braceIdx = content.indexOf("{", schemaStart);
  if (braceIdx < 0) return null;

  let depth = 1;
  let pos = braceIdx + 1;
  while (pos < content.length && depth > 0) {
    const ch = content[pos]!;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) break;
    pos++;
  }

  return content.slice(braceIdx + 1, pos);
};

/**
 * Parse a single Mongoose model file and return a `KoaModelFile`.
 * Returns `null` when the file cannot be read.
 */
export const scanMongooseModel = async (file: string): Promise<KoaModelFile | null> => {
  const content = await readText(file);
  if (content === null) return null;

  // ── TypeScript interfaces ──────────────────────────────────────────────
  const interfaces: KoaInterface[] = [];
  const ifaceRe = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]+)\}/gs;
  for (const m of content.matchAll(ifaceRe)) {
    const name = m[1]!;
    const body = m[2]!;
    const fields: KoaInterfaceField[] = [];
    for (const fm of body.matchAll(/(\w+)(\?)?:\s*([^;\n]+)/g)) {
      fields.push({
        name: fm[1]!,
        optional: Boolean(fm[2]),
        type: fm[3]!.trim().replace(/;$/, ""),
      });
    }
    interfaces.push({ name, fields });
  }

  // ── Schema fields ──────────────────────────────────────────────────────
  const fields: KoaSchemaField[] = [];
  const schemaBody = extractSchemaBody(content);

  if (schemaBody) {
    // Track which character ranges are "consumed" by { type: ... } style fields
    const consumedRanges: Array<[number, number]> = [];

    // { type: ... } style — each top-level field: `fieldName: { ... }`
    // We need to handle nested braces, so use depth tracking per field
    const topFieldRe = /(\w+)\s*:\s*\{/g;
    for (const fm of schemaBody.matchAll(topFieldRe)) {
      const fieldName = fm[1]!;
      // Extract the field body using brace depth
      const bodyStart = fm.index! + fm[0].length;
      let depth = 1;
      let pos = bodyStart;
      while (pos < schemaBody.length && depth > 0) {
        const ch = schemaBody[pos]!;
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth === 0) break;
        pos++;
      }
      const body = schemaBody.slice(bodyStart, pos);
      // Mark the entire `fieldName: { ... }` span as consumed
      consumedRanges.push([fm.index!, pos + 1]);

      const info: KoaSchemaField = { name: fieldName };
      const typeMatch = body.match(/type\s*:\s*(\w+)/);
      if (typeMatch) info.type = typeMatch[1]!;
      info.required = /required/i.test(body) && /true/i.test(body);
      info.unique = /unique/i.test(body) && /true/i.test(body);
      const refMatch = body.match(/ref\s*:\s*["'](\w+)["']/);
      if (refMatch) info.ref = refMatch[1]!;
      const defMatch = body.match(/default\s*:\s*([^,\n]+)/);
      if (defMatch) info.default = defMatch[1]!.trim();
      const enumMatch = body.match(/enum\s*:\s*\[([^\]]+)\]/);
      if (enumMatch) info.enum = enumMatch[1]!.trim();
      fields.push(info);
    }

    // simple `key: Type` style — only match positions NOT inside a consumed range
    const simpleRe = /(\w+)\s*:\s*(String|Number|Boolean|Date|ObjectId|Mixed|Buffer|Map)\b/g;
    for (const fm of schemaBody.matchAll(simpleRe)) {
      const matchPos = fm.index!;
      // Skip if this position is inside a { type: ... } block
      const isNested = consumedRanges.some(([start, end]) => matchPos > start && matchPos < end);
      if (isNested) continue;
      const fieldName = fm[1]!;
      if (!fields.some((f) => f.name === fieldName)) {
        fields.push({ name: fieldName, type: fm[2]! });
      }
    }
  }

  // mongoose.model("ModelName", schema) — string literal takes priority
  const modelStrMatch = content.match(/mongoose\.model\s*(?:<[^>]*>)?\s*\(\s*["'](\w+)["']/);
  const modelMatch = modelStrMatch ?? content.match(/mongoose\.model\s*[<(]\s*["']?(\w+)/);

  return {
    name: path.basename(file, path.extname(file)),
    relPath: file,
    modelName: modelMatch ? modelMatch[1]! : undefined,
    orm: "mongoose",
    interfaces,
    fields,
  };
};
