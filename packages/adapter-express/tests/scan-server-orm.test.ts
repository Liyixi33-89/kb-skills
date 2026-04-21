import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createExpressAdapter from "../src/index";

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

describe("adapter-express scanServer ORM routing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-express-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("defaults to mongoose when no ORM dep is declared", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { express: "^4.21.0" },
    });
    await writeText(
      path.join(tmp, "src", "models", "user.ts"),
      `import { Schema } from "mongoose";\n` +
        `const UserSchema = new Schema({ email: { type: String, unique: true } });\n` +
        `export const User = mongoose.model("User", UserSchema);\n`,
    );

    const adapter = createExpressAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("express");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("mongoose");
  });

  it("routes to Prisma scanner when @prisma/client is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { express: "^4.21.0", "@prisma/client": "^5.0.0" },
    });
    await writeText(
      path.join(tmp, "prisma", "schema.prisma"),
      `model Account {\n  id Int @id @default(autoincrement())\n  username String @unique @db.VarChar(64)\n}\n`,
    );

    const adapter = createExpressAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("express");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("prisma");

    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
      fields: Array<{ name: string; length?: number; unique?: boolean }>;
    }>;
    expect(models).toHaveLength(1);
    expect(models[0]!.name).toBe("Account");
    const username = models[0]!.fields.find((f) => f.name === "username")!;
    expect(username.unique).toBe(true);
    expect(username.length).toBe(64);
  });

  it("routes to TypeORM scanner when typeorm is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { express: "^4.21.0", typeorm: "^0.3.0" },
    });
    await writeText(
      path.join(tmp, "src", "entity", "post.ts"),
      `import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";\n\n` +
        `@Entity({ name: "posts" })\nexport class Post {\n` +
        `  @PrimaryGeneratedColumn() id!: number;\n` +
        `  @Column() userId!: number;\n` +
        `  @ManyToOne(() => User)\n  @JoinColumn({ name: "userId" })\n  user!: User;\n` +
        `}\n`,
    );

    const adapter = createExpressAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("express");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("typeorm");

    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
      tableName?: string;
      fields: Array<{
        name: string;
        relation?: { kind: string; target: string; foreignKey?: string };
      }>;
    }>;
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "Post",
      orm: "typeorm",
      tableName: "posts",
    });
    const user = models[0]!.fields.find((f) => f.name === "user")!;
    expect(user.relation).toMatchObject({
      kind: "many-to-one",
      target: "User",
      foreignKey: "userId",
    });
  });

  it("routes to Sequelize scanner when sequelize-typescript is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "api",
      dependencies: { express: "^4.21.0", "sequelize-typescript": "^2.0.0" },
    });
    await writeText(
      path.join(tmp, "src", "models", "user.ts"),
      `import { Table, Column, Model, PrimaryKey, AutoIncrement, Unique, DataType } from "sequelize-typescript";\n\n` +
        `@Table({ tableName: "users" })\n` +
        `export class User extends Model<User> {\n` +
        `  @PrimaryKey\n  @AutoIncrement\n  @Column\n  id!: number;\n\n` +
        `  @Unique\n  @Column(DataType.STRING(255))\n  email!: string;\n` +
        `}\n`,
    );

    const adapter = createExpressAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("express");
    // @ts-expect-error backend raw has orm
    expect(mod.raw?.orm).toBe("sequelize");

    const models = (mod.raw && "models" in mod.raw ? mod.raw.models : []) as Array<{
      name: string;
      orm?: string;
      tableName?: string;
      fields: Array<{ name: string; primary?: boolean; autoIncrement?: boolean; length?: number; unique?: boolean; type?: string }>;
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
    expect(email.type).toBe("STRING");
    expect(email.length).toBe(255);
    expect(email.unique).toBe(true);
  });
});
