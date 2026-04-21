import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseSequelizeFile,
  parseSequelizeType,
  scanSequelizeModels,
} from "../src/utils/orm";

describe("parseSequelizeType", () => {
  it("recognises bare identifiers (`STRING`, `DataTypes.INTEGER`)", () => {
    expect(parseSequelizeType("DataTypes.STRING")).toEqual({ type: "STRING" });
    expect(parseSequelizeType("DataType.INTEGER")).toEqual({ type: "INTEGER" });
    expect(parseSequelizeType("Sequelize.TEXT")).toEqual({ type: "TEXT" });
    expect(parseSequelizeType("STRING")).toEqual({ type: "STRING" });
  });

  it("splits `STRING(255)` into { type, length }", () => {
    expect(parseSequelizeType("DataTypes.STRING(255)")).toEqual({
      type: "STRING",
      length: 255,
    });
  });

  it("splits `DECIMAL(10, 2)` into { type, precision, scale }", () => {
    expect(parseSequelizeType("DataTypes.DECIMAL(10, 2)")).toEqual({
      type: "DECIMAL",
      precision: 10,
      scale: 2,
    });
  });
});

describe("parseSequelizeFile — style ①: sequelize.define", () => {
  it("parses a minimal define() call with shorthand & object fields", () => {
    const source = `
      const User = sequelize.define("User", {
        id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: DataTypes.STRING(255), unique: true, allowNull: false },
        name:  { type: DataTypes.STRING, allowNull: true },
        age:   DataTypes.INTEGER,
      }, {
        tableName: "users",
      });
    `;
    const models = parseSequelizeFile(source, "src/models/user.ts");
    expect(models).toHaveLength(1);

    const user = models[0]!;
    expect(user.name).toBe("User");
    expect(user.orm).toBe("sequelize");
    expect(user.tableName).toBe("users");
    expect(user.relPath).toBe("src/models/user.ts");

    const byName = Object.fromEntries(user.fields.map((f) => [f.name, f]));
    expect(byName.id).toMatchObject({
      name: "id",
      type: "INTEGER",
      primary: true,
      autoIncrement: true,
    });
    expect(byName.email).toMatchObject({
      name: "email",
      type: "STRING",
      length: 255,
      unique: true,
      nullable: false,
    });
    expect(byName.name).toMatchObject({
      name: "name",
      type: "STRING",
      nullable: true,
    });
    expect(byName.age).toMatchObject({ name: "age", type: "INTEGER" });
  });

  it("works without the third options argument", () => {
    const source = `const Tag = sequelize.define("Tag", { name: DataTypes.STRING });`;
    const [tag] = parseSequelizeFile(source, "x.ts");
    expect(tag!.name).toBe("Tag");
    expect(tag!.tableName).toBeUndefined();
  });
});

describe("parseSequelizeFile — style ②: class Model.init", () => {
  it("parses a User class + User.init with references", () => {
    const source = `
      class User extends Model {}
      User.init({
        id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        email:   { type: DataTypes.STRING(100), unique: true },
        userId:  { type: DataTypes.INTEGER, references: { model: "users", key: "id" } },
      }, {
        sequelize,
        tableName: "users",
        modelName: "User",
      });
    `;
    const models = parseSequelizeFile(source, "src/models/user.ts");
    expect(models).toHaveLength(1);

    const user = models[0]!;
    expect(user.name).toBe("User");
    expect(user.tableName).toBe("users");

    const byName = Object.fromEntries(user.fields.map((f) => [f.name, f]));
    expect(byName.id).toMatchObject({ primary: true, autoIncrement: true });
    expect(byName.email).toMatchObject({ type: "STRING", length: 100, unique: true });
    expect(byName.userId!.relation).toMatchObject({
      kind: "many-to-one",
      target: "users",
      foreignKey: "userId",
    });
  });

  it("ignores the literal `Model.init` call on the base class", () => {
    // If someone names a subclass literally `Model`, that's pathological — not us.
    const source = `Model.init({ x: DataTypes.STRING }, { tableName: "x" });`;
    expect(parseSequelizeFile(source, "x.ts")).toEqual([]);
  });
});

describe("parseSequelizeFile — style ③: sequelize-typescript decorators", () => {
  it("parses @Table/@Column/@PrimaryKey/@AutoIncrement/@Unique", () => {
    const source = `
      import { Table, Column, Model, PrimaryKey, AutoIncrement, Unique, AllowNull, DataType } from "sequelize-typescript";

      @Table({ tableName: "users" })
      export class User extends Model<User> {
        @PrimaryKey
        @AutoIncrement
        @Column
        id!: number;

        @Unique
        @AllowNull(false)
        @Column(DataType.STRING(255))
        email!: string;

        @Column({ type: DataType.DECIMAL(10, 2) })
        balance!: number;
      }
    `;
    const models = parseSequelizeFile(source, "src/models/user.ts");
    expect(models).toHaveLength(1);

    const user = models[0]!;
    expect(user.name).toBe("User");
    expect(user.tableName).toBe("users");

    const byName = Object.fromEntries(user.fields.map((f) => [f.name, f]));
    expect(byName.id).toMatchObject({
      primary: true,
      autoIncrement: true,
      type: "number",
    });
    expect(byName.email).toMatchObject({
      type: "STRING",
      length: 255,
      unique: true,
      nullable: false,
    });
    expect(byName.balance).toMatchObject({
      type: "DECIMAL",
      precision: 10,
      scale: 2,
    });
  });

  it("parses @ForeignKey / @BelongsTo / @HasMany relations", () => {
    const source = `
      @Table({ tableName: "posts" })
      export class Post extends Model<Post> {
        @PrimaryKey @AutoIncrement @Column id!: number;

        @ForeignKey(() => User)
        @Column
        userId!: number;

        @BelongsTo(() => User)
        user!: User;
      }

      @Table({ tableName: "users" })
      export class User extends Model<User> {
        @PrimaryKey @AutoIncrement @Column id!: number;

        @HasMany(() => Post)
        posts!: Post[];
      }
    `;
    const models = parseSequelizeFile(source, "x.ts");
    const byName = Object.fromEntries(models.map((m) => [m.name, m]));

    const post = byName.Post!;
    const userId = post.fields.find((f) => f.name === "userId")!;
    expect(userId.relation).toMatchObject({
      kind: "many-to-one",
      target: "User",
      foreignKey: "userId",
    });
    const postUser = post.fields.find((f) => f.name === "user")!;
    expect(postUser.relation).toMatchObject({ kind: "many-to-one", target: "User" });

    const user = byName.User!;
    const posts = user.fields.find((f) => f.name === "posts")!;
    expect(posts.relation).toMatchObject({ kind: "one-to-many", target: "Post" });
  });

  it("picks up @Table('users_tbl') string-shorthand form", () => {
    const source = `
      @Table("users_tbl")
      export class U extends Model<U> {
        @PrimaryKey @Column id!: number;
      }
    `;
    const [u] = parseSequelizeFile(source, "x.ts");
    expect(u!.tableName).toBe("users_tbl");
  });
});

describe("parseSequelizeFile — empty / misc", () => {
  it("returns [] when the file contains no Sequelize declarations", () => {
    expect(parseSequelizeFile("export const noop = () => undefined;\n", "x.ts")).toEqual([]);
  });
});

describe("scanSequelizeModels", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-sequelize-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns [] when no candidate directory exists", async () => {
    expect(await scanSequelizeModels(tmp)).toEqual([]);
  });

  it("reads src/models/*.ts and parses define() + init() together", async () => {
    await mkdir(path.join(tmp, "src", "models"), { recursive: true });
    await writeFile(
      path.join(tmp, "src", "models", "user.ts"),
      `import { DataTypes, Model } from "sequelize";\n` +
        `class User extends Model {}\n` +
        `User.init({ id: { type: DataTypes.INTEGER, primaryKey: true } }, { sequelize, tableName: "users" });\n` +
        `export default User;\n`,
      "utf8",
    );
    await writeFile(
      path.join(tmp, "src", "models", "tag.ts"),
      `const Tag = sequelize.define("Tag", { name: DataTypes.STRING }, { tableName: "tags" });\n`,
      "utf8",
    );

    const models = await scanSequelizeModels(tmp);
    expect(models).toHaveLength(2);
    expect(models.every((m) => m.orm === "sequelize")).toBe(true);

    const byName = Object.fromEntries(models.map((m) => [m.name, m]));
    expect(byName.User).toMatchObject({ tableName: "users", relPath: "src/models/user.ts" });
    expect(byName.Tag).toMatchObject({ tableName: "tags", relPath: "src/models/tag.ts" });
  });

  it("skips files without any Sequelize fingerprint", async () => {
    await mkdir(path.join(tmp, "src", "models"), { recursive: true });
    await writeFile(
      path.join(tmp, "src", "models", "helper.ts"),
      `export const add = (a: number, b: number) => a + b;\n`,
      "utf8",
    );

    expect(await scanSequelizeModels(tmp)).toEqual([]);
  });
});
