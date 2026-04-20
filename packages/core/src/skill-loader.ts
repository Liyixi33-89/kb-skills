/**
 * Skill loader — discovers SKILL.md files bundled in @kb-skills/core/assets.
 *
 * Both the Python edition and npm edition share one source of truth: the
 * SKILL.md files live in `assets/skills/<name>/SKILL.md` after running
 * `pnpm sync-skills` at the repo root.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { isDir, isFile, readTextOrNull } from "./utils/fs";
import type { SkillMeta } from "./types";

/** Locate the `assets/skills/` folder relative to this compiled file. */
const resolveAssetsDir = (): string => {
  // dist/index.js sits at <pkg>/dist/index.js, assets at <pkg>/assets/skills
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), "..", "assets", "skills");
};

const parseDescription = (markdown: string): string => {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const desc = frontmatter[1]!.match(/^description:\s*(.+)$/m);
    if (desc) return desc[1]!.trim().replace(/^['"]|['"]$/g, "");
  }
  // fallback: first non-heading non-empty line
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("---")) continue;
    return line.slice(0, 200);
  }
  return "";
};

export const listSkills = async (): Promise<SkillMeta[]> => {
  const root = resolveAssetsDir();
  if (!(await isDir(root))) return [];

  const names = (await readdir(root)).sort();
  const out: SkillMeta[] = [];
  for (const name of names) {
    const skillDir = path.join(root, name);
    if (!(await isDir(skillDir))) continue;
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!(await isFile(skillFile))) continue;
    const content = await readTextOrNull(skillFile);
    if (content === null) continue;
    out.push({
      name,
      description: parseDescription(content),
      content,
    });
  }
  return out;
};

export const loadSkill = async (name: string): Promise<SkillMeta | null> => {
  const skillFile = path.join(resolveAssetsDir(), name, "SKILL.md");
  const content = await readTextOrNull(skillFile);
  if (content === null) return null;
  return { name, description: parseDescription(content), content };
};