/**
 * kb-meta.test.ts — 测试 YAML Front Matter 序列化/反序列化
 */
import { describe, it, expect } from "vitest";
import {
  serializeKbMeta,
  parseKbMeta,
  injectKbMeta,
  stripKbMeta,
} from "../src/utils/kb-meta";
import type { KbFileMeta } from "../src/types";

const SAMPLE_META: KbFileMeta = {
  symbol: "UserService",
  kind: "service",
  file: "src/services/user.service.ts",
  module: "server",
  dependencies: ["UserModel", "EmailService", "CacheService"],
  calledBy: ["UserController", "AuthService"],
  exports: ["createUser", "getUserById", "updateUser"],
  updatedAt: "2026-04-27T14:00:00.000Z",
};

const SAMPLE_MARKDOWN = `# UserService\n\n## 概述\n\n用户服务，处理用户相关业务逻辑。\n`;

describe("serializeKbMeta", () => {
  it("应生成合法的 YAML Front Matter 字符串", () => {
    const result = serializeKbMeta(SAMPLE_META);
    expect(result).toContain("---");
    expect(result).toContain("symbol: UserService");
    expect(result).toContain("kind: service");
    expect(result).toContain("file: src/services/user.service.ts");
    expect(result).toContain("module: server");
    expect(result).toContain('"UserModel"');
    expect(result).toContain('"EmailService"');
    expect(result).toContain('"UserController"');
    expect(result).toContain('"createUser"');
    expect(result).toContain("updatedAt: 2026-04-27T14:00:00.000Z");
  });

  it("空数组应序列化为 []", () => {
    const meta: KbFileMeta = { ...SAMPLE_META, dependencies: [], calledBy: [], exports: [] };
    const result = serializeKbMeta(meta);
    expect(result).toContain("dependencies: []");
    expect(result).toContain("calledBy: []");
    expect(result).toContain("exports: []");
  });
});

describe("parseKbMeta", () => {
  it("应正确解析序列化后的 Front Matter", () => {
    const serialized = serializeKbMeta(SAMPLE_META);
    const content = `${serialized}\n${SAMPLE_MARKDOWN}`;
    const parsed = parseKbMeta(content);

    expect(parsed).not.toBeNull();
    expect(parsed!.symbol).toBe("UserService");
    expect(parsed!.kind).toBe("service");
    expect(parsed!.file).toBe("src/services/user.service.ts");
    expect(parsed!.module).toBe("server");
    expect(parsed!.dependencies).toEqual(["UserModel", "EmailService", "CacheService"]);
    expect(parsed!.calledBy).toEqual(["UserController", "AuthService"]);
    expect(parsed!.exports).toEqual(["createUser", "getUserById", "updateUser"]);
    expect(parsed!.updatedAt).toBe("2026-04-27T14:00:00.000Z");
  });

  it("无 Front Matter 时应返回 null", () => {
    expect(parseKbMeta("# 普通 Markdown\n\n内容")).toBeNull();
    expect(parseKbMeta("")).toBeNull();
  });

  it("Front Matter 缺少必填字段时应返回 null", () => {
    const incomplete = `---\nsymbol: UserService\nkind: service\n---\n# 内容`;
    expect(parseKbMeta(incomplete)).toBeNull();
  });

  it("空数组应正确解析", () => {
    const meta: KbFileMeta = { ...SAMPLE_META, dependencies: [], calledBy: [], exports: [] };
    const content = `${serializeKbMeta(meta)}\n${SAMPLE_MARKDOWN}`;
    const parsed = parseKbMeta(content);
    expect(parsed!.dependencies).toEqual([]);
    expect(parsed!.calledBy).toEqual([]);
    expect(parsed!.exports).toEqual([]);
  });

  it("序列化再解析应保持幂等", () => {
    const serialized = serializeKbMeta(SAMPLE_META);
    const content = `${serialized}\n${SAMPLE_MARKDOWN}`;
    const parsed = parseKbMeta(content);
    // 再次序列化
    const reSerialized = serializeKbMeta(parsed!);
    const reParsed = parseKbMeta(`${reSerialized}\n${SAMPLE_MARKDOWN}`);
    expect(reParsed).toEqual(parsed);
  });
});

describe("injectKbMeta", () => {
  it("应在 Markdown 头部注入 Front Matter", () => {
    const result = injectKbMeta(SAMPLE_META, SAMPLE_MARKDOWN);
    expect(result.startsWith("---")).toBe(true);
    expect(result).toContain("symbol: UserService");
    expect(result).toContain("# UserService");
  });

  it("应替换已有的 Front Matter", () => {
    const oldMeta: KbFileMeta = { ...SAMPLE_META, symbol: "OldService" };
    const withOld = injectKbMeta(oldMeta, SAMPLE_MARKDOWN);
    // 注入新的 meta
    const result = injectKbMeta(SAMPLE_META, withOld);
    // 只应有一个 Front Matter
    const count = (result.match(/^---$/gm) ?? []).length;
    expect(count).toBe(2); // 开头 --- 和结尾 ---
    expect(result).toContain("symbol: UserService");
    expect(result).not.toContain("symbol: OldService");
  });
});

describe("stripKbMeta", () => {
  it("应去除 Front Matter，返回纯 Markdown", () => {
    const content = `${serializeKbMeta(SAMPLE_META)}\n${SAMPLE_MARKDOWN}`;
    const stripped = stripKbMeta(content);
    expect(stripped.startsWith("---")).toBe(false);
    expect(stripped).toContain("# UserService");
    expect(stripped).not.toContain("symbol: UserService");
  });

  it("无 Front Matter 时应原样返回", () => {
    expect(stripKbMeta(SAMPLE_MARKDOWN)).toBe(SAMPLE_MARKDOWN);
  });
});
