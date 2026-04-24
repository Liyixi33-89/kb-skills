# @kb-skills/mcp-server

## 1.1.0

### Minor Changes

- feat: 新增 @kb-skills/mcp-server 包

  将 kb-skills 知识库通过 MCP（Model Context Protocol）协议暴露给 AI 编码助手（Cursor / Claude Desktop / Windsurf）。

  **新增 8 个 MCP Tools：**
  - `search_symbol` — 按名称/类型/模块搜索符号（路由、服务、组件、Model 等）
  - `get_module_map` — 获取项目模块全景（含 `00_project_map.md` 内容）
  - `get_route_detail` — 按路由路径查找 KB 文档和源码位置
  - `get_kb_file` — 直接读取任意 KB 文件内容
  - `list_skills` — 列出所有内置 Skills
  - `get_skill` — 获取指定 Skill 的完整提示词
  - `get_kb_status` — 查看 KB 覆盖率和验证报告
  - `run_scan` — 触发重新扫描，刷新缓存

  **特性：**
  - 支持 stdio（Cursor / Claude Desktop）和 HTTP 两种传输方式
  - 内置 ScanResult 内存缓存（TTL 30 分钟，可通过 `KB_SKILLS_CACHE_TTL_MS` 环境变量覆盖）
  - 懒加载：启动时不扫描，首次 Tool 调用时触发
  - 使用 `jiti` 直接加载 `kb-skills.config.ts`，无需预编译
