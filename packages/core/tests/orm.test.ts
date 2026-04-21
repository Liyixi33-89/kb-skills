import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectOrm,
  parsePrismaSchema,
  scanPrismaSchemaFile,
} from "../src/utils/orm";

describe("detectOrm", () => {
  it("returns mongoose when mongoose is a direct dep", () => {
    expect(detectOrm({ mongoose: "^8.0.0" })).toBe("mongoose");
  });

  it("returns prisma for both prisma and @prisma/client hints", () => {
    expect(detectOrm({ prisma: "^5.0.0" })).toBe("prisma");
    expect(detectOrm({ "@prisma/client": "^5.0.0" })).toBe("prisma");
  });

  it("returns typeorm / sequelize correctly", () => {
    expect(detectOrm({ typeorm: "^0.3.0" })).toBe("typeorm");
    expect(detectOrm({ sequelize: "^6.0.0" })).toBe("sequelize");
    expect(detectOrm({ "sequelize-typescript": "^2.0.0" })).toBe("sequelize");
  });

  it("returns null when no ORM dep is present", () => {
    expect(detectOrm({ lodash: "^4.0.0" })).toBeNull();
    expect(detectOrm({})).toBeNull();
  });

  it("prefers mongoose when multiple ORMs coexist", () => {
    // Deterministic priority: mongoose > prisma > typeorm > sequelize.
    expect(detectOrm({ mongoose: "x", prisma: "y" })).toBe("mongoose");
  });
});

describe("parsePrismaSchema", () => {
  it("parses a minimal User model with @id / @unique / @default", () => {
    const schema = `
      model User {
        id        Int      @id @default(autoincrement())
        email     String   @unique @db.VarChar(255)
        name      String?
        createdAt DateTime @default(now())
      }
    `;
    const models = parsePrismaSchema(schema, "prisma/schema.prisma");
    expect(models).toHaveLength(1);

    const user = models[0]!;
    expect(user.name).toBe("User");
    expect(user.orm).toBe("prisma");
    expect(user.relPath).toBe("prisma/schema.prisma");

    const byName = Object.fromEntries(user.fields.map((f) => [f.name, f]));

    expect(byName.id).toMatchObject({
      name: "id",
      type: "Int",
      primary: true,
      autoIncrement: true,
    });

    expect(byName.email).toMatchObject({
      name: "email",
      type: "String",
      unique: true,
      length: 255,
      nullable: false,
    });

    expect(byName.name).toMatchObject({
      name: "name",
      type: "String",
      nullable: true,
    });

    expect(byName.createdAt).toMatchObject({
      name: "createdAt",
      type: "DateTime",
      default: "now()",
    });
  });

  it("parses relations and @@map table name", () => {
    const schema = `
      model Post {
        id      Int   @id @default(autoincrement())
        userId  Int
        user    User  @relation(fields: [userId], references: [id])
        tags    Tag[]

        @@map("posts")
      }
      model User {
        id    Int    @id
        posts Post[]
      }
    `;
    const models = parsePrismaSchema(schema, "prisma/schema.prisma");
    expect(models).toHaveLength(2);

    const post = models.find((m) => m.name === "Post")!;
    expect(post.tableName).toBe("posts");

    const byName = Object.fromEntries(post.fields.map((f) => [f.name, f]));

    expect(byName.user).toMatchObject({
      name: "user",
      type: "User",
      relation: {
        kind: "many-to-one",
        target: "User",
        foreignKey: "userId",
      },
    });

    expect(byName.tags).toMatchObject({
      name: "tags",
      type: "Tag",
      relation: { kind: "one-to-many", target: "Tag" },
    });

    const user = models.find((m) => m.name === "User")!;
    expect(user.fields.find((f) => f.name === "posts")?.relation).toMatchObject({
      kind: "one-to-many",
      target: "Post",
    });
  });

  it("parses @db.Decimal(p, s) precision & scale and @map column", () => {
    const schema = `
      model Product {
        id      Int      @id @default(autoincrement())
        price   Decimal  @db.Decimal(10, 2)
        sku     String   @map("stock_keeping_unit")
      }
    `;
    const [product] = parsePrismaSchema(schema, "prisma/schema.prisma");
    const byName = Object.fromEntries(product!.fields.map((f) => [f.name, f]));
    expect(byName.price).toMatchObject({ precision: 10, scale: 2 });
    expect(byName.sku).toMatchObject({ columnName: "stock_keeping_unit" });
  });

  it("returns empty array when content has no models", () => {
    expect(parsePrismaSchema("// just a comment\n", "x")).toEqual([]);
  });
});

describe("scanPrismaSchemaFile", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-prisma-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns [] when prisma/schema.prisma is missing", async () => {
    const models = await scanPrismaSchemaFile(tmp);
    expect(models).toEqual([]);
  });

  it("reads prisma/schema.prisma from disk and parses it", async () => {
    await mkdir(path.join(tmp, "prisma"), { recursive: true });
    await writeFile(
      path.join(tmp, "prisma", "schema.prisma"),
      `model User {\n  id Int @id @default(autoincrement())\n  email String @unique\n}\n`,
      "utf8",
    );

    const models = await scanPrismaSchemaFile(tmp);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "User",
      orm: "prisma",
      relPath: "prisma/schema.prisma",
    });
  });
});
