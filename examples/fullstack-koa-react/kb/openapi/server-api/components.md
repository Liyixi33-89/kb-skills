# Schema 组件定义

共 4 个 Schema 组件

## User

用户实体（Mongoose User model）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | `string` | — | MongoDB ObjectId |
| name | `string` | ✅ | 用户名 |
| email | `string` | ✅ | 邮箱（唯一） |
| role | `"admin" | "user"` | — | 用户角色 |
| createdAt | `string` | — | 创建时间 |

## CreateUserDto

创建用户请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | `string` | ✅ | 用户名 |
| email | `string` | ✅ | 邮箱 |
| role | `"admin" | "user"` | — | 用户角色（可选，默认 user） |

## UpdateUserDto

更新用户请求体（所有字段可选）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | `string` | — | — |
| email | `string` | — | — |
| role | `"admin" | "user"` | — | 枚举: admin, user |

## ErrorResponse

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| error | `string` | — | 错误信息 |

