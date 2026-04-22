import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectOrm,
  parsePrismaSchema,
  scanPrismaSchemaFile,
  scanMongooseModel,
  parseDrizzleSchema,
  scanDrizzleSchemas,
} from "../src/utils/orm";

// ─── detectOrm ───────────────────────────────────────────────────────────────

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

  it("returns drizzle when drizzle-orm is present", () => {
    expect(detectOrm({ "drizzle-orm": "^0.30.0" })).toBe("drizzle");
  });

  it("returns null when no ORM dep is present", () => {
    expect(detectOrm({ lodash: "^4.0.0" })).toBeNull();
    expect(detectOrm({})).toBeNull();
  });

  it("prefers mongoose when multiple ORMs coexist", () => {
    // Deterministic priority: mongoose > prisma > typeorm > sequelize > drizzle.
    expect(detectOrm({ mongoose: "x", prisma: "y" })).toBe("mongoose");
    expect(detectOrm({ prisma: "x", "drizzle-orm": "y" })).toBe("prisma");
  });
});

// ─── parsePrismaSchema ────────────────────────────────────────────────────────

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

// ─── scanPrismaSchemaFile ─────────────────────────────────────────────────────

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

// ─── scanMongooseModel ────────────────────────────────────────────────────────

describe("scanMongooseModel", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-mongoose-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns null for a non-existent file", async () => {
    const result = await scanMongooseModel(path.join(tmp, "missing.ts"));
    expect(result).toBeNull();
  });

  it("parses a basic Mongoose schema with { type } style fields", async () => {
    const file = path.join(tmp, "user.ts");
    await writeFile(
      file,
      `
import mongoose from "mongoose";

export interface IUser {
  name: string;
  email: string;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, default: 0 },
  role: { type: String, enum: ["admin", "user"], default: "user" },
});

export const User = mongoose.model<IUser>("User", userSchema);
`,
      "utf8",
    );

    const result = await scanMongooseModel(file);
    expect(result).not.toBeNull();
    expect(result!.orm).toBe("mongoose");
    expect(result!.modelName).toBe("User");

    const byName = Object.fromEntries(result!.fields.map((f) => [f.name, f]));
    expect(byName.name).toMatchObject({ type: "String", required: true });
    expect(byName.email).toMatchObject({ type: "String", unique: true });
    expect(byName.age).toMatchObject({ type: "Number", default: "0" });
    expect(byName.role?.enum).toBeTruthy();
  });

  it("parses simple key: Type style fields", async () => {
    const file = path.join(tmp, "post.ts");
    await writeFile(
      file,
      `
const postSchema = new mongoose.Schema({
  title: String,
  published: Boolean,
  createdAt: Date,
});
export const Post = mongoose.model("Post", postSchema);
`,
      "utf8",
    );

    const result = await scanMongooseModel(file);
    expect(result).not.toBeNull();
    const names = result!.fields.map((f) => f.name);
    expect(names).toContain("title");
    expect(names).toContain("published");
    expect(names).toContain("createdAt");
  });

  it("extracts TypeScript interfaces", async () => {
    const file = path.join(tmp, "product.ts");
    await writeFile(
      file,
      `
export interface IProduct {
  name: string;
  price?: number;
}
const schema = new mongoose.Schema({ name: String });
export const Product = mongoose.model("Product", schema);
`,
      "utf8",
    );

    const result = await scanMongooseModel(file);
    expect(result!.interfaces).toHaveLength(1);
    expect(result!.interfaces[0]!.name).toBe("IProduct");
    expect(result!.interfaces[0]!.fields).toHaveLength(2);
  });
});

// ─── parseDrizzleSchema ───────────────────────────────────────────────────────

describe("parseDrizzleSchema", () => {
  it("parses a basic pgTable definition", () => {
    const content = `
import { pgTable, serial, text, varchar, boolean, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: text("name"),
  active: boolean("active").notNull().default(true),
});
`;
    const models = parseDrizzleSchema(content, "src/db/schema/users.ts");
    expect(models).toHaveLength(1);

    const model = models[0]!;
    expect(model.name).toBe("users");
    expect(model.tableName).toBe("users");
    expect(model.orm).toBe("drizzle");
    expect(model.relPath).toBe("src/db/schema/users.ts");

    const byName = Object.fromEntries(model.fields.map((f) => [f.name, f]));
    expect(byName.id).toMatchObject({ primary: true, autoIncrement: true });
    expect(byName.email).toMatchObject({ unique: true, nullable: false, length: 255 });
    expect(byName.active).toMatchObject({ nullable: false });
  });

  it("parses mysqlTable and sqliteTable", () => {
    const content = `
import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";
export const orders = mysqlTable("orders", {
  id: int("id").primaryKey(),
  total: varchar("total", { length: 20 }),
});
`;
    const models = parseDrizzleSchema(content, "src/schema/orders.ts");
    expect(models).toHaveLength(1);
    expect(models[0]!.tableName).toBe("orders");
    expect(models[0]!.orm).toBe("drizzle");
  });

  it("parses foreign key references", () => {
    const content = `
import { pgTable, integer, serial } from "drizzle-orm/pg-core";
export const users = pgTable("users", { id: serial("id").primaryKey() });
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
});
`;
    const models = parseDrizzleSchema(content, "src/schema.ts");
    const posts = models.find((m) => m.name === "posts")!;
    const byName = Object.fromEntries(posts.fields.map((f) => [f.name, f]));
    expect(byName.userId?.relation).toMatchObject({
      kind: "many-to-one",
      target: "users",
    });
  });

  it("returns empty array when no table definitions found", () => {
    expect(parseDrizzleSchema("// no tables here\n", "x.ts")).toEqual([]);
  });
});

// ─── scanDrizzleSchemas ───────────────────────────────────────────────────────

describe("scanDrizzleSchemas", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-drizzle-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns [] when no schema directory exists", async () => {
    const models = await scanDrizzleSchemas(tmp);
    expect(models).toEqual([]);
  });

  it("scans src/db/schema/ and returns parsed models", async () => {
    const schemaDir = path.join(tmp, "src", "db", "schema");
    await mkdir(schemaDir, { recursive: true });
    await writeFile(
      path.join(schemaDir, "users.ts"),
      `
import { pgTable, serial, text } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});
`,
      "utf8",
    );

    const models = await scanDrizzleSchemas(tmp);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "users",
      tableName: "users",
      orm: "drizzle",
    });
  });

  it("falls back to src/schema/ when src/db/schema/ is absent", async () => {
    const schemaDir = path.join(tmp, "src", "schema");
    await mkdir(schemaDir, { recursive: true });
    await writeFile(
      path.join(schemaDir, "products.ts"),
      `
import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 50 }),
});
`,
      "utf8",
    );

    const models = await scanDrizzleSchemas(tmp);
    expect(models).toHaveLength(1);
    expect(models[0]!.tableName).toBe("products");
  });
});
