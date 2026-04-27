# kb-skills 升级路线图（RAG → RAG + OAG）

> **文档版本**：v1.5.0 · 更新时间：2026-04-27  
> **当前版本**：`@kb-skills/core@1.5.0` · `@kb-skills/mcp-server@1.5.0`  
> **目标版本**：`v2.0.0`（三期迭代完成后发布）

---

## 背景与目标

### 现状

`kb-skills` 当前是一套 **静态 RAG 变体** 系统：

```
代码扫描（adapter-*）→ 生成 KB Markdown 文件 → AI 通过 MCP Tools 读取 → 回答问题
```

MCP Server 已注册 **8 个 Tools**：

| Tool | 功能 |
|------|------|
| `search_symbol` | 按名称/类型/模块搜索符号 |
| `get_module_map` | 获取项目模块全景 |
| `get_route_detail` | 按路由路径查找详情 |
| `get_kb_file` | 直接读取 KB 文件内容 |
| `list_skills` | 列出所有内置 Skills |
| `get_skill` | 获取指定 Skill 的完整内容 |
| `get_kb_status` | 查看 KB 覆盖率状态 |
| `run_scan` | 触发重新扫描项目代码 |

### 升级目标

| 阶段 | 目标 | 核心价值 |
|------|------|----------|
| **第一期** | 强化现有 RAG | 让 AI 检索更精准、KB 更新更及时 |
| **第二期** | 引入 OAG 能力 | 让 AI 能多步骤推理、分析依赖链 |
| **第三期** | 接入外部资源 | 让 AI 能跨越本地代码，联动外部系统 |

---

## 第一期：强化现有 RAG ✅ 已完成（v1.1.0）

> **里程碑**：`v1.1.0` · **发布时间**：2026-04-27  
> **核心目标**：解决当前 KB 文件"全量重扫慢"、"检索靠关键词不够智能"、"元数据不结构化"三大痛点

### Task 1.1：增量扫描 + 文件 Hash 缓存

**问题**：当前 `run_scan` 每次都全量重扫所有模块，大型项目耗时长。

**涉及文件**：
- `packages/core/src/` — 新增 `incremental-scanner.ts`
- `packages/mcp-server/src/tools/run-scan.ts` — 支持增量模式参数
- `packages/mcp-server/src/cache.ts` — 扩展缓存结构，存储文件 hash

**具体任务**：

- [x] **1.1.1** 在 `packages/core/src/` 新增 `incremental-scanner.ts`
  - 遍历模块目录，计算每个源文件的 `sha256` hash
  - 与上次扫描结果（存储在 `.kb-skills/scan-cache.json`）对比
  - 只对 hash 变更的文件所在模块触发重扫
  - 输出：`{ changed: string[], unchanged: string[], newFiles: string[] }`

- [x] **1.1.2** 扩展 `ScanCache`（`packages/mcp-server/src/cache.ts`）
  - 新增 `fileHashMap: Map<string, string>` 字段
  - 新增 `lastIncrementalAt: string` 时间戳
  - 持久化到 `.kb-skills/scan-cache.json`

- [x] **1.1.3** 升级 `run_scan` Tool 参数
  ```typescript
  // 新增 mode 参数
  {
    force: z.boolean().optional().default(false),
    mode: z.enum(["full", "incremental"]).optional().default("incremental"),
  }
  ```

- [x] **1.1.4** 新增 `watch_mode` Tool（可选，CLI 触发）
  - 基于 `chokidar` 监听 `src/` 目录变更
  - debounce 2000ms 后自动触发增量扫描
  - 通过 MCP 通知推送扫描完成事件

**验收标准**：
- 第二次扫描（无变更）耗时 < 200ms
- 只有变更文件所在模块被重扫
- `scan-cache.json` 正确记录 hash 信息

---

### Task 1.2：KB 文件 YAML Front Matter 语义增强

**问题**：当前 KB 文件是纯 Markdown 描述，AI 需要"读懂"才能提取依赖关系，效率低。

**涉及文件**：
- `packages/core/src/kb-writer.ts` — 在生成 KB 文件时注入 Front Matter
- `packages/core/src/types.ts` — 新增 `KbFileMeta` 接口

**具体任务**：

- [x] **1.2.1** 在 `packages/core/src/types.ts` 新增 `KbFileMeta` 接口
  ```typescript
  export interface KbFileMeta {
    symbol: string;           // 符号名称
    kind: SymbolKind;         // 符号类型
    file: string;             // 源文件相对路径
    module: string;           // 所属模块
    dependencies: string[];   // 直接依赖的符号名称列表
    calledBy: string[];       // 被哪些符号调用
    exports: string[];        // 导出的内容
    updatedAt: string;        // 最后更新时间
  }
  ```

- [x] **1.2.2** 修改 `packages/core/src/kb-writer.ts`
  - 在每个 KB 文件头部注入 YAML Front Matter
  - 从 `KoaServiceFile.dependencies`、`KoaRouteFile.endpoints` 等字段提取依赖信息
  - 示例输出：
    ```markdown
    ---
    symbol: UserService
    kind: service
    file: src/services/user.service.ts
    module: server
    dependencies: [UserModel, EmailService, CacheService]
    calledBy: [UserController, AuthService]
    exports: [createUser, getUserById, updateUser]
    updatedAt: 2026-04-27T14:00:00Z
    ---
    ## UserService
    ...
    ```

- [x] **1.2.3** 新增 `parse_kb_meta` 工具函数（`packages/core/src/utils/kb-meta.ts`）
  - 解析 KB 文件的 YAML Front Matter
  - 供 MCP Tools 快速提取元数据，无需全文解析

**验收标准**：
- 所有新生成的 KB 文件包含合法的 YAML Front Matter
- `parse_kb_meta` 能正确解析并返回 `KbFileMeta` 对象
- 旧格式 KB 文件（无 Front Matter）不报错，降级处理

---

### Task 1.3：本地语义搜索 Tool（`search_semantic`）

**问题**：当前 `search_symbol` 只支持关键词匹配，无法处理"找处理用户权限的服务"这类语义查询。

**涉及文件**：
- `packages/mcp-server/src/tools/` — 新增 `search-semantic.ts`
- `packages/mcp-server/src/server.ts` — 注册新 Tool
- `packages/mcp-server/package.json` — 新增依赖

**具体任务**：

- [x] **1.3.1** 调研并选型本地嵌入方案
  - 方案 A：`@xenova/transformers`（`all-MiniLM-L6-v2` 模型，~25MB，纯 JS）
  - 方案 B：`fastembed`（Rust 绑定，更快，~50MB）
  - **最终采用**：TF-IDF + 余弦相似度（无需模型文件，零依赖，完全本地）

- [x] **1.3.2** 新增 `packages/mcp-server/src/tools/search-semantic.ts`

- [x] **1.3.3** 构建向量索引（内存懒加载，`run_scan` 后自动失效重建）

- [x] **1.3.4** 在 `server.ts` 注册 `search_semantic` Tool（第 9 个 Tool）

**验收标准**：
- 查询"处理用户登录的服务"能找到 `AuthService` / `UserService`
- 首次向量化耗时 < 30s（100 个 KB 文件）
- 后续增量更新耗时 < 3s

---

### 第一期交付物 ✅

| 交付物 | 说明 | 状态 |
|--------|------|------|
| `packages/core@0.4.0` | 新增增量扫描、KB Front Matter 注入 | ✅ 已发布 |
| `packages/mcp-server@1.1.0` | 新增 `search_semantic` Tool，`run_scan` 支持增量模式 | ✅ 已发布 |
| 单元测试覆盖率 | 新增 33 个测试（共 222 个），全部通过 | ✅ |
| 文档更新 | `packages/mcp-server/README.md` 更新新 Tool 说明 | ✅ |

---

## 第二期：引入 OAG 能力 ✅ 已完成（v1.5.0）

> **里程碑**：`v1.5.0` · **发布时间**：2026-04-27  
> **核心目标**：让 AI 从"被动读文档"升级为"主动分析依赖、编排多步骤推理"

### Task 2.1：符号依赖图谱 Tool（`get_dependency_graph`）

**问题**：AI 无法回答"修改 UserModel 会影响哪些服务？"这类依赖链问题。

**涉及文件**：
- `packages/core/src/` — 新增 `dependency-graph.ts`
- `packages/mcp-server/src/tools/` — 新增 `get-dependency-graph.ts`
- `packages/mcp-server/src/server.ts` — 注册新 Tool

**具体任务**：

- [ ] **2.1.1** 新增 `packages/core/src/dependency-graph.ts`
  - 基于 `ScanResult.relations`（已有 `Relation` 类型）构建有向图
  - 支持 BFS/DFS 遍历，按深度限制返回依赖链
  - 数据结构：
    ```typescript
    export interface DependencyNode {
      symbol: string;
      kind: SymbolKind;
      file: string;
      module: string;
      children: DependencyNode[];  // 下游依赖
      parents: DependencyNode[];   // 上游调用者
    }
    ```

- [ ] **2.1.2** 新增 `packages/mcp-server/src/tools/get-dependency-graph.ts`
  ```typescript
  // Tool: get_dependency_graph
  {
    symbol: z.string(),           // 目标符号名称
    depth: z.number().default(2), // 遍历深度
    direction: z.enum(["upstream", "downstream", "both"]).default("both"),
    format: z.enum(["tree", "flat", "mermaid"]).default("tree"),
  }
  ```
  - `format: "mermaid"` 时输出 Mermaid 流程图语法，AI 可直接渲染

- [ ] **2.1.3** 扩展 `packages/core/src/types.ts`
  - 丰富 `RelationKind`：新增 `"depends-on"` | `"extends"` | `"implements"`
  - 各 adapter 在 `scan()` 时填充更完整的 `relations`

**验收标准**：
- 查询 `UserModel` 的下游依赖，能返回所有直接/间接使用它的 Service/Controller
- `format: "mermaid"` 输出合法的 Mermaid 语法
- 深度 3 以内的查询耗时 < 500ms

---

### Task 2.2：跨模块关联查询 Tool（`find_cross_module_relations`）

**问题**：AI 无法回答"后端 `/api/users` 接口被哪些前端页面调用？"这类前后端关联问题。

**涉及文件**：
- `packages/core/src/` — 新增 `cross-module-analyzer.ts`
- `packages/mcp-server/src/tools/` — 新增 `find-cross-module-relations.ts`

**具体任务**：

- [ ] **2.2.1** 新增 `packages/core/src/cross-module-analyzer.ts`
  - 分析前端 `apiFiles`（`ReactRaw.apiFiles` / `Vue3Raw.apiFiles`）中的 API 调用
  - 提取 URL 字符串（如 `"/api/users"`、`` `/api/${id}` ``）
  - 与后端 `KoaRouteFile.endpoints` 做路径匹配（支持路径参数模糊匹配）
  - 输出：`{ backendRoute, frontendCallers: Array<{ file, component, apiCall }> }`

- [ ] **2.2.2** 新增 `find_cross_module_relations` Tool
  ```typescript
  {
    apiRoute: z.string().optional(),    // 后端路由，如 /api/users
    frontendFile: z.string().optional(), // 前端文件，如 UserList.tsx
    // 至少传一个
  }
  ```

- [ ] **2.2.3** 扩展 `ReactRaw` / `Vue3Raw` 的 `apiFiles` 扫描
  - 在 `adapter-react/src/index.ts` 和 `adapter-vue3/src/index.ts` 中
  - 提取 `apiFiles` 中的 URL 常量和函数调用，存入 `TsFileInfo.extras`

**验收标准**：
- 查询 `/api/users` 能返回所有调用该接口的前端组件/页面
- 支持路径参数匹配（`/api/users/:id` 匹配 `/api/users/123`）

---

### Task 2.3：Agent Skill 工作流编排 Tool（`execute_skill_workflow`）

**问题**：当前 Skills 是静态 Markdown 提示词，AI 每次都要手动读取、理解、执行，缺乏结构化编排。

**涉及文件**：
- `packages/core/src/` — 新增 `skill-workflow.ts`
- `packages/mcp-server/src/tools/` — 新增 `execute-skill-workflow.ts`
- `packages/core/assets/skills/*/SKILL.md` — 新增 `workflow:` YAML 字段

**具体任务**：

- [ ] **2.3.1** 设计 Skill Workflow DSL（在 `SKILL.md` 的 Front Matter 中）
  ```yaml
  ---
  name: bug-fix
  description: 分析并修复 Bug
  workflow:
    steps:
      - id: locate
        tool: search_symbol
        params: { query: "{{bugKeyword}}", kind: "service" }
      - id: analyze
        tool: get_dependency_graph
        params: { symbol: "{{locate.result[0].name}}", direction: "upstream" }
      - id: suggest
        type: llm_prompt
        template: "基于以上依赖分析，给出修复建议"
  ---
  ```

- [ ] **2.3.2** 新增 `packages/core/src/skill-workflow.ts`
  - 解析 Skill YAML Front Matter 中的 `workflow` 字段
  - 执行引擎：按步骤顺序执行，支持上下文变量传递（`{{step.result}}`）
  - 支持 `tool` 类型步骤（调用 MCP Tool）和 `llm_prompt` 类型步骤（返回提示词）

- [ ] **2.3.3** 新增 `execute_skill_workflow` Tool
  ```typescript
  {
    skill: z.string(),                    // Skill 名称
    context: z.record(z.unknown()),       // 初始上下文变量
    dryRun: z.boolean().optional(),       // 只返回执行计划，不实际执行
  }
  ```

- [ ] **2.3.4** 为以下 Skills 添加 `workflow` 定义（优先级高）
  - `bug-fix` — 定位 → 分析依赖 → 生成修复建议
  - `code-review` — 扫描 → 检查规范 → 生成报告
  - `gen-backend-code` — 读取 KB → 生成符合规范的代码

**验收标准**：
- `execute_skill_workflow({ skill: "bug-fix", context: { bugKeyword: "UserService" } })` 能返回结构化的执行结果
- `dryRun: true` 时返回完整执行计划（不调用任何 Tool）

---

### Task 2.4：代码变更影响分析 Tool（`analyze_change_impact`）

**问题**：AI 在修改代码前无法评估影响范围，容易引入回归 Bug。

**涉及文件**：
- `packages/mcp-server/src/tools/` — 新增 `analyze-change-impact.ts`

**具体任务**：

- [ ] **2.4.1** 新增 `analyze_change_impact` Tool
  ```typescript
  {
    symbol: z.string(),           // 要修改的符号名称
    changeType: z.enum([
      "signature",   // 函数签名变更
      "behavior",    // 行为变更
      "delete",      // 删除
      "rename",      // 重命名
    ]),
    newSignature: z.string().optional(), // 新签名（用于 signature 类型）
  }
  ```
  - 调用 `get_dependency_graph` 获取上游调用者
  - 分析每个调用者是否受影响（基于参数类型匹配）
  - 输出：`{ impactedFiles: string[], riskLevel: "low"|"medium"|"high", suggestions: string[] }`

**验收标准**：
- 删除 `UserService.createUser` 时，能列出所有调用该方法的 Controller/Service
- `riskLevel` 评估准确率 > 70%

---

### 第二期交付物 ✅

| 交付物 | 说明 | 状态 |
|--------|------|------|
| `packages/core@1.5.0` | 新增依赖图谱、跨模块分析、Skill 工作流引擎 | ✅ 已完成 |
| `packages/mcp-server@1.5.0` | 新增 4 个 Tool（共 13 个） | ✅ 已完成 |
| `packages/adapter-react` | 扩展 API 调用提取（extras.apiUrls） | ✅ 已完成 |
| `packages/adapter-vue3` | 扩展 API 调用提取（extras.apiUrls） | ✅ 已完成 |
| Skills workflow | bug-fix / code-review / gen-backend-code 添加 workflow 定义 | ✅ 已完成 |
| 文档更新 | ROADMAP.md 更新，README 更新新 Tool 说明 | ✅ 已完成 |

---

## 第三期：接入外部资源（预计 4 周）

> **里程碑**：`v2.0.0`  
> **核心目标**：让 KB 不再局限于本地代码，接入 GitHub、Confluence、Jira 等外部系统

### Task 3.1：外部资源适配器接口设计

**涉及文件**：
- `packages/core/src/types.ts` — 新增 `ExternalResourceAdapter` 接口
- `packages/core/src/index.ts` — 导出新接口

**具体任务**：

- [ ] **3.1.1** 在 `packages/core/src/types.ts` 新增外部资源类型
  ```typescript
  export interface ExternalResource {
    id: string;
    title: string;
    content: string;        // 纯文本内容（已去除 HTML/Markdown 格式）
    url?: string;           // 原始链接
    source: string;         // 数据源标识，如 "github" | "confluence"
    metadata?: Record<string, unknown>;
    relevanceScore?: number; // 0-1，由适配器填充
    fetchedAt: string;       // ISO 时间戳
  }

  export interface ExternalResourceAdapter {
    readonly name: string;
    readonly description: string;
    isAvailable(): Promise<boolean>;  // 检查连接是否可用
    search(query: string, options?: ExternalSearchOptions): Promise<ExternalResource[]>;
    fetchById(id: string): Promise<ExternalResource | null>;
  }

  export interface ExternalSearchOptions {
    limit?: number;
    filters?: Record<string, string>;
  }
  ```

- [ ] **3.1.2** 新增 `packages/core/src/external-resource-manager.ts`
  - 管理所有已注册的 `ExternalResourceAdapter`
  - 并行查询多个适配器，合并结果
  - 按 `relevanceScore` 排序，支持去重

---

### Task 3.2：内置外部资源适配器

新建独立子包（可选安装，避免强制依赖）：

#### 3.2.1 GitHub 适配器（`packages/adapter-github/`）

- [ ] 新建 `packages/adapter-github/` 子包
- [ ] 实现 `GitHubAdapter`
  - 搜索 Issues（`GET /search/issues`）
  - 搜索 PR（`GET /search/issues?type=pr`）
  - 读取 Wiki / Discussions
  - 配置：`{ repo, token, searchScope: ["issues", "prs", "discussions"] }`
- [ ] 发布为 `@kb-skills/adapter-github`

#### 3.2.2 Confluence 适配器（`packages/adapter-confluence/`）

- [ ] 新建 `packages/adapter-confluence/` 子包
- [ ] 实现 `ConfluenceAdapter`
  - 搜索 Confluence 页面（CQL 查询）
  - 读取页面内容（HTML → 纯文本转换）
  - 配置：`{ baseUrl, token, spaceKey }`
- [ ] 发布为 `@kb-skills/adapter-confluence`

#### 3.2.3 OpenAPI/Swagger 适配器（`packages/adapter-openapi/`）

- [ ] 新建 `packages/adapter-openapi/` 子包
- [ ] 实现 `OpenApiAdapter`
  - 读取本地或远程 `openapi.json` / `swagger.yaml`
  - 解析接口定义，转换为 KB 格式
  - 配置：`{ specUrl, localPath }`
- [ ] 发布为 `@kb-skills/adapter-openapi`

---

### Task 3.3：外部资源 MCP Tools

**涉及文件**：
- `packages/mcp-server/src/tools/` — 新增 3 个 Tool 文件
- `packages/mcp-server/src/server.ts` — 注册新 Tools
- `packages/mcp-server/src/context.ts` — 扩展 `McpContext`，支持外部适配器注入

**具体任务**：

- [ ] **3.3.1** 扩展 `McpContext`（`packages/mcp-server/src/context.ts`）
  ```typescript
  export interface McpContext {
    projectRoot: string;
    kbRoot: string;
    modules: ModuleConfig[];
    externalAdapters?: ExternalResourceAdapter[]; // 新增
  }
  ```

- [ ] **3.3.2** 新增 `search_external_resources` Tool（第 14 个 Tool）
  ```typescript
  {
    query: z.string(),
    sources: z.array(z.string()).optional(), // 限定数据源，不传则查全部
    limit: z.number().default(10),
  }
  ```
  - 并行查询所有已注册的外部适配器
  - 合并结果，按相关度排序
  - 返回统一格式的 `ExternalResource[]`

- [ ] **3.3.3** 新增 `get_external_resource` Tool（第 15 个 Tool）
  ```typescript
  {
    source: z.string(), // 数据源名称
    id: z.string(),     // 资源 ID
  }
  ```
  - 获取单个外部资源的完整内容

- [ ] **3.3.4** 新增 `list_external_sources` Tool（第 16 个 Tool）
  - 列出所有已配置的外部资源适配器及其可用状态

---

### Task 3.4：配置文件升级（`kb-skills.config.ts`）

**涉及文件**：
- `packages/cli/src/` — 更新配置文件解析逻辑
- `packages/cli/templates/` — 更新配置模板

**具体任务**：

- [ ] **3.4.1** 升级配置文件 Schema，支持外部资源配置
  ```typescript
  // kb-skills.config.ts（用户项目中）
  import { defineConfig } from '@kb-skills/cli'
  import { GitHubAdapter } from '@kb-skills/adapter-github'
  import { ConfluenceAdapter } from '@kb-skills/adapter-confluence'

  export default defineConfig({
    projectRoot: '.',
    kbRoot: '.kb',
    modules: [
      { name: 'server', path: './server', adapter: 'koa' },
      { name: 'web', path: './web', adapter: 'react' },
    ],
    // 新增：外部资源配置
    externalResources: [
      new GitHubAdapter({
        repo: 'my-org/my-project',
        token: process.env.GITHUB_TOKEN,
        searchScope: ['issues', 'prs'],
      }),
      new ConfluenceAdapter({
        baseUrl: 'https://mycompany.atlassian.net/wiki',
        token: process.env.CONFLUENCE_TOKEN,
        spaceKey: 'TECH',
      }),
    ],
  })
  ```

- [ ] **3.4.2** 更新 `packages/cli/templates/` 中的配置模板文件

---

### Task 3.5：外部资源缓存策略

**涉及文件**：
- `packages/mcp-server/src/cache.ts` — 扩展缓存，支持外部资源 TTL 缓存

**具体任务**：

- [ ] **3.5.1** 新增外部资源缓存层
  - 缓存 key：`${source}:${queryHash}`
  - TTL：默认 30 分钟（可配置）
  - 持久化到 `.kb-skills/external-cache.json`
  - 支持手动清除：`run_scan({ clearExternalCache: true })`

---

### 第三期交付物

| 交付物 | 说明 |
|--------|------|
| `packages/core@2.0.0` | 新增 `ExternalResourceAdapter` 接口、`ExternalResourceManager` |
| `packages/mcp-server@2.0.0` | 新增 3 个外部资源 Tool（共 16 个） |
| `packages/adapter-github@1.0.0` | GitHub Issues/PR 适配器（新包） |
| `packages/adapter-confluence@1.0.0` | Confluence 适配器（新包） |
| `packages/adapter-openapi@1.0.0` | OpenAPI/Swagger 适配器（新包） |
| `packages/cli@2.0.0` | 配置文件支持外部资源 |
| 文档更新 | 根目录 `README.md` 全面更新，新增外部资源配置指南 |

---

## 版本规划总览

```
v1.0.x（当前）  ──→  v1.1.0（第一期）  ──→  v1.5.0（第二期）  ──→  v2.0.0（第三期）
  8 Tools              9 Tools               13 Tools              16 Tools
  静态 RAG             强化 RAG              RAG + OAG             RAG + OAG + 外部资源
```

### MCP Tools 演进

| # | Tool 名称 | 引入版本 | 类型 |
|---|-----------|----------|------|
| 1 | `search_symbol` | v1.0.0 | RAG |
| 2 | `get_module_map` | v1.0.0 | RAG |
| 3 | `get_route_detail` | v1.0.0 | RAG |
| 4 | `get_kb_file` | v1.0.0 | RAG |
| 5 | `list_skills` | v1.0.0 | Skill |
| 6 | `get_skill` | v1.0.0 | Skill |
| 7 | `get_kb_status` | v1.0.0 | 管理 |
| 8 | `run_scan` | v1.0.0 | 管理 |
| 9 | `search_semantic` | **v1.1.0** | RAG+ |
| 10 | `get_dependency_graph` | **v1.5.0** | OAG |
| 11 | `find_cross_module_relations` | **v1.5.0** | OAG |
| 12 | `execute_skill_workflow` | **v1.5.0** | OAG |
| 13 | `analyze_change_impact` | **v1.5.0** | OAG |
| 14 | `search_external_resources` | **v2.0.0** | 外部 |
| 15 | `get_external_resource` | **v2.0.0** | 外部 |
| 16 | `list_external_sources` | **v2.0.0** | 外部 |

---

## 优先级与风险评估

| 任务 | 优先级 | 难度 | 风险 | 备注 |
|------|--------|------|------|------|
| 1.1 增量扫描 | 🔴 高 | 中 | 低 | 直接提升用户体验 |
| 1.2 KB Front Matter | 🔴 高 | 低 | 低 | 为后续 OAG 打基础 |
| 1.3 语义搜索 | 🟡 中 | 高 | 中 | 依赖本地模型体积 |
| 2.1 依赖图谱 | 🔴 高 | 高 | 中 | 核心 OAG 能力 |
| 2.2 跨模块关联 | 🟡 中 | 高 | 中 | 需要 adapter 配合 |
| 2.3 Skill 工作流 | 🟡 中 | 高 | 高 | DSL 设计复杂 |
| 2.4 变更影响分析 | 🟢 低 | 中 | 低 | 基于依赖图谱实现 |
| 3.1 适配器接口 | 🔴 高 | 低 | 低 | 接口设计要稳定 |
| 3.2 GitHub 适配器 | 🟡 中 | 中 | 低 | API 限流需处理 |
| 3.2 Confluence 适配器 | 🟡 中 | 中 | 低 | 企业内网访问问题 |
| 3.3 外部资源 Tools | 🟡 中 | 低 | 低 | 依赖适配器完成 |

---

## 技术依赖清单

### 第一期新增依赖

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0",  // 本地语义嵌入
    "chokidar": "^3.6.0",               // 文件监听（watch 模式）
    "gray-matter": "^4.0.3"             // YAML Front Matter 解析
  }
}
```

### 第二期新增依赖

```json
{
  "dependencies": {
    "graphology": "^0.25.4",            // 有向图数据结构
    "graphology-traversal": "^0.3.1"    // 图遍历算法
  }
}
```

### 第三期新增依赖（各适配器包）

```json
{
  "@kb-skills/adapter-github": {
    "octokit": "^4.0.2"
  },
  "@kb-skills/adapter-confluence": {
    "node-fetch": "^3.3.2"
  },
  "@kb-skills/adapter-openapi": {
    "swagger-parser": "^10.0.3"
  }
}
```

---

*最后更新：2026-04-27 · 维护者：kb-skills team*
