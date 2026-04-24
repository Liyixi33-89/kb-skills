/**
 * transport.ts — 传输层选择
 *
 * 支持两种传输方式：
 *   - stdio（默认）：给 Cursor / Claude Desktop / Windsurf 使用
 *   - HTTP：给 CI / 其他 HTTP 客户端使用（--http --port <n>）
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─── stdio transport ──────────────────────────────────────────────────────────

export const connectStdio = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio 模式下不输出到 stdout（会污染 MCP 协议流），只写 stderr
  process.stderr.write("[kb-skills-mcp] stdio transport ready\n");
};

// ─── HTTP transport ───────────────────────────────────────────────────────────

export const connectHttp = async (
  server: McpServer,
  port: number,
): Promise<void> => {
  // 动态导入，避免在 stdio 模式下引入不必要的 HTTP 依赖
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { createServer } = await import("node:http");

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless 模式
  });

  const httpServer = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      await transport.handleRequest(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "kb-skills-mcp" }));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await server.connect(transport);

  httpServer.listen(port, () => {
    process.stderr.write(
      `[kb-skills-mcp] HTTP transport ready on http://localhost:${port}/mcp\n`,
    );
  });
};
