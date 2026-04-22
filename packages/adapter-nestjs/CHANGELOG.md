# @kb-skills/adapter-nestjs

## 1.0.0

### Major Changes

- **Initial release** of `@kb-skills/adapter-nestjs` — NestJS scan adapter.

  **Features:**
  - `detect()`: recognises NestJS projects via `@nestjs/core` / `@nestjs/common` / `@nestjs/platform-express` / `@nestjs/platform-fastify` in `package.json`
  - **Controller scanning** (`*.controller.ts`): extracts `@Controller('prefix')` + HTTP method decorators (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@All`, etc.) → `NestControllerFile` with full endpoint list including handler names and `@UseGuards` names
  - **Service scanning** (`*.service.ts`): extracts exported class names and import dependencies
  - **Guard scanning** (`*.guard.ts`): extracts exported guard class names
  - **Interceptor scanning** (`*.interceptor.ts`): extracts exported interceptor class names
  - **Pipe scanning** (`*.pipe.ts`): extracts exported pipe class names
  - **Filter scanning** (`*.filter.ts`): extracts exported filter class names
  - **DTO scanning** (`*.dto.ts`): extracts class names and field definitions
  - **Module scanning** (`*.module.ts`): extracts `imports`, `controllers`, `providers`, `exports` arrays from `@Module()` decorator
  - **ORM routing**: automatically selects the correct scanner based on `package.json` deps:
    - `@prisma/client` → Prisma schema scanner
    - `typeorm` → TypeORM entity scanner
    - `sequelize-typescript` → Sequelize model scanner
    - `@nestjs/mongoose` / `mongoose` → Mongoose schema scanner (supports `*.schema.ts` files)
  - **Recursive file scanning**: all pattern-based scanners walk the full `src/` tree (not just top-level)
  - **`NestRaw` payload** emitted as `ModuleInfo.raw` — consumed by `kb-writer` to generate a 7-layer NestJS KB
  - All NestJS types (`NestRaw`, `NestControllerFile`, etc.) are defined in `@kb-skills/core` and re-exported from this package
