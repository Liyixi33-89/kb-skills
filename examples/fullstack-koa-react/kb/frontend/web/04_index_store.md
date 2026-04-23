# Zustand Store 索引

## userStore.ts

**文件**: src/store/userStore.ts

**导出**:

| 导出名 |
|--------|
| useUserStore |

**接口 `UserStore`**:

| 字段 | 类型 | 可选 |
|------|------|------|
| users | User[] | — |
| loading | boolean | — |
| error | string | null | — |
| loadUsers | () => Promise<void> | — |
| addUser | (data: { name: string | — |
| email | string }) => Promise<void> | — |
| removeUser | (id: string) => Promise<void> | — |

