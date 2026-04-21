import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseTypeormEntity, scanTypeormEntities } from "../src/utils/orm";

describe("parseTypeormEntity", () => {
  it("parses a minimal @Entity with @PrimaryGeneratedColumn / @Column / @Column({ length })", () => {
    const source = `
      import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

      @Entity()
      export class User {
        @PrimaryGeneratedColumn()
        id!: number;

        @Column({ length: 255, unique: true })
        email!: string;

        @Column({ nullable: true })
        name?: string;

        @Column({ default: () => "CURRENT_TIMESTAMP" })
        createdAt!: Date;
      }
    `;
    const models = parseTypeormEntity(source, "src/entities/user.ts");
    expect(models).toHaveLength(1);

    const user = models[0]!;
    expect(user.name).toBe("User");
    expect(user.orm).toBe("typeorm");
    expect(user.relPath).toBe("src/entities/user.ts");

    const byName = Object.fromEntries(user.fields.map((f) => [f.name, f]));

    expect(byName.id).toMatchObject({
      name: "id",
      type: "number",
      primary: true,
      autoIncrement: true,
    });

    expect(byName.email).toMatchObject({
      name: "email",
      type: "string",
      length: 255,
      unique: true,
    });

    expect(byName.name).toMatchObject({
      name: "name",
      type: "string",
      nullable: true,
    });

    expect(byName.createdAt).toMatchObject({
      name: "createdAt",
      type: "Date",
    });
    expect(byName.createdAt!.default).toContain("CURRENT_TIMESTAMP");
  });

  it("picks up @Entity('table_name') and @Entity({ name: 't' }) — both variants", () => {
    const byString = parseTypeormEntity(
      `@Entity("users_tbl")\nexport class User {\n  @PrimaryGeneratedColumn() id!: number;\n}`,
      "x.ts",
    );
    expect(byString[0]!.tableName).toBe("users_tbl");

    const byObject = parseTypeormEntity(
      `@Entity({ name: "posts_tbl" })\nexport class Post {\n  @PrimaryGeneratedColumn() id!: number;\n}`,
      "x.ts",
    );
    expect(byObject[0]!.tableName).toBe("posts_tbl");
  });

  it("recognises @PrimaryGeneratedColumn('uuid') (no autoIncrement)", () => {
    const source = `
      @Entity()
      export class Item {
        @PrimaryGeneratedColumn("uuid")
        id!: string;
      }
    `;
    const [item] = parseTypeormEntity(source, "x.ts");
    const id = item!.fields.find((f) => f.name === "id")!;
    expect(id.primary).toBe(true);
    expect(id.autoIncrement).toBeUndefined();
  });

  it("parses relations: @ManyToOne + @JoinColumn and @OneToMany", () => {
    const source = `
      @Entity()
      export class Post {
        @PrimaryGeneratedColumn()
        id!: number;

        @Column()
        userId!: number;

        @ManyToOne(() => User, (u) => u.posts)
        @JoinColumn({ name: "userId" })
        user!: User;
      }

      @Entity()
      export class User {
        @PrimaryGeneratedColumn()
        id!: number;

        @OneToMany(() => Post, (p) => p.user)
        posts!: Post[];
      }
    `;
    const models = parseTypeormEntity(source, "x.ts");
    const byName = Object.fromEntries(models.map((m) => [m.name, m]));

    const post = byName.Post!;
    const postUser = post.fields.find((f) => f.name === "user")!;
    expect(postUser.relation).toMatchObject({
      kind: "many-to-one",
      target: "User",
      foreignKey: "userId",
    });

    const user = byName.User!;
    const userPosts = user.fields.find((f) => f.name === "posts")!;
    expect(userPosts.relation).toMatchObject({
      kind: "one-to-many",
      target: "Post",
    });
  });

  it("parses @Column({ type: 'decimal', precision, scale })", () => {
    const source = `
      @Entity()
      export class Product {
        @PrimaryGeneratedColumn() id!: number;

        @Column({ type: "decimal", precision: 10, scale: 2 })
        price!: number;

        @Column({ type: "varchar", length: 64, name: "stock_keeping_unit" })
        sku!: string;
      }
    `;
    const [product] = parseTypeormEntity(source, "x.ts");
    const byName = Object.fromEntries(product!.fields.map((f) => [f.name, f]));
    expect(byName.price).toMatchObject({
      type: "decimal",
      precision: 10,
      scale: 2,
    });
    expect(byName.sku).toMatchObject({
      type: "varchar",
      length: 64,
      columnName: "stock_keeping_unit",
    });
  });

  it("returns an empty array when no @Entity class is present", () => {
    expect(parseTypeormEntity("// just a comment\nexport class NotAnEntity {}\n", "x.ts")).toEqual([]);
  });
});

describe("scanTypeormEntities", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-typeorm-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns [] when none of the candidate entity dirs exist", async () => {
    expect(await scanTypeormEntities(tmp)).toEqual([]);
  });

  it("reads entities from src/entities/ and parses them", async () => {
    await mkdir(path.join(tmp, "src", "entities"), { recursive: true });
    await writeFile(
      path.join(tmp, "src", "entities", "user.ts"),
      `import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";\n\n@Entity("users")\nexport class User {\n  @PrimaryGeneratedColumn() id!: number;\n  @Column({ length: 100, unique: true }) email!: string;\n}\n`,
      "utf8",
    );

    const models = await scanTypeormEntities(tmp);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      name: "User",
      orm: "typeorm",
      tableName: "users",
      relPath: "src/entities/user.ts",
    });
  });

  it("also picks up src/entity/ (TypeORM official scaffold default)", async () => {
    await mkdir(path.join(tmp, "src", "entity"), { recursive: true });
    await writeFile(
      path.join(tmp, "src", "entity", "post.ts"),
      `@Entity()\nexport class Post {\n  @PrimaryGeneratedColumn() id!: number;\n}\n`,
      "utf8",
    );

    const models = await scanTypeormEntities(tmp);
    expect(models).toHaveLength(1);
    expect(models[0]!.name).toBe("Post");
    expect(models[0]!.relPath).toBe("src/entity/post.ts");
  });

  it("skips files that do not contain any @Entity decorator", async () => {
    await mkdir(path.join(tmp, "src", "entities"), { recursive: true });
    await writeFile(
      path.join(tmp, "src", "entities", "helper.ts"),
      `export const noop = () => undefined;\n`,
      "utf8",
    );

    const models = await scanTypeormEntities(tmp);
    expect(models).toEqual([]);
  });
});
