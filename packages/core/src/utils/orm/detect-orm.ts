/**
 * Detect which ORM a backend project uses by inspecting its package.json
 * dependency map. Kept purely synchronous / string-based so adapters and
 * tests can reuse it without touching disk.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { OrmKind } from "../../types";

export type DepsMap = Record<string, string>;

/** Return the ORM flavour for a deps map, or `null` when unknown. */
export const detectOrm = (deps: DepsMap): OrmKind | null => {
  if ("mongoose" in deps) return "mongoose";
  if ("prisma" in deps || "@prisma/client" in deps) return "prisma";
  if ("typeorm" in deps) return "typeorm";
  if ("sequelize" in deps || "sequelize-typescript" in deps) return "sequelize";
  return null;
};

/**
 * Convenience: read `<projectRoot>/package.json` and merge
 * `dependencies` + `devDependencies` into a single map. Returns an empty
 * object when the file is missing or malformed — adapters downstream treat
 * that as "no ORM detected".
 */
export const readDepsFromPackageJson = async (projectRoot: string): Promise<DepsMap> => {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: DepsMap; devDependencies?: DepsMap };
    return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return {};
  }
};
