# @kb-skills/mcp-server

## 1.5.0

### Minor Changes

- feat: 新增 4 个 OAG（Orchestrated Agent Graph）Tools，MCP Server 升级至 13 个 Tools。

  **新增 Tool：`get_dependency_graph`（第 10 个）**

  查询指定符号的依赖图谱，支持上下游遍历和多种输出格式。

  ```typescript
  // 参数
  {
    symbol: string;                                    // 目标符号名称
    depth?: number;                                    // 遍历深度，默认 2
    direction?: "upstream" | "downstream" | "both";   // 遍历方向，默认 "both"
    format?: "tree" | "flat" | "mermaid";             // 输出格式，默认 "tree"
  }
  ```

  - `format: "mermaid"` 输出合法的 Mermaid 流程图语法，AI 可直接渲染
  - 基于 `@kb-skills/core` 新增的 `queryDependencyGraph` 函数
  - 未找到符号时返回友好提示，不抛出异常

  **新增 Tool：`find_cross_module_relations`（第 11 个）**

  查询前后端跨模块关联：后端路由被哪些前端文件调用，或前端文件调用了哪些后端路由。

  ```typescript
  // 参数（至少传一个）
  {
    apiRoute?: string;      // 后端路由路径，如 /api/users 或 /api/users/:id
    frontendFile?: string;  // 前端文件路径（部分匹配），如 UserList.tsx
  }
  ```

  - 支持路径参数模糊匹配（`/api/users/:id` 匹配 `/api/users/123`）
  - 基于 `adapter-react` / `adapter-vue3` 扫描的 `extras.apiUrls` 数据
  - 未找到时返回详细排查提示

  **新增 Tool：`execute_skill_workflow`（第 12 个）**

  执行 Skill 工作流，支持多步骤推理编排。工作流定义在 `SKILL.md` 的 YAML Front Matter 中。

  ```typescript
  // 参数
  {
    skill: string;                      // Skill 名称，如 bug-fix、code-review
    context?: Record<string, unknown>;  // 初始上下文变量
    dryRun?: boolean;                   // 只返回执行计划，不实际执行
  }
  ```

  - `dryRun: true` 时返回完整执行计划，不调用任何 Tool
  - 内置 Tool 路由：工作流步骤可调用 `search_symbol`、`get_dependency_graph`、`find_cross_module_relations`
  - 已为 `bug-fix`、`code-review`、`gen-backend-code` Skills 添加 `workflow` 定义

  **新增 Tool：`analyze_change_impact`（第 13 个）**

  分析修改指定符号对整个项目的影响范围，评估风险等级并给出修复建议。

  ```typescript
  // 参数
  {
    symbol: string;                                           // 要修改的符号名称
    changeType: "signature" | "behavior" | "delete" | "rename"; // 变更类型
    newSignature?: string;                                    // 新签名（signature 类型时提供）
    newName?: string;                                         // 新名称（rename 类型时提供）
  }
  ```

  - 基于 `get_dependency_graph` 获取上游调用者（depth=3）
  - 风险等级评估：`low 🟢` / `medium 🟡` / `high 🔴`
  - 针对不同变更类型生成差异化修复建议（deprecated 迁移、IDE 重命名、函数重载等）
  - 返回 `impactedFiles`（含调用距离 `depth`）、`riskLevel`、`suggestions`、`summary`

  **`@kb-skills/core` 同步升级（v1.5.0）**

  - 新增 `DependencyNode` / `DependencyGraphOptions` / `FlatDependencyItem` 类型
  - 新增 `queryDependencyGraph(scanResult, symbol, options)` 函数
  - 新增 `analyzeCrossModuleRelations(scanResult, options)` 函数
  - 新增 `executeSkillWorkflow(skill, context, options)` 函数及 Skill Workflow DSL 引擎
  - 扩展 `RelationKind`：新增 `"depends-on"` | `"extends"` | `"implements"`

  **`@kb-skills/adapter-react` / `@kb-skills/adapter-vue3` 同步升级**

  - 扩展 `apiFiles` 扫描，提取 URL 常量和函数调用，存入 `TsFileInfo.extras.apiUrls`
  - 支持模板字符串 URL 提取（如 `` `/api/${id}` ``）

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
