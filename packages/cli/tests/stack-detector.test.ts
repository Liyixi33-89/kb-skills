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

  it("detects an express single-package project", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-api",
        dependencies: { express: "^4.21.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["express"]);
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

  it("detects a Next.js project (next dep takes priority over react)", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-next-app",
        dependencies: { next: "^14.0.0", react: "^18.0.0", "react-dom": "^18.0.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["nextjs"]);
    expect(res.candidateModules[0]?.stack).toBe("nextjs");
  });

  it("detects a NestJS project via @nestjs/core (takes priority over express)", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-nest-api",
        // NestJS projects typically install @nestjs/platform-express which brings in express
        dependencies: { "@nestjs/core": "^10.0.0", "@nestjs/common": "^10.0.0", "express": "^4.21.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["nestjs"]);
    expect(res.candidateModules[0]?.stack).toBe("nestjs");
  });

  it("detects a Nuxt project via 'nuxt' dep (takes priority over vue)", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-nuxt-app",
        dependencies: { nuxt: "^3.10.0", vue: "^3.4.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["nuxt"]);
    expect(res.candidateModules[0]?.stack).toBe("nuxt");
  });

  it("detects a Nuxt project via '@nuxt/kit' dep", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-nuxt-layer",
        devDependencies: { "@nuxt/kit": "^3.10.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["nuxt"]);
  });

  it("expands glob workspace pattern 'packages/*'", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["packages/*"],
      }),
    );
    await mkdir(path.join(tmp, "packages", "server"), { recursive: true });
    await mkdir(path.join(tmp, "packages", "web"), { recursive: true });
    await writeFile(
      path.join(tmp, "packages", "server", "package.json"),
      JSON.stringify({ name: "server", dependencies: { koa: "^2.15.0" } }),
    );
    await writeFile(
      path.join(tmp, "packages", "web", "package.json"),
      JSON.stringify({ name: "web", dependencies: { react: "^19.0.0" } }),
    );

    const res = await detectStack(tmp);
    expect(res.isMonorepo).toBe(true);
    expect(new Set(res.stacks)).toEqual(new Set(["koa", "react"]));
    expect(res.candidateModules.map((m) => m.name).sort()).toEqual(["server", "web"]);
    // relPath should be packages/server and packages/web
    const relPaths = res.candidateModules.map((m) => m.relPath).sort();
    expect(relPaths[0]).toContain("packages");
  });

  it("expands glob workspace pattern 'apps/*' and skips dirs without package.json", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "root",
        private: true,
        workspaces: ["apps/*"],
      }),
    );
    await mkdir(path.join(tmp, "apps", "backend"), { recursive: true });
    await mkdir(path.join(tmp, "apps", "frontend"), { recursive: true });
    // apps/empty has no package.json
    await mkdir(path.join(tmp, "apps", "empty"), { recursive: true });
    await writeFile(
      path.join(tmp, "apps", "backend", "package.json"),
      JSON.stringify({ name: "backend", dependencies: { express: "^4.21.0" } }),
    );
    await writeFile(
      path.join(tmp, "apps", "frontend", "package.json"),
      JSON.stringify({ name: "frontend", dependencies: { vue: "^3.4.0" } }),
    );

    const res = await detectStack(tmp);
    expect(res.isMonorepo).toBe(true);
    expect(new Set(res.stacks)).toEqual(new Set(["express", "vue3"]));
    // 'empty' dir has no package.json, should not appear
    expect(res.candidateModules).toHaveLength(2);
  });

  it("detects a React Native project (react-native dep takes priority over react)", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-rn-app",
        dependencies: { "react-native": "^0.73.0", react: "^18.0.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["react-native"]);
    expect(res.candidateModules[0]?.stack).toBe("react-native");
  });

  it("detects an Expo project via 'expo' dep (takes priority over react)", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "my-expo-app",
        dependencies: { expo: "^50.0.0", react: "^18.0.0", "react-native": "^0.73.0" },
      }),
    );

    const res = await detectStack(tmp);
    expect(res.stacks).toEqual(["react-native"]);
    expect(res.candidateModules[0]?.stack).toBe("react-native");
  });
});
