import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createVue3Adapter from "../src/index";

// ─── helpers ────────────────────────────────────────────────────────────────

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

/** Minimal Vue 3 package.json that satisfies detect(). */
const VUE3_PKG = {
  name: "web",
  dependencies: { vue: "^3.4.0", "vue-router": "^4.0.0" },
};

// ─── detect() ───────────────────────────────────────────────────────────────

describe("adapter-vue3 detect()", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-detect-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns true when vue ^3.x is present", async () => {
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns false when vue ^2.x is present", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { vue: "^2.7.0" },
    });
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when vue is absent", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { react: "^19.0.0" },
    });
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when package.json is absent", async () => {
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });
});

// ─── scan() — views ──────────────────────────────────────────────────────────

describe("adapter-vue3 scan() — views (src/views)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-views-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/views/*.vue and extracts ref / computed / watch / apiCalls / handlers", async () => {
    await writeText(
      path.join(tmp, "src", "views", "UserList.vue"),
      `<template>
  <div>
    <el-table :data="users" />
    <el-button @click="handleRefresh">刷新</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { api } from "../api/user";

const users = ref<string[]>([]);
const loading = ref(false);
const total = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter(Boolean));

watch(users, () => {
  api.fetchCount();
});

watchEffect(() => {
  api.getUsers();
});

const handleRefresh = () => { users.value = []; };
const handleDelete = (id: string) => api.deleteUser(id);
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("vue3");

    const raw = mod.raw as {
      views: Array<{
        name: string;
        refs: string[];
        computeds: string[];
        watchCount: number;
        apiCalls: string[];
        handlers: string[];
      }>;
    };

    expect(raw.views).toHaveLength(1);
    const view = raw.views[0]!;
    expect(view.name).toBe("UserList");

    // ref extraction
    expect(view.refs).toContain("users");
    expect(view.refs).toContain("loading");

    // computed extraction
    expect(view.computeds).toContain("total");
    expect(view.computeds).toContain("activeUsers");

    // watch count (watch + watchEffect = 2)
    expect(view.watchCount).toBe(2);

    // api calls
    expect(view.apiCalls).toContain("fetchCount");
    expect(view.apiCalls).toContain("getUsers");

    // handlers
    expect(view.handlers).toContain("handleRefresh");
    expect(view.handlers).toContain("handleDelete");
  });

  it("also scans src/pages/*.vue (compatibility alias)", async () => {
    await writeText(
      path.join(tmp, "src", "pages", "Dashboard.vue"),
      `<template><div>Dashboard</div></template>
<script setup lang="ts">
const count = ref(0);
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { views: Array<{ name: string }> };
    expect(raw.views.some((v) => v.name === "Dashboard")).toBe(true);
  });

  it("emits page symbols for each view", async () => {
    await writeText(
      path.join(tmp, "src", "views", "Home.vue"),
      `<template><div>Home</div></template><script setup></script>`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const pageSymbols = mod.symbols.filter((s) => s.kind === "page");
    expect(pageSymbols.map((s) => s.name)).toContain("Home");
    expect(pageSymbols[0]!.framework).toBe("vue3");
  });
});

// ─── scan() — components ─────────────────────────────────────────────────────

describe("adapter-vue3 scan() — components", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-components-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts defineProps (TS generic style) and defineEmits (array style)", async () => {
    await writeText(
      path.join(tmp, "src", "components", "UserCard.vue"),
      `<template>
  <div>{{ name }}</div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  age?: number;
  disabled?: boolean;
}>();

defineEmits(["click", "close"]);
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{
        name: string;
        props: Array<{ name: string; optional: boolean; type: string }>;
        emits: string[];
      }>;
    };

    expect(raw.components).toHaveLength(1);
    const card = raw.components[0]!;
    expect(card.name).toBe("UserCard");

    const propNames = card.props.map((p) => p.name);
    expect(propNames).toContain("name");
    expect(propNames).toContain("age");
    expect(propNames).toContain("disabled");

    const ageProp = card.props.find((p) => p.name === "age")!;
    expect(ageProp.optional).toBe(true);

    expect(card.emits).toContain("click");
    expect(card.emits).toContain("close");
  });

  it("extracts defineEmits (TypeScript generic style)", async () => {
    await writeText(
      path.join(tmp, "src", "components", "SearchBar.vue"),
      `<template><input /></template>
<script setup lang="ts">
defineEmits<{
  (e: 'search', query: string): void;
  (e: 'clear'): void;
}>();
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{ name: string; emits: string[] }>;
    };

    const bar = raw.components.find((c) => c.name === "SearchBar")!;
    expect(bar.emits).toContain("search");
    expect(bar.emits).toContain("clear");
  });

  it("emits component symbols", async () => {
    await writeText(
      path.join(tmp, "src", "components", "Avatar.vue"),
      `<template><img /></template><script setup></script>`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const compSymbols = mod.symbols.filter((s) => s.kind === "component");
    expect(compSymbols.map((s) => s.name)).toContain("Avatar");
  });
});

// ─── scan() — composables ────────────────────────────────────────────────────

describe("adapter-vue3 scan() — composables", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-composables-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/composables/*.ts and populates raw.composables", async () => {
    await writeText(
      path.join(tmp, "src", "composables", "useUserData.ts"),
      `import { ref } from "vue";
export const useUserData = () => {
  const users = ref([]);
  return { users };
};
`,
    );

    await writeText(
      path.join(tmp, "src", "composables", "usePagination.ts"),
      `import { ref } from "vue";
export const usePagination = (pageSize = 10) => {
  const page = ref(1);
  return { page };
};
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { composables: Array<{ name: string }> };
    expect(raw.composables).toHaveLength(2);
    const names = raw.composables.map((c) => c.name);
    expect(names).toContain("useUserData");
    expect(names).toContain("usePagination");
  });
});

// ─── scan() — stores (Pinia) ─────────────────────────────────────────────────

describe("adapter-vue3 scan() — stores (Pinia)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-stores-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/stores/*.ts, extracts storeId and exports", async () => {
    await writeText(
      path.join(tmp, "src", "stores", "userStore.ts"),
      `import { defineStore } from "pinia";
export const useUserStore = defineStore("user", () => {
  const users = ref([]);
  return { users };
});
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      stores: Array<{ storeId?: string; exports: string[] }>;
    };

    expect(raw.stores).toHaveLength(1);
    expect(raw.stores[0]!.storeId).toBe("user");
    expect(raw.stores[0]!.exports).toContain("useUserStore");

    const storeSymbols = mod.symbols.filter((s) => s.kind === "store");
    expect(storeSymbols.map((s) => s.name)).toContain("useUserStore");
  });
});

// ─── scan() — api / types ────────────────────────────────────────────────────

describe("adapter-vue3 scan() — api / types", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-aux-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
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

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { apiFiles: Array<{ exports: string[] }> };
    expect(raw.apiFiles).toHaveLength(1);
    expect(raw.apiFiles[0]!.exports).toContain("getUsers");
    expect(raw.apiFiles[0]!.exports).toContain("deleteUser");

    const apiSymbols = mod.symbols.filter((s) => s.kind === "api");
    expect(apiSymbols.map((s) => s.name)).toContain("getUsers");
    expect(apiSymbols.map((s) => s.name)).toContain("deleteUser");
  });

  it("scans src/types/*.ts and emits type symbols from interfaces", async () => {
    await writeText(
      path.join(tmp, "src", "types", "user.ts"),
      `export interface User {
  id: string;
  name: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}
`,
    );

    const adapter = createVue3Adapter();
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

// ─── scan() — router ─────────────────────────────────────────────────────────

describe("adapter-vue3 scan() — router", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-router-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts routes from src/router/index.ts", async () => {
    await writeText(
      path.join(tmp, "src", "router", "index.ts"),
      `import { createRouter, createWebHistory } from "vue-router";
import UserList from "../views/UserList.vue";

const routes = [
  { path: "/", name: "home", component: UserList },
  { path: "/users/:id", name: "user-detail", component: () => import("../views/UserDetail.vue") },
  { path: "/login", component: () => import("../views/Login.vue") },
];

export default createRouter({ history: createWebHistory(), routes });
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { routes: Array<{ path: string; component: string; name?: string }> };
    expect(raw.routes.length).toBeGreaterThanOrEqual(3);

    const paths = raw.routes.map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/users/:id");
    expect(paths).toContain("/login");

    const homeRoute = raw.routes.find((r) => r.path === "/")!;
    expect(homeRoute.component).toBe("UserList");
    expect(homeRoute.name).toBe("home");
  });

  it("returns empty routes when router file is absent", async () => {
    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { routes: unknown[] };
    expect(raw.routes).toEqual([]);
  });
});

// ─── scan() — UI library (Element Plus) ─────────────────────────────────────

describe("adapter-vue3 scan() — UI library detection", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-ui-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("detects element-plus and sets raw.uiLibrary.name to 'element-plus'", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^3.4.0",
        "element-plus": "^2.7.0",
      },
    });

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string; version?: string; components: string[] } };
    expect(raw.uiLibrary).toBeDefined();
    expect(raw.uiLibrary!.name).toBe("element-plus");
    expect(raw.uiLibrary!.version).toBe("^2.7.0");
  });

  it("extracts Element Plus component names from .vue and .ts source files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^3.4.0",
        "element-plus": "^2.7.0",
      },
    });

    // View using ElButton + ElTable
    await writeText(
      path.join(tmp, "src", "views", "UserList.vue"),
      `<template><div /></template>
<script setup lang="ts">
import { ElButton, ElTable } from "element-plus";
</script>
`,
    );

    // Component using ElForm + ElInput
    await writeText(
      path.join(tmp, "src", "components", "UserForm.vue"),
      `<template><div /></template>
<script setup lang="ts">
import { ElForm, ElInput, ElSelect } from "element-plus";
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { components: string[] } };
    expect(raw.uiLibrary).toBeDefined();

    const components = raw.uiLibrary!.components;
    expect(components).toContain("ElButton");
    expect(components).toContain("ElTable");
    expect(components).toContain("ElForm");
    expect(components).toContain("ElInput");
    expect(components).toContain("ElSelect");
    // Deduplicated and sorted
    expect(components).toEqual([...new Set(components)].sort());
  });

  it("leaves raw.uiLibrary undefined when no UI library is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { vue: "^3.4.0" },
    });

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: unknown };
    expect(raw.uiLibrary).toBeUndefined();
  });

  it("picks element-plus over naive-ui when both are present (priority order)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^3.4.0",
        "element-plus": "^2.7.0",
        "naive-ui": "^2.38.0",
      },
    });

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string } };
    expect(raw.uiLibrary!.name).toBe("element-plus");
  });

  it("detects naive-ui when only naive-ui is present", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^3.4.0",
        "naive-ui": "^2.38.0",
      },
    });

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string; version?: string } };
    expect(raw.uiLibrary).toBeDefined();
    expect(raw.uiLibrary!.name).toBe("naive-ui");
    expect(raw.uiLibrary!.version).toBe("^2.38.0");
  });
});

// ─── scan() — empty project ──────────────────────────────────────────────────

describe("adapter-vue3 scan() — empty project", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-empty-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns all empty arrays without throwing when src/ has no files", async () => {
    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    expect(mod.kind).toBe("frontend");
    expect(mod.raw?.framework).toBe("vue3");

    const raw = mod.raw as {
      views: unknown[];
      components: unknown[];
      composables: unknown[];
      stores: unknown[];
      apiFiles: unknown[];
      typesFiles: unknown[];
      routes: unknown[];
    };

    expect(raw.views).toEqual([]);
    expect(raw.components).toEqual([]);
    expect(raw.composables).toEqual([]);
    expect(raw.stores).toEqual([]);
    expect(raw.apiFiles).toEqual([]);
    expect(raw.typesFiles).toEqual([]);
    expect(raw.routes).toEqual([]);
    expect(mod.symbols).toEqual([]);
  });
});

// ─── scan() — module metadata ────────────────────────────────────────────────

describe("adapter-vue3 scan() — module metadata", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue3-meta-"));
    await writeJson(path.join(tmp, "package.json"), VUE3_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("uses default module name 'web'", async () => {
    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("web");
    expect(mod.kind).toBe("frontend");
  });

  it("respects custom moduleName option", async () => {
    const adapter = createVue3Adapter({ moduleName: "admin" });
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("admin");
  });
});

// ─── Nuxt 3 support ──────────────────────────────────────────────────────────

describe("adapter-vue3 — Nuxt 3 support", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-nuxt-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("detect() returns true for a Nuxt 3 project (nuxt dep, no explicit vue)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("detect() returns true for a Nuxt project via @nuxt/kit", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-layer",
      devDependencies: { "@nuxt/kit": "^3.10.0" },
    });
    const adapter = createVue3Adapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("scan() picks up pages from root pages/ and sets isNuxt=true", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });

    await writeText(
      path.join(tmp, "pages", "index.vue"),
      `<template><div>Home</div></template>
<script setup lang="ts">
const count = ref(0);
const doubled = computed(() => count.value * 2);
const handleReset = () => { count.value = 0; };
</script>
`,
    );

    await writeText(
      path.join(tmp, "pages", "users", "index.vue"),
      `<template><div>Users</div></template>
<script setup lang="ts">
const users = ref([]);
watch(users, () => { api.fetchCount(); });
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      isNuxt?: boolean;
      views: Array<{ name: string; refs?: string[]; computeds?: string[] }>;
    };

    expect(raw.isNuxt).toBe(true);
    expect(raw.views.length).toBeGreaterThanOrEqual(1);

    const indexPage = raw.views.find((v) => v.name === "index");
    expect(indexPage).toBeDefined();
    expect(indexPage!.refs).toContain("count");
    expect(indexPage!.computeds).toContain("doubled");
  });

  it("scan() picks up components from root components/ (Nuxt auto-import convention)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });

    await writeText(
      path.join(tmp, "components", "AppHeader.vue"),
      `<template><header>{{ title }}</header></template>
<script setup lang="ts">
defineProps<{ title: string; sticky?: boolean }>();
defineEmits(["close"]);
</script>
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{ name: string; props: Array<{ name: string }>; emits: string[] }>;
    };

    const header = raw.components.find((c) => c.name === "AppHeader");
    expect(header).toBeDefined();
    expect(header!.props.map((p) => p.name)).toContain("title");
    expect(header!.emits).toContain("close");
  });

  it("scan() picks up composables from root composables/ (Nuxt auto-import convention)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });

    await writeText(
      path.join(tmp, "composables", "useAuth.ts"),
      `export const useAuth = () => {
  const user = ref(null);
  return { user };
};
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { composables: Array<{ name: string }> };
    expect(raw.composables.some((c) => c.name === "useAuth")).toBe(true);
  });

  it("scan() picks up stores from root stores/ (Nuxt + Pinia convention)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });

    await writeText(
      path.join(tmp, "stores", "counter.ts"),
      `import { defineStore } from "pinia";
export const useCounterStore = defineStore("counter", () => {
  const count = ref(0);
  return { count };
});
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { stores: Array<{ storeId?: string; exports: string[] }> };
    expect(raw.stores.length).toBeGreaterThanOrEqual(1);
    const counterStore = raw.stores.find((s) => s.storeId === "counter");
    expect(counterStore).toBeDefined();
    expect(counterStore!.exports).toContain("useCounterStore");
  });

  it("scan() picks up utils/ as apiFiles (Nuxt auto-import convention)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-nuxt-app",
      devDependencies: { nuxt: "^3.10.0" },
    });

    await writeText(
      path.join(tmp, "utils", "api.ts"),
      `export const fetchUser = async (id: string) => $fetch(\`/api/users/\${id}\`);
export const fetchPosts = async () => $fetch("/api/posts");
`,
    );

    const adapter = createVue3Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { apiFiles: Array<{ exports: string[] }> };
    expect(raw.apiFiles.length).toBeGreaterThanOrEqual(1);
    const allExports = raw.apiFiles.flatMap((f) => f.exports);
    expect(allExports).toContain("fetchUser");
    expect(allExports).toContain("fetchPosts");
  });
});
