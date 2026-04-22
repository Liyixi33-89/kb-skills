import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createNestAdapter from "../src/index";

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

describe("adapter-nestjs — controller scanning", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("detects a NestJS project via @nestjs/core", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", "@nestjs/common": "^10.0.0" },
    });
    const adapter = createNestAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("does not detect a non-NestJS project", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { express: "^4.21.0" },
    });
    const adapter = createNestAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("extracts routes from a controller with prefix", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", "@nestjs/common": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "users.controller.ts"),
      `import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("nestjs");
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.controllers).toHaveLength(1);
    expect(raw.controllers[0]!.prefix).toBe("users");
    expect(raw.controllers[0]!.endpoints).toHaveLength(3);

    const methods = raw.controllers[0]!.endpoints.map((e) => e.method);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");

    const paths = raw.controllers[0]!.endpoints.map((e) => e.path);
    expect(paths).toContain("/users");
    expect(paths).toContain("/users/:id");
  });

  it("extracts routes from a controller without prefix", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "health.controller.ts"),
      `import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  check() {
    return { status: 'ok' };
  }
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.controllers[0]!.prefix).toBe("");
    expect(raw.controllers[0]!.endpoints[0]!.path).toBe("/health");
  });

  it("emits route symbols in flattenToSymbols", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "posts.controller.ts"),
      `import { Controller, Get, Delete } from '@nestjs/common';

@Controller('posts')
export class PostsController {
  @Get()
  findAll() {}

  @Delete(':id')
  remove() {}
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const routeSymbols = mod.symbols.filter((s) => s.kind === "route");
    expect(routeSymbols).toHaveLength(2);
    expect(routeSymbols[0]!.framework).toBe("nestjs");
  });
});

describe("adapter-nestjs — service scanning", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-svc-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts exported class from a service file", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "users.service.ts"),
      `import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  findAll() { return []; }
  findOne(id: number) { return null; }
  create(dto: any) { return dto; }
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.services).toHaveLength(1);
    expect(raw.services[0]!.exports).toContain("UsersService");

    const svcSymbols = mod.symbols.filter((s) => s.kind === "service");
    expect(svcSymbols).toHaveLength(1);
    expect(svcSymbols[0]!.name).toBe("UsersService");
  });
});

describe("adapter-nestjs — guard / interceptor / pipe / filter scanning", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-prov-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans guard files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "auth.guard.ts"),
      `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.guards).toHaveLength(1);
    expect(raw.guards[0]!.providerKind).toBe("guard");
    expect(raw.guards[0]!.exports).toContain("AuthGuard");

    const mwSymbols = mod.symbols.filter((s) => s.kind === "middleware");
    expect(mwSymbols.some((s) => s.name === "AuthGuard")).toBe(true);
  });

  it("scans interceptor files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "logging.interceptor.ts"),
      `import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();
  }
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.interceptors).toHaveLength(1);
    expect(raw.interceptors[0]!.exports).toContain("LoggingInterceptor");
  });
});

describe("adapter-nestjs — DTO scanning", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-dto-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts DTO class names and fields", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "create-user.dto.ts"),
      `import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.dtos).toHaveLength(1);
    expect(raw.dtos[0]!.classes).toContain("CreateUserDto");

    const typeSymbols = mod.symbols.filter((s) => s.kind === "type");
    expect(typeSymbols.some((s) => s.name === "CreateUserDto")).toBe(true);
  });
});

describe("adapter-nestjs — module scanning", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-mod-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts module metadata", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "users.module.ts"),
      `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.modules).toHaveLength(1);
    expect(raw.modules[0]!.moduleName).toBe("UsersModule");
    expect(raw.modules[0]!.controllers).toContain("UsersController");
    expect(raw.modules[0]!.providers).toContain("UsersService");
    expect(raw.modules[0]!.moduleExports).toContain("UsersService");
  });
});

describe("adapter-nestjs — ORM routing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-orm-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("defaults to mongoose when no ORM dep is declared", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    expect(mod.raw?.framework).toBe("nestjs");
    // @ts-expect-error NestRaw has orm
    expect(mod.raw?.orm).toBe("mongoose");
  });

  it("routes to Prisma scanner when @prisma/client is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", "@prisma/client": "^5.0.0" },
    });
    await writeText(
      path.join(tmp, "prisma", "schema.prisma"),
      `model User {\n  id Int @id @default(autoincrement())\n  email String @unique @db.VarChar(255)\n}\n`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    // @ts-expect-error NestRaw has orm
    expect(mod.raw?.orm).toBe("prisma");

    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.models).toHaveLength(1);
    expect(raw.models[0]!.name).toBe("User");
  });

  it("routes to TypeORM scanner when typeorm is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", typeorm: "^0.3.0" },
    });
    await writeText(
      path.join(tmp, "src", "entity", "user.ts"),
      `import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";\n\n` +
        `@Entity({ name: "users" })\nexport class User {\n` +
        `  @PrimaryGeneratedColumn() id!: number;\n` +
        `  @Column() email!: string;\n` +
        `}\n`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    // @ts-expect-error NestRaw has orm
    expect(mod.raw?.orm).toBe("typeorm");

    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.models).toHaveLength(1);
    expect(raw.models[0]!.tableName).toBe("users");
  });

  it("routes to Sequelize scanner when sequelize-typescript is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", "sequelize-typescript": "^2.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "models", "user.ts"),
      `import { Table, Column, Model, PrimaryKey, AutoIncrement } from "sequelize-typescript";\n\n` +
        `@Table({ tableName: "users" })\n` +
        `export class User extends Model<User> {\n` +
        `  @PrimaryKey\n  @AutoIncrement\n  @Column\n  id!: number;\n` +
        `}\n`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    // @ts-expect-error NestRaw has orm
    expect(mod.raw?.orm).toBe("sequelize");

    const raw = mod.raw as import("../src/index").NestRaw;
    expect(raw.models).toHaveLength(1);
    expect(raw.models[0]!.tableName).toBe("users");
  });

  it("scans Mongoose schemas from *.schema.ts files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0", "@nestjs/mongoose": "^10.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "users", "user.schema.ts"),
      `import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema()
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ unique: true })
  email: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
`,
    );

    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    // @ts-expect-error NestRaw has orm
    expect(mod.raw?.orm).toBe("mongoose");
    const raw = mod.raw as import("../src/index").NestRaw;
    // schema file should be picked up
    expect(raw.models.length).toBeGreaterThanOrEqual(1);
  });
});

describe("adapter-nestjs — moduleName option", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nestjs-name-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("uses custom moduleName when provided", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    const adapter = createNestAdapter({ moduleName: "backend" });
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("backend");
  });

  it("defaults moduleName to 'server'", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { "@nestjs/core": "^10.0.0" },
    });
    const adapter = createNestAdapter();
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("server");
  });
});
