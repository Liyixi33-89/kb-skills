# Mongoose Model 索引

## Model 总览

| # | Model 名 | 文件 | 接口数 | 字段数 | 说明 |
|---|---------|------|--------|--------|------|
| 1 | user | models/user.ts | 1 | 4 | — |

## Model 详情

### user

**文件**: server/src/models/user.ts

**接口 `IUser`**:

| 字段 | 类型 | 可选 |
|------|------|------|
| name | string | — |
| email | string | — |
| role | string | — |
| createdAt | Date | ✅ |

**Schema 字段**:

| 字段 | 类型 | 必填 | 唯一 | 关联 | 默认值 |
|------|------|------|------|------|--------|
| name | String | ✅ | — | — | — |
| email | String | ✅ | ✅ | — | — |
| role | String | — | — | — | "user" |
| createdAt | Date | — | — | — | Date.now |

