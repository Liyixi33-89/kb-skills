# @kb-skills/adapter-nestjs

[English](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/adapter-nestjs/README.md) | **中文**

> [kb-skills](https://github.com/your-org/kb-skills) 的 NestJS 扫描适配器。

从 NestJS 项目中提取控制器、服务、守卫、拦截器、管道、过滤器、DTO 和模块，并输出结构化的 `NestRaw` 数据，供 `kb-writer` 生成知识库。

## 支持的 ORM

| ORM | 检测方式 |
|-----|-----------|
| Mongoose | 依赖中包含 `@nestjs/mongoose` / `mongoose` |
| Prisma | 依赖中包含 `@prisma/client` |
| TypeORM | 依赖中包含 `typeorm` |
| Sequelize | 依赖中包含 `sequelize-typescript` |

## 安装

```bash
pnpm add @kb-skills/adapter-nestjs
```

## 使用方式

```ts
import { createNestAdapter } from '@kb-skills/adapter-nestjs';

const adapter = createNestAdapter({ moduleName: 'server' });

// 检测项目是否为 NestJS
const isNest = await adapter.detect('/path/to/project');

// 扫描并获取 ModuleInfo
const moduleInfo = await adapter.scan('/path/to/project');
console.log(moduleInfo.raw); // NestRaw
```

## `kb-skills.config.ts` 示例

```ts
import { createNestAdapter } from '@kb-skills/adapter-nestjs';

export default {
  modules: [
    {
      name: 'server',
      path: './server',
      adapter: createNestAdapter(),
    },
  ],
};
```

## 扫描产物

| 文件模式 | 提取内容 |
|---|---|
| `*.controller.ts` | `NestControllerFile` — 路由前缀 + HTTP 端点 |
| `*.service.ts` | `NestServiceFile` — 导出类名 + 依赖 |
| `*.guard.ts` | `NestProviderFile`（kind: guard） |
| `*.interceptor.ts` | `NestProviderFile`（kind: interceptor） |
| `*.pipe.ts` | `NestProviderFile`（kind: pipe） |
| `*.filter.ts` | `NestProviderFile`（kind: filter） |
| `*.dto.ts` | `NestDtoFile` — 类名 + 字段 |
| `*.module.ts` | `NestModuleFile` — imports / controllers / providers / exports |
| `*.schema.ts` | Mongoose Schema（ORM = mongoose 时） |
| `prisma/schema.prisma` | Prisma 模型（ORM = prisma 时） |
| `src/entity/**/*.ts` | TypeORM 实体（ORM = typeorm 时） |
| `src/models/**/*.ts` | Sequelize 模型（ORM = sequelize 时） |

## 项目目录约定

```
src/
├── main.ts                  ← 入口文件
├── app.module.ts
├── users/
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── users.module.ts
│   ├── dto/
│   │   └── create-user.dto.ts
│   └── entities/
│       └── user.entity.ts   ← TypeORM / Sequelize
└── auth/
    ├── auth.guard.ts
    └── jwt.interceptor.ts
```

## 许可证

MIT
