# @kb-skills/adapter-nestjs

**English** | [中文](./README.zh-CN.md)

> NestJS scan adapter for [kb-skills](https://github.com/your-org/kb-skills).

Extracts controllers, services, guards, interceptors, pipes, filters, DTOs, and modules from a NestJS project and emits a structured `NestRaw` payload that `kb-writer` uses to generate a knowledge-base.

## Supported ORMs

| ORM | Detection |
|-----|-----------|
| Mongoose | `@nestjs/mongoose` / `mongoose` in deps |
| Prisma | `@prisma/client` in deps |
| TypeORM | `typeorm` in deps |
| Sequelize | `sequelize-typescript` in deps |

## Installation

```bash
pnpm add @kb-skills/adapter-nestjs
```

## Usage

```ts
import { createNestAdapter } from '@kb-skills/adapter-nestjs';

const adapter = createNestAdapter({ moduleName: 'server' });

// Detect whether the project is NestJS
const isNest = await adapter.detect('/path/to/project');

// Scan and get ModuleInfo
const moduleInfo = await adapter.scan('/path/to/project');
console.log(moduleInfo.raw); // NestRaw
```

## `kb-skills.config.ts` example

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

## Scanned artefacts

| File pattern | Extracted as |
|---|---|
| `*.controller.ts` | `NestControllerFile` — prefix + HTTP endpoints |
| `*.service.ts` | `NestServiceFile` — exported class names + deps |
| `*.guard.ts` | `NestProviderFile` (kind: guard) |
| `*.interceptor.ts` | `NestProviderFile` (kind: interceptor) |
| `*.pipe.ts` | `NestProviderFile` (kind: pipe) |
| `*.filter.ts` | `NestProviderFile` (kind: filter) |
| `*.dto.ts` | `NestDtoFile` — class names + fields |
| `*.module.ts` | `NestModuleFile` — imports / controllers / providers / exports |
| `*.schema.ts` | Mongoose schema (when ORM = mongoose) |
| `prisma/schema.prisma` | Prisma models (when ORM = prisma) |
| `src/entity/**/*.ts` | TypeORM entities (when ORM = typeorm) |
| `src/models/**/*.ts` | Sequelize models (when ORM = sequelize) |

## Project layout convention

```
src/
├── main.ts                  ← entry point
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

## License

MIT
