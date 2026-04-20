/**
 * sync-skills.ts — copy SKILL.md + references/ from the Python edition
 * into @kb-skills/core/assets/skills/ so both editions share a single source of truth.
 *
 * Usage:
 *   pnpm sync-skills [source]
 *
 * Default source:
 *   ../agency-agents/apps/skills   (relative to the kb-skills repo root)
 */
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_SOURCE = path.resolve(repoRoot, "../agency-agents/apps/skills");
const TARGET = path.resolve(repoRoot, "packages/core/assets/skills");

/** Files/folders that should be mirrored per Skill. */
const ALLOWED_ENTRIES = new Set(["SKILL.md", "references", "scripts"]);

const copyRecursive = async (src: string, dest: string): Promise<void> => {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const children = await fs.readdir(src);
    await Promise.all(children.map((child) => copyRecursive(path.join(src, child), path.join(dest, child))));
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
};

const main = async (): Promise<void> => {
  const source = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;

  if (!existsSync(source)) {
    console.error(`[sync-skills] source not found: ${source}`);
    console.error("[sync-skills] pass a path explicitly: pnpm sync-skills <path-to-skills-dir>");
    process.exit(1);
  }

  console.log(`[sync-skills] source: ${source}`);
  console.log(`[sync-skills] target: ${TARGET}`);

  await fs.rm(TARGET, { recursive: true, force: true });
  await fs.mkdir(TARGET, { recursive: true });

  const skillDirs = (await fs.readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  let copied = 0;
  for (const skill of skillDirs) {
    const srcSkill = path.join(source, skill);
    const dstSkill = path.join(TARGET, skill);
    const entries = await fs.readdir(srcSkill);
    const hasSkillMd = entries.includes("SKILL.md");
    if (!hasSkillMd) {
      console.warn(`[sync-skills] skip ${skill} (no SKILL.md)`);
      continue;
    }
    for (const entry of entries) {
      if (!ALLOWED_ENTRIES.has(entry)) continue;
      await copyRecursive(path.join(srcSkill, entry), path.join(dstSkill, entry));
    }
    copied += 1;
    console.log(`[sync-skills] ✔ ${skill}`);
  }

  console.log(`[sync-skills] done — synced ${copied} skills`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});