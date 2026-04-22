import createKoaAdapter from "../../packages/adapter-koa/dist/index.js";
import createReactAdapter from "../../packages/adapter-react/dist/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, ".");

const koaAdapter = createKoaAdapter();
const reactAdapter = createReactAdapter();

console.log("=== 检测阶段 ===");
const serverDetect = await koaAdapter.detect(path.join(root, "server"));
const webDetect = await reactAdapter.detect(path.join(root, "web"));
console.log("server (koa) detect:", serverDetect);
console.log("web (react) detect:", webDetect);

console.log("\n=== 扫描阶段 ===");
const serverModule = await koaAdapter.scan(path.join(root, "server"));
const webModule = await reactAdapter.scan(path.join(root, "web"));

const serverRaw = serverModule.raw;
console.log("\n--- server module ---");
console.log("name:", serverModule.name, "| kind:", serverModule.kind);
console.log("framework:", serverRaw.framework, "| orm:", serverRaw.orm);
console.log("routes:", JSON.stringify(serverRaw.routes, null, 2));
console.log("models:", JSON.stringify(serverRaw.models, null, 2));
console.log("services:", JSON.stringify(serverRaw.services.map(s => ({ name: s.name, exports: s.exports, deps: s.dependencies })), null, 2));
console.log("middleware:", serverRaw.middleware.length);
console.log("entry:", serverRaw.entry?.file ?? "none");

const webRaw = webModule.raw;
console.log("\n--- web module ---");
console.log("name:", webModule.name, "| kind:", webModule.kind);
console.log("framework:", webRaw.framework);
console.log("pages:", webRaw.pages.map(p => ({ name: p.name ?? path.basename(p.file), states: p.states?.length ?? 0, effects: p.effectCount ?? 0, apiCalls: p.apiCalls ?? [] })));
console.log("components:", webRaw.components.map(c => ({ name: c.name, props: c.props?.length ?? 0 })));
console.log("storeFiles:", webRaw.storeFiles.map(s => path.basename(s.file)));
console.log("apiFiles:", webRaw.apiFiles.map(a => path.basename(a.file)));
console.log("routes:", webRaw.routes);

console.log("\n--- symbols summary ---");
console.log("server symbols (" + serverModule.symbols.length + "):", serverModule.symbols.map(s => `[${s.kind}] ${s.name}`));
console.log("web symbols (" + webModule.symbols.length + "):", webModule.symbols.map(s => `[${s.kind}] ${s.name}`));
