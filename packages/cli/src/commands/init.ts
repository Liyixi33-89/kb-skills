import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import prompts from "prompts";
import pc from "picocolors";
import { createLogger, writeFileEnsuring, isFile } from "@kb-skills/core";
import { detectStack, type DetectedStack } from "../detect/stack-detector";
import type { CAC } from "cac";

interface InitOptions {
  yes?: boolean;
  cwd?: string;
}

const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");

const ADAPTER_FOR: Record<DetectedStack, { pkg: string; factory: string } | null> = {
  koa: { pkg: "@kb-skills/adapter-koa", factory: "koaAdapter" },
  react: { pkg: "@kb-skills/adapter-react", factory: "reactAdapter" },
  express: { pkg: "@kb-skills/adapter-express", factory: "expressAdapter" },
  nestjs: { pkg: "@kb-skills/adapter-nestjs", factory: "nestAdapter" },
  nextjs: { pkg: "@kb-skills/adapter-react", factory: "reactAdapter" },
  nuxt: { pkg: "@kb-skills/adapter-vue3", factory: "vue3Adapter" },
  "react-native": { pkg: "@kb-skills/adapter-react-native", factory: "rnAdapter" },
  vue2: { pkg: "@kb-skills/adapter-vue2", factory: "vue2Adapter" },
  vue3: { pkg: "@kb-skills/adapter-vue3", factory: "vue3Adapter" },
  unknown: null,
};

const renderConfig = (
  modules: Array<{ name: string; relPath: string; stack: DetectedStack }>,
): string => {
  const supported = modules.filter((m) => ADAPTER_FOR[m.stack] !== null);
  const importSet = new Set<string>();
  for (const m of supported) {
    const a = ADAPTER_FOR[m.stack]!;
    importSet.add(`import ${a.factory} from "${a.pkg}";`);
  }
  const entries = supported
    .map((m) => {
      const a = ADAPTER_FOR[m.stack]!;
      return `    { name: "${m.name}", path: "${m.relPath}", adapter: ${a.factory}() },`;
    })
    .join("\n");

  return `/**
 * kb-skills configuration
 *
 * Docs: https://github.com/Liyixi33-89/kb-skills
 */
import { defineConfig } from "@kb-skills/cli/config";
${[...importSet].join("\n")}

export default defineConfig({
  kbRoot: "./kb",
  modules: [
${entries}
  ],
});
`;
};

const renderConstitution = async (projectName: string): Promise<string> => {
  const tplPath = path.join(TEMPLATE_DIR, "00_project_constitution.md.tpl");
  const tpl = await readFile(tplPath, "utf8");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  return tpl
    .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
    .replace(/\{\{BACKEND_TECH\}\}/g, "Node + TypeScript")
    .replace(/\{\{FRONTEND_TECH\}\}/g, "待填写")
    .replace(/\{\{PKG_MANAGER\}\}/g, "npm / pnpm")
    .replace(/\{\{DIRECTORY_TREE\}\}/g, "# 填写目录树")
    .replace(/\{\{KB_MODULE_SAMPLE\}\}/g, "<module>")
    .replace(/\{\{TIMESTAMP\}\}/g, now);
};

const readPkgName = (projectRoot: string): string => {
  const p = path.join(projectRoot, "package.json");
  if (!existsSync(p)) return path.basename(projectRoot);
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as { name?: string }).name ?? path.basename(projectRoot);
  } catch {
    return path.basename(projectRoot);
  }
};

export const registerInit = (cli: CAC): void => {
  cli
    .command("init", "Scaffold kb-skills.config.ts + kb/00_project_constitution.md")
    .option("-y, --yes", "Skip prompts and accept defaults")
    .option("--cwd <dir>", "Run init against a specific directory")
    .action(async (opts: InitOptions) => {
      const logger = createLogger({ verbose: false });
      const projectRoot = path.resolve(opts.cwd ?? process.cwd());

      logger.info(`Initializing kb-skills in ${projectRoot}`);

      const detected = await detectStack(projectRoot);
      logger.info(
        `Detected stack(s): ${detected.stacks.length > 0 ? detected.stacks.join(", ") : pc.gray("unknown")}`,
      );
      if (detected.isMonorepo) logger.info(`Monorepo with ${detected.candidateModules.length} module(s).`);

      if (detected.candidateModules.length === 0) {
        logger.warn("No recognizable stack module found (Koa / Express / NestJS / React / React Native / Vue 2 / Vue 3 / Next.js / Nuxt). A template config will still be created.");
      }

      const configPath = path.join(projectRoot, "kb-skills.config.ts");
      const constitutionPath = path.join(projectRoot, "kb", "00_project_constitution.md");

      const willOverwrite = existsSync(configPath);
      if (willOverwrite && !opts.yes) {
        const { ok } = (await prompts({
          type: "confirm",
          name: "ok",
          message: `${path.basename(configPath)} already exists. Overwrite?`,
          initial: false,
        })) as { ok?: boolean };
        if (!ok) {
          logger.info("Aborted.");
          return;
        }
      }

      await writeFileEnsuring(configPath, renderConfig(detected.candidateModules));
      logger.success(`wrote ${path.relative(projectRoot, configPath)}`);

      if (!(await isFile(constitutionPath))) {
        await writeFileEnsuring(constitutionPath, await renderConstitution(readPkgName(projectRoot)));
        logger.success(`wrote ${path.relative(projectRoot, constitutionPath)}`);
      }

      const pkgsToInstall = [
        ...new Set(
          detected.candidateModules
            .map((m) => ADAPTER_FOR[m.stack]?.pkg)
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      const installHint = pkgsToInstall.length > 0
        ? pkgsToInstall.join(" ")
        : "@kb-skills/adapter-react @kb-skills/adapter-koa";

      logger.info("Next steps:");
      console.log(`  1. ${pc.cyan("npm i -D " + installHint)}`);
      console.log(`  2. ${pc.cyan("npx kb-skills run doc-code-to-kb")}`);
      console.log(`  3. ${pc.cyan("npx kb-skills verify")}`);
    });
};