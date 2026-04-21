import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createKoaAdapter from "../src/index";

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

describe("adapter-koa scanServer ORM routing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-koa-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("defaults to mongoose and scans src/models when no ORM dep is found", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { koa: "^2.15.0" },
    });
    await writeText(
      path.join(tmp, "src", "models", "user.ts"),
      `import { Schema } from "mongoose";\n` +
        `const UserSchema = new Schema({ name: { type: String, required: true } });\n` +
        `export const User = mongoose.model("User", UserSchema);\n`,
    );

    const adapter = createKoaAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("koa");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("mongoose");
    expect(mod.raw && "models" in mod.raw && mod.raw.models.length).toBe(1);
  });

  it("routes to Prisma scanner and populates raw.models from schema.prisma", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { koa: "^2.15.0", "@prisma/client": "^5.0.0" },
      devDependencies: { prisma: "^5.0.0" },
    });
    await writeText(
      path.join(tmp, "prisma", "schema.prisma"),
      `model User {\n  id Int @id @default(autoincrement())\n  email String @unique\n}\n` +
        `model Post {\n  id Int @id\n  userId Int\n  user User @relation(fields: [userId], references: [id])\n}\n`,
    );
    // Intentionally leave src/models empty to prove Prisma path is used.

    const adapter = createKoaAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("koa");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("prisma");
    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
    }>;
    expect(models.map((m) => m.name).sort()).toEqual(["Post", "User"]);
    expect(models.every((m) => m.orm === "prisma")).toBe(true);

    const modelSymbols = mod.symbols.filter((s) => s.kind === "model");
    expect(modelSymbols.map((s) => s.name).sort()).toEqual(["Post", "User"]);
  });

  it("routes to TypeORM scanner and populates raw.models from src/entities/**.ts", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { koa: "^2.15.0", typeorm: "^0.3.0" },
    });
    await writeText(
      path.join(tmp, "src", "entities", "user.ts"),
      `import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";\n\n` +
        `@Entity("users")\nexport class User {\n` +
        `  @PrimaryGeneratedColumn() id!: number;\n` +
        `  @Column({ length: 255, unique: true }) email!: string;\n` +
        `}\n`,
    );

    const adapter = createKoaAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("koa");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("typeorm");
    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
      tableName?: string;
      fields: Array<{ name: string; primary?: boolean; length?: number; unique?: boolean }>;
    }>;
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "User",
      orm: "typeorm",
      tableName: "users",
    });
    const email = models[0]!.fields.find((f) => f.name === "email")!;
    expect(email.length).toBe(255);
    expect(email.unique).toBe(true);

    const modelSymbols = mod.symbols.filter((s) => s.kind === "model");
    expect(modelSymbols.map((s) => s.name)).toEqual(["User"]);
  });

  it("routes to Sequelize scanner and populates raw.models from src/models/**.ts", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { koa: "^2.15.0", sequelize: "^6.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "models", "user.ts"),
      `import { DataTypes, Model } from "sequelize";\n\n` +
        `class User extends Model {}\n` +
        `User.init({\n` +
        `  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },\n` +
        `  email: { type: DataTypes.STRING(255), unique: true, allowNull: false },\n` +
        `}, { sequelize, tableName: "users" });\n` +
        `export default User;\n`,
    );

    const adapter = createKoaAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("koa");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("sequelize");
    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
      tableName?: string;
      fields: Array<{ name: string; primary?: boolean; autoIncrement?: boolean; length?: number; unique?: boolean }>;
    }>;
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "User",
      orm: "sequelize",
      tableName: "users",
    });
    const id = models[0]!.fields.find((f) => f.name === "id")!;
    expect(id.primary).toBe(true);
    expect(id.autoIncrement).toBe(true);
    const email = models[0]!.fields.find((f) => f.name === "email")!;
    expect(email.length).toBe(255);
    expect(email.unique).toBe(true);

    const modelSymbols = mod.symbols.filter((s) => s.kind === "model");
    expect(modelSymbols.map((s) => s.name)).toEqual(["User"]);
  });
});
