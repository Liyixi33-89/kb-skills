# users — 接口契约

**接口数**: 5

## `GET /users`

**摘要**: 获取用户列表

**operationId**: `listUsers`

### 响应

#### 200 — 成功

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | `User[]` | — | — |

---

## `POST /users`

**摘要**: 创建用户

**operationId**: `createUser`

### 请求体

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | `string` | ✅ | 用户名 |
| email | `string` | ✅ | 邮箱 |
| role | `"admin" | "user"` | — | 用户角色（可选，默认 user） |

### 响应

#### 201 — 创建成功

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | `User` | — | — |

---

## `GET /users/{id}`

**摘要**: 获取单个用户

**operationId**: `getUserById`

### 参数

| 名称 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `id` | path | `string` | ✅ | 用户 MongoDB ObjectId |

### 响应

#### 200 — 成功

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | `User` | — | — |

#### 404 — 用户不存在

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| error | `string` | — | 错误信息 |

---

## `PUT /users/{id}`

**摘要**: 更新用户

**operationId**: `updateUser`

### 参数

| 名称 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `id` | path | `string` | ✅ | 用户 MongoDB ObjectId |

### 请求体

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | `string` | — | — |
| email | `string` | — | — |
| role | `"admin" | "user"` | — | 枚举: admin, user |

### 响应

#### 200 — 更新成功

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | `User` | — | — |

#### 404 — 用户不存在

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| error | `string` | — | 错误信息 |

---

## `DELETE /users/{id}`

**摘要**: 删除用户

**operationId**: `deleteUser`

### 参数

| 名称 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `id` | path | `string` | ✅ | 用户 MongoDB ObjectId |

### 响应

#### 204 — 删除成功

#### 404 — 用户不存在

**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| error | `string` | — | 错误信息 |

---

