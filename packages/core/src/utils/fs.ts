import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** Write a file, creating parent dirs if needed. Always UTF-8 without BOM. */
export const writeFileEnsuring = async (filePath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, { encoding: "utf8" });
};

/** Read a text file, returning null on any error. */
export const readTextOrNull = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

/** Check whether a path exists and is a directory. */
export const isDir = async (p: string): Promise<boolean> => {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
};

/** Check whether a path exists and is a file. */
export const isFile = async (p: string): Promise<boolean> => {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
};

/** List files directly inside `dir` with given extension(s). Returns sorted, full paths. */
export const listFiles = async (dir: string, exts: string[]): Promise<string[]> => {
  if (!(await isDir(dir))) return [];
  const names = await readdir(dir);
  return names
    .filter((n) => exts.some((e) => n.endsWith(e)))
    .sort()
    .map((n) => path.join(dir, n));
};

/** Recursive file walk filtering by extensions. */
export const walkFiles = async (
  root: string,
  exts: string[],
  ignoreDirs: ReadonlySet<string> = new Set(),
): Promise<string[]> => {
  const out: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    if (!(await isDir(dir))) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        await visit(full);
      } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  };
  await visit(root);
  return out.sort();
};