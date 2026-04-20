import pc from "picocolors";
import { listSkills } from "@kb-skills/core";
import type { CAC } from "cac";

export const registerList = (cli: CAC): void => {
  cli
    .command("list", "List all bundled Skills")
    .alias("ls")
    .action(async () => {
      const skills = await listSkills();
      if (skills.length === 0) {
        console.log(pc.yellow("No bundled skills found. Did you run 'pnpm sync-skills' at the monorepo root?"));
        return;
      }
      console.log(pc.bold(`Available skills (${skills.length}):`), "");
      for (const s of skills) {
        const desc = s.description ? ` ${pc.gray("— " + s.description.slice(0, 80))}` : "";
        console.log(`  ${pc.cyan(s.name.padEnd(28))}${desc}`);
      }
    });
};