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
});
