# @kb-skills/adapter-openapi

## 1.0.0

### Major Changes

- 首次发布 `@kb-skills/adapter-openapi`。

  **功能概述**

  解析本地 `openapi.json` / `swagger.yaml` 规范文件，将完整的接口契约（请求体、响应体、参数、Schema 组件）注入 KB，让 AI 精确知道每个接口的入参和出参结构。

  **核心能力**

  - `createOpenApiAdapter(options?)` — 工厂函数，返回符合 `kb-skills` 适配器接口的实例
  - `detect(projectRoot)` — 自动检测项目根目录下的 OpenAPI / Swagger 规范文件（支持 18 个候选路径）
  - `scan(projectRoot)` — 解析规范文件，返回 `ModuleInfo`（含 `symbols`、`raw`）
  - 可选写入 KB 文件：设置 `kbRoot` 后自动生成结构化 KB 目录

  **自动检测的规范文件路径**（按优先级）

  `openapi.json` → `openapi.yaml` → `openapi.yml` → `swagger.json` → `swagger.yaml` → `swagger.yml` → `api/openapi.json` → `docs/openapi.yaml` → `src/openapi.json` 等共 18 个候选路径

  **生成的 KB 结构**

  ```
  kb/openapi/<moduleName>/
  ├── 00_overview.md        # API 标题、版本、服务地址、统计
  ├── 01_index_paths.md     # 全量端点索引表
  ├── schemas/
  │   ├── <tag>.md          # 按 tag 分组的接口契约详情（含参数表、请求体、响应体）
  │   └── ...
  └── components.md         # Schema 组件定义
  ```

  **配置项**

  | 选项 | 类型 | 默认值 | 说明 |
  |------|------|--------|------|
  | `specFile` | `string` | 自动检测 | 规范文件路径（相对或绝对） |
  | `moduleName` | `string` | `"openapi"` | 模块名，用于 KB 目录命名 |
  | `kbRoot` | `string` | — | 设置后自动写入 KB 文件 |

  **与 OAG 工具链联动**

  扫描结果可被 `get_route_detail` 和 `find_cross_module_relations` 读取，支持 `api-diff` Skill 对比 OpenAPI 契约与前端调用点，自动生成前端同步修改清单。

  **YAML 支持**

  YAML 格式规范文件需要项目中安装 `js-yaml` 或 `yaml`（可选依赖）；JSON 格式无需额外依赖。
