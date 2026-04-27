---
symbol: UserList
kind: page
file: src/pages/UserList.tsx
module: web
dependencies: ["useUserStore", "UserCard", "fetchUsers", "createUser", "deleteUser"]
calledBy: []
exports: ["UserList"]
updatedAt: 2026-04-27T16:00:00Z
---
# UserList

**文件**: src/pages/UserList.tsx
**复杂度**: 简单

## 功能概述

UserList 页面。

## 状态管理

| 状态 | setter | 类型 | 初始值 |
|------|--------|------|--------|
| name | setName | — | "" |
| email | setEmail | — | "" |

## Hooks

| Hook |
|------|
| useUserStore |
| useState |
| useEffect |

## 事件处理函数

| 函数名 |
|--------|
| handleSubmit |
| handleDelete |

