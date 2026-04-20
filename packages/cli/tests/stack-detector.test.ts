import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectStack } from "../src/detect/stack-detector";

describe("detectStack", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-detect-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns empty result when no package.json exists", async () => {
    const res = await detectStack(tmp);
    expect(res.stacks).toEqual([]);
    expect(res.isMonorepo).toBe(false);
    expect(res.candidateModules).toEqual([]);
  });

  it("detects a koa single-package project", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-api",
        dependencies: { koa: "^2.15.0", "koa-router": "^12.0.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["koa"]);
    expect(res.isMonorepo).toBe(false);
    expect(res.candidateModules).toHaveLength(1);
    expect(res.candidateModules[0]).toMatchObject({ name: "my-api", relPath: "." });
  });

  it("detects a react single-package project", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-app",
        dependencies: { react: "^19.0.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["react"]);
    expect(res.candidateModules[0]?.stack).toBe("react");
  });

  it("detects fullstack monorepo via workspaces array", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["apps/server", "apps/web"],
      }),
    );
    await mkdir(path.join(tmp, "apps", "server"), { recursive: true });
    await mkdir(path.join(tmp, "apps", "web"), { recursive: true });
    await writeFile(
      path.join(tmp, "apps", "server", "package.json"),
      JSON.stringify({ name: "server", dependencies: { koa: "^2.15.0" } }),
    );
    await writeFile(
      path.join(tmp, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", dependencies: { react: "^19.0.0" } }),
    );

    const res = await detectStack(tmp);
    expect(res.isMonorepo).toBe(true);
    expect(new Set(res.stacks)).toEqual(new Set(["koa", "react"]));
    expect(res.candidateModules.map((m) => m.name).sort()).toEqual(["server", "web"]);
  });

  it("reports unknown when dependency is unrecognised", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "misc", dependencies: { lodash: "^4.17.0" } }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual([]);
    expect(res.candidateModules).toEqual([]);
  });
});
