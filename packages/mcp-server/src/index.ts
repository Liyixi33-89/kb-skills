/**
 * @kb-skills/mcp-server — 程序入口
 *
 * 解析命令行参数，加载配置，启动 MCP Server。
 *
 * 用法：
 *   npx @kb-skills/mcp-server                    # stdio（给 Cursor/Claude Desktop）
 *   npx @kb-skills/mcp-server --http             # HTTP，默认端口 3456
 *   npx @kb-skills/mcp-server --http --port 8080 # HTTP，自定义端口
 *   npx @kb-skills/mcp-server --cwd /path/to/project
 *   npx @kb-skills/mcp-server --config ./kb-skills.config.ts
 */
import path from "node:path";
import { loadMcpContext } from "./context.js";
import { createKbSkillsServer } from "./server.js";
import { connectStdio, connectHttp } from "./transport.js";

// ─── 解析命令行参数 ───────────────────────────────────────────────────────────

interface CliArgs {
  http: boolean;
  port: number;
  cwd: string;
  config?: string;
}

const parseArgs = (): CliArgs => {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    http: false,
    port: 3456,
    cwd: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--http") {
      result.http = true;
    } else if (arg === "--port" && args[i + 1]) {
      result.port = parseInt(args[++i]!, 10);
    } else if (arg === "--cwd" && args[i + 1]) {
      result.cwd = path.resolve(args[++i]!);
    } else if (arg === "--config" && args[i + 1]) {
      result.config = args[++i]!;
    }
  }

  return result;
};

// ─── 主函数 ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const args = parseArgs();
  const projectRoot = args.cwd;

  // 加载 kb-skills.config.ts
  let ctx;
  try {
    ctx = await loadMcpContext(projectRoot, args.config);
  } catch (err) {
    process.stderr.write(
      `[kb-skills-mcp] 配置加载失败: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  process.stderr.write(
    `[kb-skills-mcp] 项目根目录: ${ctx.projectRoot}\n` +
    `[kb-skills-mcp] KB 目录: ${ctx.kbRoot}\n` +
    `[kb-skills-mcp] 模块: ${ctx.modules.map((m) => m.name).join(", ")}\n`,
  );

  // 创建 MCP Server
  const server = createKbSkillsServer(ctx);

  // 连接传输层
  if (args.http) {
    await connectHttp(server, args.port);
  } else {
    await connectStdio(server);
  }
};

main().catch((err) => {
  process.stderr.write(
    `[kb-skills-mcp] 启动失败: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

// ─── 公共 API 导出（供程序化使用）────────────────────────────────────────────
export { createKbSkillsServer } from "./server.js";
export { loadMcpContext } from "./context.js";
export { ScanCache } from "./cache.js";
export type { McpContext } from "./context.js";
