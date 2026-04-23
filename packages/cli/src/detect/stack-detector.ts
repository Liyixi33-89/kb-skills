/**
 * Detect which stack(s) a project uses by reading package.json + heuristics.
 * Used by `kb-skills init` to suggest adapter imports.
 */
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

export type DetectedStack = "koa" | "express" | "nestjs" | "nextjs" | "nuxt" | "react" | "react-native" | "vue2" | "vue3" | "unknown";

export interface DetectionResult {
  stacks: DetectedStack[];
  /** True when a root workspaces/packages array is found (likely fullstack monorepo). */
  isMonorepo: boolean;
  /** Candidate module directories: [{ name, relPath }]. */
  candidateModules: Array<{ name: string; relPath: string; stack: DetectedStack }>;
}

const readPkg = async (dir: string): Promise<Record<string, unknown> | null> => {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const depsOf = (pkg: Record<string, unknown>): Record<string, string> => ({
  ...((pkg.dependencies as Record<string, string>) ?? {}),
  ...((pkg.devDependencies as Record<string, string>) ?? {}),
});

const stackOf = (deps: Record<string, string>): DetectedStack => {
  if ("koa" in deps) return "koa";
  // NestJS must be checked before express (NestJS depends on @nestjs/platform-express which installs express)
  if ("@nestjs/core" in deps || "@nestjs/common" in deps) return "nestjs";
  if ("express" in deps) return "express";
  // Next.js must be checked before react (it also depends on react)
  if ("next" in deps) return "nextjs";
  // Nuxt must be checked before vue (it also depends on vue)
  if ("nuxt" in deps || "@nuxt/core" in deps || "@nuxt/kit" in deps) return "nuxt";
  // React Native / Expo must be checked before react (it also depends on react)
  if ("react-native" in deps || "expo" in deps) return "react-native";
  if ("react" in deps) return "react";
  if (deps["vue"]?.startsWith("2.") || "vue-template-compiler" in deps) return "vue2";
  if ("vue" in deps) return "vue3";
  return "unknown";
};

export const detectStack = async (projectRoot: string): Promise<DetectionResult> => {
  const rootPkg = await readPkg(projectRoot);
  const stacks = new Set<DetectedStack>();
  const candidateModules: DetectionResult["candidateModules"] = [];

  if (!rootPkg) {
    return { stacks: [], isMonorepo: false, candidateModules: [] };
  }

  const rootDeps = depsOf(rootPkg);
  const rootStack = stackOf(rootDeps);
  if (rootStack !== "unknown") stacks.add(rootStack);

  const workspaces = Array.isArray(rootPkg.workspaces)
    ? (rootPkg.workspaces as string[])
    : (rootPkg.workspaces as { packages?: string[] } | undefined)?.packages ?? [];

  const isMonorepo = workspaces.length > 0;
  if (isMonorepo) {
    // Expand each workspace entry: literal paths are used directly;
    // glob patterns like "packages/*" are expanded by listing the directory.
    const resolvedDirs: Array<{ abs: string; relPath: string }> = [];

    for (const ws of workspaces) {
      if (ws.includes("*")) {
        // Simple glob: only support the common "<dir>/*" pattern.
        const globBase = ws.replace(/\/\*.*$/, "");
        const absBase = path.resolve(projectRoot, globBase);
        try {
          const entries = await readdir(absBase, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const abs = path.join(absBase, entry.name);
              resolvedDirs.push({ abs, relPath: path.posix.join(globBase, entry.name) });
            }
          }
        } catch {
          // directory doesn't exist — skip
        }
      } else {
        resolvedDirs.push({ abs: path.resolve(projectRoot, ws), relPath: ws });
      }
    }

    for (const { abs, relPath } of resolvedDirs) {
      const wsPkg = await readPkg(abs);
      if (!wsPkg) continue;
      const st = stackOf(depsOf(wsPkg));
      if (st !== "unknown") {
        stacks.add(st);
        candidateModules.push({ name: (wsPkg.name as string) ?? path.basename(abs), relPath, stack: st });
      }
    }
  } else if (rootStack !== "unknown") {
    candidateModules.push({
      name: (rootPkg.name as string) ?? path.basename(projectRoot),
      relPath: ".",
      stack: rootStack,
    });
  }

  return { stacks: [...stacks], isMonorepo, candidateModules };
};