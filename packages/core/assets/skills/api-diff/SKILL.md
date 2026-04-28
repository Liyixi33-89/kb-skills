---
name: api-diff
description: "分析前后端接口变更影响，生成前端需要同步修改的清单。当后端 API 发生变更（新增字段、修改参数、删除接口）时，自动定位所有受影响的前端调用点，生成精准的同步修改方案，避免前后端不一致导致的运行时错误。"
triggers:
  - 接口变更
  - api 变更
  - api diff
  - 接口改了
  - 后端改了接口
  - 前端同步
  - 接口不一致
  - 字段变更
workflow:
  steps:
    - id: route_detail
      type: tool
      tool: get_route_detail
      description: 获取变更接口的详细信息（当前定义）
      params:
        route: "{{apiRoute}}"
    - id: callers
      type: tool
      tool: find_cross_module_relations
      description: 找出所有调用该接口的前端文件
      params:
        apiRoute: "{{apiRoute}}"
    - id: impact
      type: tool
      tool: analyze_change_impact
      description: 评估接口变更的整体影响范围和风险
      params:
        symbol: "{{apiRoute}}"
        changeType: "{{changeType}}"
    - id: sync_plan
      type: llm_prompt
      description: 生成前端同步修改方案
      template: "接口 {{apiRoute}} 发生了 {{changeType}} 变更：{{changeDesc}}。接口定义={{route_detail.result}}，前端调用点={{callers.result}}，影响评估={{impact.result}}。请生成前端同步修改方案：受影响文件清单(含具体行号/函数名)、每个文件的before/after对比、TypeScript类型变更清单、修改优先级和验证步骤"
---

# API-Diff — 接口变更影响分析

## 目标

当后端 API 发生变更时，自动分析所有受影响的前端调用点，生成精准的同步修改清单，确保前后端接口契约一致。

**核心隐喻**：你是一个"接口变更侦探"——后端改了什么，前端哪里需要跟着改，一个不漏地找出来。

---

## 设计原则

1. **全量扫描**：通过跨模块关联分析，不遗漏任何调用点
2. **精准定位**：精确到文件、函数、行级别
3. **类型同步**：TypeScript 类型定义的变更同步不能遗漏
4. **优先级排序**：按影响严重程度排序，先改最重要的

---

## 适用场景

| 变更类型 | 说明 | 示例 |
|---------|------|------|
| `signature` | 接口路径/方法变更 | `/api/users` → `/api/v2/users` |
| `behavior` | 响应结构变更 | `{ data: User }` → `{ data: User, meta: Pagination }` |
| `delete` | 接口删除 | 删除 `DELETE /api/users/:id` |
| `rename` | 字段重命名 | `userName` → `name` |

---

## 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| **apiRoute** | ✅ | 变更的接口路径，如 `/api/users` 或 `/api/users/:id` |
| **changeType** | ✅ | 变更类型：`signature` / `behavior` / `delete` / `rename` |
| **changeDesc** | ✅ | 变更描述，如"响应体新增 `pagination` 字段"、"请求参数 `userId` 改为 `id`" |

## 输出

| 输出 | 说明 |
|------|------|
| 受影响文件清单 | 所有调用该接口的前端文件 |
| 修改方案 | 每个文件的 before/after 对比 |
| 类型变更清单 | TypeScript 类型需要同步的内容 |
| 验证步骤 | 如何确认前后端已对齐 |

---

## 编排流程

### 第 1 步：获取接口定义

通过 `get_route_detail` 获取接口的当前定义：
- HTTP 方法和路径
- 中间件（鉴权要求）
- 关联的 Service

### 第 2 步：找出所有前端调用点

通过 `find_cross_module_relations` 找出所有调用该接口的前端文件：

```
GET /api/users
  ← web/src/api/users.ts (fetchUsers)
  ← web/src/store/userStore.ts (loadUsers)
  ← web/src/pages/UserList.tsx (useEffect)
```

### 第 3 步：影响范围评估

通过 `analyze_change_impact` 评估风险等级：
- `low`：只影响 1 个文件，且是 API 封装层
- `medium`：影响 2-5 个文件，包含 Store 或 Hook
- `high`：影响 5+ 个文件，或直接影响页面组件

### 第 4 步：生成同步修改方案

针对每种变更类型，生成对应的修改方案：

#### 字段重命名（`rename`）

```markdown
### 修改文件：web/src/api/users.ts

**修改前**：
```typescript
export interface User {
  userName: string;  // 旧字段名
}
```

**修改后**：
```typescript
export interface User {
  name: string;  // 新字段名（后端已改）
}
```

**影响的调用点**：
- `web/src/pages/UserList.tsx` L45: `user.userName` → `user.name`
- `web/src/components/UserCard.tsx` L12: `props.user.userName` → `props.user.name`
```

#### 响应结构变更（`behavior`）

```markdown
### 修改文件：web/src/api/users.ts

**修改前**：
```typescript
export const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch('/api/users');
  const json = await res.json() as { data: User[] };
  return json.data;
};
```

**修改后**：
```typescript
export interface UserListResponse {
  data: User[];
  pagination: { total: number; page: number; limit: number };
}

export const fetchUsers = async (): Promise<UserListResponse> => {
  const res = await fetch('/api/users');
  return res.json() as Promise<UserListResponse>;
};
```
```

### 第 5 步：输出摘要

```markdown
## 接口变更同步方案

**变更接口**：{{changeType}} {{apiRoute}}
**变更内容**：{{changeDesc}}
**风险等级**：{{riskLevel}}

### 受影响文件（共 N 个）

| 优先级 | 文件 | 修改内容 | 影响类型 |
|--------|------|---------|---------|
| 🔴 高 | web/src/api/users.ts | 修改返回类型 | 类型定义 |
| 🟡 中 | web/src/store/userStore.ts | 更新 state 结构 | Store |
| 🟢 低 | web/src/pages/UserList.tsx | 更新字段引用 | 页面 |

### TypeScript 类型变更

- [ ] `User` interface 需要同步
- [ ] API 函数返回类型需要更新

### 验证步骤

1. 修改完成后运行 `tsc --noEmit` 确认无类型错误
2. 运行前端测试 `pnpm test`
3. 启动前后端联调，验证接口调用正常
4. 检查浏览器控制台无运行时错误

建议下一步：
1. 按优先级顺序修改文件
2. 使用 `write-test` 为修改后的 API 函数补充测试
3. 执行 `doc-code-to-kb` 更新知识库
```

---

## 约束

| 场景 | 处理方式 |
|------|---------|
| 接口不在 KB 中 | 提示用户先执行 `run_scan` 更新 KB |
| 无前端调用点 | 说明该接口目前未被前端使用，变更风险为 low |
| 变更描述不清晰 | 列出可能的影响，标注 `⚠️ 需要确认` |
| 涉及多个接口变更 | 建议拆分为多次执行，每次处理一个接口 |
| 前端使用了 any 类型 | 标注 `⚠️ 类型不安全`，建议同步修复类型定义 |
