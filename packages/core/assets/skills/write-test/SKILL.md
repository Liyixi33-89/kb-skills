---
name: write-test
description: "基于依赖图谱为指定符号生成精准测试用例。与 gen-test-code 不同，write-test 专注于单个符号的深度测试：通过依赖图谱自动识别 Mock 边界，通过变更影响分析确定集成测试范围，生成可直接运行的测试代码。"
triggers:
  - 写测试
  - write test
  - 为这个函数写测试
  - 为这个服务写测试
  - 补充测试
  - 测试覆盖
  - 单测
workflow:
  steps:
    - id: symbol_info
      type: tool
      tool: search_symbol
      description: 精确定位目标符号（类型、文件、导出内容）
      params:
        query: "{{targetSymbol}}"
        limit: 3
    - id: downstream
      type: tool
      tool: get_dependency_graph
      description: 获取下游依赖（这些是需要 Mock 的模块）
      params:
        symbol: "{{targetSymbol}}"
        direction: downstream
        depth: 2
        format: flat
    - id: upstream
      type: tool
      tool: get_dependency_graph
      description: 获取上游调用者（这些是集成测试需要覆盖的场景）
      params:
        symbol: "{{targetSymbol}}"
        direction: upstream
        depth: 1
        format: flat
    - id: suggest
      type: llm_prompt
      description: 生成精准测试代码
      template: |
        为 "{{targetSymbol}}" 生成精准测试用例：

        1. 符号信息（类型/文件/导出）：{{symbol_info.result}}
        2. 下游依赖（需要 Mock 的模块）：{{downstream.result}}
        3. 上游调用者（集成测试场景来源）：{{upstream.result}}

        测试策略：
        - 下游依赖列表中的每个模块都需要 Mock
        - 上游调用者决定了该符号被如何使用，据此设计测试场景
        - 覆盖：正常路径、异常路径、边界条件

        请生成：
        - 完整可运行的测试文件（含所有 import 和 Mock 配置）
        - 每个测试用例用中文描述测试意图
        - Mock 数据要真实合理（不用空对象）
        - 断言要具体（不只是 toBeTruthy）
---

# Write-Test — 基于依赖图谱的精准测试生成

## 目标

为指定的单个符号（函数、Service、组件）生成精准、可直接运行的测试用例。

**核心差异**（与 `gen-test-code` 的区别）：

| | `gen-test-code` | `write-test` |
|---|---|---|
| 输入 | 设计文档 + 源码文件 | 单个符号名称 |
| 范围 | 整个功能模块 | 单个符号深度测试 |
| Mock 策略 | 手动分析 | **依赖图谱自动识别** |
| 集成测试范围 | 基于 PRD 验收标准 | **基于上游调用者** |

**核心隐喻**：你是一个"测试外科医生"——精准定位，只为这一个符号做最完整的测试。

---

## 设计原则

1. **图谱驱动 Mock**：下游依赖图谱 = Mock 清单，不遗漏、不多余
2. **调用者驱动场景**：上游调用者的使用方式 = 测试场景来源
3. **可直接运行**：生成的测试文件包含所有 import，无需手动补充
4. **真实 Mock 数据**：Mock 数据要符合业务语义，不用 `{}` 或 `null`

---

## 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| **目标符号** | ✅ | 函数名、Service 名、组件名，如 `UserService`、`createUser` |
| **测试框架** | 否 | `jest`（后端默认）/ `vitest`（前端默认），自动从项目检测 |

## 输出

| 输出 | 说明 |
|------|------|
| 测试文件 | `__tests__/{symbol}.test.ts(x)`，可直接运行 |
| Mock 清单 | 基于依赖图谱生成的 Mock 模块列表 |
| 覆盖矩阵 | 测试场景 ↔ 上游调用者对应关系 |

---

## 编排流程

### 第 1 步：符号定位

通过 `search_symbol` 精确定位目标符号：
- 确认符号类型（service / route / component / function）
- 获取源文件路径
- 获取导出内容列表

### 第 2 步：依赖图谱分析

**下游依赖（Mock 清单）**：
```
UserService
  └── UserModel        ← Mock 这个
  └── EmailService     ← Mock 这个
  └── CacheService     ← Mock 这个
```

**上游调用者（测试场景来源）**：
```
UserController → UserService.createUser({ name, email })
AuthService    → UserService.findByEmail(email)
```

### 第 3 步：生成测试代码

#### 后端 Service 测试模板

```typescript
// __tests__/UserService.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import * as UserService from '../services/userService';

// 基于下游依赖图谱自动生成 Mock
jest.mock('../models/User');
jest.mock('../services/emailService');
jest.mock('../utils/cache');

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('UserService', () => {
  // 基于上游调用者 UserController 的使用场景
  describe('createUser', () => {
    it('正常场景：创建用户成功，返回用户对象', async () => {
      const mockUser = { _id: 'user-1', name: '张三', email: 'zhang@test.com' };
      (UserModel.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await UserService.createUser({ name: '张三', email: 'zhang@test.com' });

      expect(result).toEqual(mockUser);
      expect(UserModel.create).toHaveBeenCalledWith({ name: '张三', email: 'zhang@test.com' });
    });

    it('异常场景：邮箱已存在，抛出错误', async () => {
      (UserModel.create as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Duplicate key'), { code: 11000 })
      );

      await expect(
        UserService.createUser({ name: '张三', email: 'existing@test.com' })
      ).rejects.toThrow();
    });

    it('边界条件：name 为空字符串', async () => {
      await expect(
        UserService.createUser({ name: '', email: 'test@test.com' })
      ).rejects.toThrow();
    });
  });

  // 基于上游调用者 AuthService 的使用场景
  describe('findByEmail', () => {
    it('正常场景：找到用户，返回用户对象', async () => {
      const mockUser = { _id: 'user-1', email: 'zhang@test.com' };
      (UserModel.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await UserService.findByEmail('zhang@test.com');
      expect(result).toEqual(mockUser);
    });

    it('正常场景：用户不存在，返回 null', async () => {
      (UserModel.findOne as jest.Mock).mockResolvedValue(null);

      const result = await UserService.findByEmail('notexist@test.com');
      expect(result).toBeNull();
    });
  });
});
```

#### 前端组件测试模板

```typescript
// __tests__/UserList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import UserList from '../pages/UserList';

// 基于下游依赖图谱自动生成 Mock
vi.mock('../api/users', () => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../store/userStore', () => ({
  useUserStore: vi.fn(() => ({
    users: [],
    loading: false,
    error: null,
    loadUsers: vi.fn(),
    addUser: vi.fn(),
    removeUser: vi.fn(),
  })),
}));

describe('UserList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('正常渲染：显示页面标题', () => {
    render(<UserList />);
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('数据加载：调用 loadUsers 加载数据', async () => {
    const mockLoadUsers = vi.fn();
    vi.mocked(useUserStore).mockReturnValue({
      users: [{ _id: '1', name: '张三', email: 'zhang@test.com', role: 'user', createdAt: '' }],
      loading: false,
      error: null,
      loadUsers: mockLoadUsers,
      addUser: vi.fn(),
      removeUser: vi.fn(),
    });

    render(<UserList />);

    await waitFor(() => {
      expect(mockLoadUsers).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

## 约束

| 场景 | 处理方式 |
|------|---------|
| 符号不在 KB 中 | 提示用户先执行 `run_scan` 更新 KB |
| 下游依赖为空（孤立符号） | 无需 Mock，直接测试纯函数逻辑 |
| 上游调用者为空 | 基于函数签名推断测试场景 |
| 组件有复杂状态 | 优先测试用户可见的行为，不测试内部状态 |
| 测试框架未检测到 | 默认后端用 Jest，前端用 Vitest |
