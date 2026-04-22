import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createReactAdapter from "../src/index";

// ─── helpers ────────────────────────────────────────────────────────────────

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

/** Minimal React package.json that satisfies detect(). */
const REACT_PKG = {
  name: "web",
  dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
};

// ─── detect() ───────────────────────────────────────────────────────────────

describe("adapter-react detect()", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-detect-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns true when both react and react-dom are present", async () => {
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
    const adapter = createReactAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns false when react-dom is missing", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { react: "^19.0.0" },
    });
    const adapter = createReactAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when package.json is absent", async () => {
    const adapter = createReactAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });
});

// ─── scan() — pages ─────────────────────────────────────────────────────────

describe("adapter-react scan() — pages", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-pages-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/pages/*.tsx and extracts useState / useEffect / apiCalls / handlers", async () => {
    await writeText(
      path.join(tmp, "src", "pages", "UserList.tsx"),
      `import React, { useState, useEffect } from "react";
import { api } from "../api/user";

const UserList = () => {
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getUsers();
  }, []);

  useEffect(() => {
    api.fetchCount();
  }, [users]);

  const handleRefresh = () => setUsers([]);
  const handleDelete = (id: string) => api.deleteUser(id);

  return <div>{users.map(u => <span key={u}>{u}</span>)}</div>;
};

export default UserList;
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("react");

    const raw = mod.raw as { pages: Array<{
      name: string;
      states: Array<{ name: string; setter: string }>;
      effectCount: number;
      apiCalls: string[];
      handlers: string[];
    }> };

    expect(raw.pages).toHaveLength(1);
    const page = raw.pages[0]!;
    expect(page.name).toBe("UserList");

    // useState extraction
    expect(page.states.map((s) => s.name)).toContain("users");
    expect(page.states.map((s) => s.name)).toContain("loading");
    expect(page.states.find((s) => s.name === "users")?.setter).toBe("setUsers");

    // useEffect count
    expect(page.effectCount).toBe(2);

    // api calls
    expect(page.apiCalls).toContain("getUsers");
    expect(page.apiCalls).toContain("fetchCount");

    // handlers
    expect(page.handlers).toContain("handleRefresh");
    expect(page.handlers).toContain("handleDelete");
  });

  it("puts useXxx.ts files inside src/pages/ into raw.hooks, not raw.pages", async () => {
    await writeText(
      path.join(tmp, "src", "pages", "useUserData.ts"),
      `import { useState } from "react";
export const useUserData = () => {
  const [data, setData] = useState(null);
  return { data };
};
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      pages: unknown[];
      hooks: Array<{ file: string }>;
    };

    // The hook file should NOT appear in pages
    expect(raw.pages.filter((p: unknown) => {
      const page = p as { file?: string };
      return page.file?.includes("useUserData");
    })).toHaveLength(0);

    // It should appear in hooks
    expect(raw.hooks.some((h) => h.file.includes("useUserData"))).toBe(true);
  });
});

// ─── scan() — components ────────────────────────────────────────────────────

describe("adapter-react scan() — components", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-components-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/components/*.tsx and extracts component name + props", async () => {
    await writeText(
      path.join(tmp, "src", "components", "Button.tsx"),
      `import React from "react";

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export const Button = ({ label, onClick, disabled }: ButtonProps) => (
  <button onClick={onClick} disabled={disabled}>{label}</button>
);
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{
        name: string;
        props: Array<{ name: string; optional: boolean; type: string }>;
      }>;
    };

    expect(raw.components).toHaveLength(1);
    const btn = raw.components[0]!;
    expect(btn.name).toBe("Button");

    const propNames = btn.props.map((p) => p.name);
    expect(propNames).toContain("label");
    expect(propNames).toContain("onClick");
    expect(propNames).toContain("disabled");

    const disabledProp = btn.props.find((p) => p.name === "disabled")!;
    expect(disabledProp.optional).toBe(true);

    // component symbol
    const componentSymbols = mod.symbols.filter((s) => s.kind === "component");
    expect(componentSymbols.map((s) => s.name)).toContain("Button");
  });
});

// ─── scan() — api / store / types ───────────────────────────────────────────

describe("adapter-react scan() — api / store / types", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-aux-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/api/*.ts and emits api symbols", async () => {
    await writeText(
      path.join(tmp, "src", "api", "user.ts"),
      `export const getUsers = async () => fetch("/api/users");
export const deleteUser = async (id: string) => fetch(\`/api/users/\${id}\`, { method: "DELETE" });
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { apiFiles: Array<{ exports: string[] }> };
    expect(raw.apiFiles).toHaveLength(1);
    expect(raw.apiFiles[0]!.exports).toContain("getUsers");
    expect(raw.apiFiles[0]!.exports).toContain("deleteUser");

    const apiSymbols = mod.symbols.filter((s) => s.kind === "api");
    expect(apiSymbols.map((s) => s.name)).toContain("getUsers");
    expect(apiSymbols.map((s) => s.name)).toContain("deleteUser");
  });

  it("scans src/store/*.ts and emits store symbols", async () => {
    await writeText(
      path.join(tmp, "src", "store", "userStore.ts"),
      `import { create } from "zustand";
export const useUserStore = create(() => ({ users: [] }));
export const useAuthStore = create(() => ({ token: "" }));
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { storeFiles: Array<{ exports: string[] }> };
    expect(raw.storeFiles).toHaveLength(1);
    expect(raw.storeFiles[0]!.exports).toContain("useUserStore");
    expect(raw.storeFiles[0]!.exports).toContain("useAuthStore");

    const storeSymbols = mod.symbols.filter((s) => s.kind === "store");
    expect(storeSymbols.map((s) => s.name)).toContain("useUserStore");
    expect(storeSymbols.map((s) => s.name)).toContain("useAuthStore");
  });

  it("scans src/types/*.ts and emits type symbols from interfaces", async () => {
    await writeText(
      path.join(tmp, "src", "types", "user.ts"),
      `export interface User {
  id: string;
  name: string;
  email: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
}
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { typesFiles: Array<{ interfaces: Array<{ name: string }> }> };
    expect(raw.typesFiles).toHaveLength(1);
    const ifaceNames = raw.typesFiles[0]!.interfaces.map((i) => i.name);
    expect(ifaceNames).toContain("User");
    expect(ifaceNames).toContain("PaginatedResponse");

    const typeSymbols = mod.symbols.filter((s) => s.kind === "type");
    expect(typeSymbols.map((s) => s.name)).toContain("User");
    expect(typeSymbols.map((s) => s.name)).toContain("PaginatedResponse");
  });
});

// ─── scan() — routes ────────────────────────────────────────────────────────

describe("adapter-react scan() — routes from App.tsx", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-routes-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts <Route path element> declarations from src/App.tsx", async () => {
    await writeText(
      path.join(tmp, "src", "App.tsx"),
      `import React from "react";
import { Routes, Route } from "react-router-dom";
import UserList from "./pages/UserList";
import UserDetail from "./pages/UserDetail";
import Login from "./pages/Login";

const App = () => (
  <Routes>
    <Route path="/users" element={<UserList />} />
    <Route path="/users/:id" element={<UserDetail />} />
    <Route path="/login" element={<Login />} />
  </Routes>
);

export default App;
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { routes: Array<{ path: string; component: string }> };
    expect(raw.routes.length).toBeGreaterThanOrEqual(3);

    const paths = raw.routes.map((r) => r.path);
    expect(paths).toContain("/users");
    expect(paths).toContain("/users/:id");
    expect(paths).toContain("/login");

    const components = raw.routes.map((r) => r.component);
    expect(components).toContain("UserList");
    expect(components).toContain("UserDetail");
    expect(components).toContain("Login");
  });

  it("returns empty routes when App.tsx is absent", async () => {
    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { routes: unknown[] };
    expect(raw.routes).toEqual([]);
  });
});

// ─── scan() — empty project ──────────────────────────────────────────────────

describe("adapter-react scan() — empty project", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-empty-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns all empty arrays without throwing when src/ has no files", async () => {
    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    expect(mod.kind).toBe("frontend");
    expect(mod.raw?.framework).toBe("react");

    const raw = mod.raw as {
      pages: unknown[];
      components: unknown[];
      apiFiles: unknown[];
      storeFiles: unknown[];
      typesFiles: unknown[];
      hooks: unknown[];
      routes: unknown[];
    };

    expect(raw.pages).toEqual([]);
    expect(raw.components).toEqual([]);
    expect(raw.apiFiles).toEqual([]);
    expect(raw.storeFiles).toEqual([]);
    expect(raw.typesFiles).toEqual([]);
    expect(raw.hooks).toEqual([]);
    expect(raw.routes).toEqual([]);
    expect(mod.symbols).toEqual([]);
  });
});

// ─── scan() — module metadata ────────────────────────────────────────────────

describe("adapter-react scan() — module metadata", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-meta-"));
    await writeJson(path.join(tmp, "package.json"), REACT_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("uses default module name 'web'", async () => {
    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("web");
    expect(mod.kind).toBe("frontend");
  });

  it("respects custom moduleName option", async () => {
    const adapter = createReactAdapter({ moduleName: "dashboard" });
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("dashboard");
  });
});

// ─── scan() — UI library detection ──────────────────────────────────────────

describe("adapter-react scan() — UI library detection", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-react-ui-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("detects antd in dependencies and sets raw.uiLibrary.name to 'antd'", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        antd: "^5.17.0",
      },
    });

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string; version?: string; components: string[] } };
    expect(raw.uiLibrary).toBeDefined();
    expect(raw.uiLibrary!.name).toBe("antd");
    expect(raw.uiLibrary!.version).toBe("^5.17.0");
  });

  it("extracts antd component names actually imported in source files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        antd: "^5.17.0",
      },
    });

    // Page that uses Button + Table
    await writeText(
      path.join(tmp, "src", "pages", "UserList.tsx"),
      `import React from "react";
import { Button, Table } from "antd";

const UserList = () => (
  <div>
    <Button type="primary">New</Button>
    <Table dataSource={[]} columns={[]} />
  </div>
);
export default UserList;
`,
    );

    // Component that uses Form + Input
    await writeText(
      path.join(tmp, "src", "components", "UserForm.tsx"),
      `import React from "react";
import { Form, Input, Select } from "antd";

export const UserForm = () => (
  <Form>
    <Form.Item><Input /></Form.Item>
    <Form.Item><Select /></Form.Item>
  </Form>
);
`,
    );

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { components: string[] } };
    expect(raw.uiLibrary).toBeDefined();

    const components = raw.uiLibrary!.components;
    expect(components).toContain("Button");
    expect(components).toContain("Table");
    expect(components).toContain("Form");
    expect(components).toContain("Input");
    expect(components).toContain("Select");
    // Components list should be deduplicated and sorted
    expect(components).toEqual([...new Set(components)].sort());
  });

  it("leaves raw.uiLibrary undefined when no UI library is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    });

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: unknown };
    expect(raw.uiLibrary).toBeUndefined();
  });

  it("picks antd over antd-mobile when both are present (priority order)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        antd: "^5.17.0",
        "antd-mobile": "^5.36.0",
      },
    });

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string } };
    expect(raw.uiLibrary!.name).toBe("antd");
  });

  it("detects antd-mobile when only antd-mobile is present", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "antd-mobile": "^5.36.0",
      },
    });

    const adapter = createReactAdapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string; version?: string } };
    expect(raw.uiLibrary).toBeDefined();
    expect(raw.uiLibrary!.name).toBe("antd-mobile");
    expect(raw.uiLibrary!.version).toBe("^5.36.0");
  });
});
