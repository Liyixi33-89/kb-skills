import { cac } from "cac";
import pc from "picocolors";
import { createRequire } from "node:module";
import { registerInit } from "./commands/init";
import { registerList } from "./commands/list";
import { registerRun } from "./commands/run";
import { registerStatus } from "./commands/status";
import { registerVerify } from "./commands/verify";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const cli = cac("kb-skills");

registerInit(cli);
registerList(cli);
registerRun(cli);
registerStatus(cli);
registerVerify(cli);

cli.help();
cli.version(pkg.version);

try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(pc.red("✖"), msg);
  process.exit(1);
}