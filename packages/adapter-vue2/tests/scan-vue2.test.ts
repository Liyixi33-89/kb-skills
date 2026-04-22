import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createVue2Adapter from "../src/index";

// ─── helpers ─────────────────────────────────────────────────────────────────

const writeJson = async (p: string, obj: unknown): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
};

const writeText = async (p: string, content: string): Promise<void> => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
};

/** Minimal Vue 2 package.json that satisfies detect(). */
const VUE2_PKG = {
  name: "web",
  dependencies: { vue: "^2.7.0", "vue-router": "^3.6.0", vuex: "^3.6.0" },
};

// ─── detect() ────────────────────────────────────────────────────────────────

describe("adapter-vue2 detect()", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-detect-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns true when vue ^2.x is present", async () => {
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
    const adapter = createVue2Adapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns true when vue-template-compiler is present (Vue 2 exclusive)", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      devDependencies: { "vue-template-compiler": "^2.7.0" },
    });
    const adapter = createVue2Adapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns false when vue ^3.x is present", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { vue: "^3.4.0" },
    });
    const adapter = createVue2Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when vue is absent", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { react: "^19.0.0" },
    });
    const adapter = createVue2Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when package.json is absent", async () => {
    const adapter = createVue2Adapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });
});

// ─── scan() — views ───────────────────────────────────────────────────────────

describe("adapter-vue2 scan() — views (src/views)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-views-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/views/*.vue and extracts data / computed / watch / methods / apiCalls", async () => {
    await writeText(
      path.join(tmp, "src", "views", "UserList.vue"),
      `<template>
  <div>
    <el-table :data="users" />
    <el-button @click="handleRefresh">刷新</el-button>
  </div>
</template>

<script>
import { api } from "../api/user";

export default {
  name: "UserList",
  data() {
    return {
      users: [],
      loading: false,
      total: 0,
    };
  },
  computed: {
    activeUsers() {
      return this.users.filter(Boolean);
    },
    pageTitle() {
      return "用户列表";
    },
  },
  watch: {
    users(val) {
      this.total = val.length;
    },
    loading: {
      handler(val) {},
      immediate: true,
    },
  },
  methods: {
    handleRefresh() {
      api.getUsers();
    },
    handleDelete(id) {
      this.$emit("delete", id);
    },
    fetchData() {
      api.fetchCount();
    },
  },
};
</script>
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    expect(mod.raw?.framework).toBe("vue2");

    const raw = mod.raw as {
      views: Array<{
        name: string;
        dataProps: string[];
        computeds: string[];
        watchProps: string[];
        methods: string[];
        apiCalls: string[];
      }>;
    };

    expect(raw.views).toHaveLength(1);
    const view = raw.views[0]!;
    expect(view.name).toBe("UserList");

    // data properties
    expect(view.dataProps).toContain("users");
    expect(view.dataProps).toContain("loading");
    expect(view.dataProps).toContain("total");

    // computed
    expect(view.computeds).toContain("activeUsers");
    expect(view.computeds).toContain("pageTitle");

    // watch
    expect(view.watchProps).toContain("users");
    expect(view.watchProps).toContain("loading");

    // methods
    expect(view.methods).toContain("handleRefresh");
    expect(view.methods).toContain("handleDelete");
    expect(view.methods).toContain("fetchData");

    // api calls
    expect(view.apiCalls).toContain("getUsers");
    expect(view.apiCalls).toContain("fetchCount");
  });

  it("also scans src/pages/*.vue (compatibility alias)", async () => {
    await writeText(
      path.join(tmp, "src", "pages", "Dashboard.vue"),
      `<template><div>Dashboard</div></template>
<script>
export default {
  name: "Dashboard",
  data() { return { count: 0 }; },
};
</script>
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { views: Array<{ name: string }> };
    expect(raw.views.some((v) => v.name === "Dashboard")).toBe(true);
  });

  it("emits page symbols for each view", async () => {
    await writeText(
      path.join(tmp, "src", "views", "Home.vue"),
      `<template><div>Home</div></template>
<script>export default { name: "Home" };</script>`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const pageSymbols = mod.symbols.filter((s) => s.kind === "page");
    expect(pageSymbols.map((s) => s.name)).toContain("Home");
    expect(pageSymbols[0]!.framework).toBe("vue2");
  });
});

// ─── scan() — components ──────────────────────────────────────────────────────

describe("adapter-vue2 scan() — components", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-components-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts props (array style) and emits from this.$emit", async () => {
    await writeText(
      path.join(tmp, "src", "components", "UserCard.vue"),
      `<template><div>{{ name }}</div></template>
<script>
export default {
  name: "UserCard",
  props: ["name", "age", "disabled"],
  methods: {
    handleClick() {
      this.$emit("click", this.name);
      this.$emit("close");
    },
  },
};
</script>
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{
        name: string;
        props: Array<{ name: string; optional: boolean }>;
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

    expect(card.emits).toContain("click");
    expect(card.emits).toContain("close");
  });

  it("extracts props (object style) with required flag", async () => {
    await writeText(
      path.join(tmp, "src", "components", "SearchBar.vue"),
      `<template><input /></template>
<script>
export default {
  name: "SearchBar",
  props: {
    placeholder: { type: String },
    value: { type: String, required: true },
  },
  methods: {
    handleInput(e) {
      this.$emit("input", e.target.value);
    },
  },
};
</script>
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      components: Array<{
        name: string;
        props: Array<{ name: string; optional: boolean }>;
        emits: string[];
      }>;
    };

    const bar = raw.components.find((c) => c.name === "SearchBar")!;
    const valueProp = bar.props.find((p) => p.name === "value")!;
    expect(valueProp.optional).toBe(false);

    expect(bar.emits).toContain("input");
  });

  it("emits component symbols", async () => {
    await writeText(
      path.join(tmp, "src", "components", "Avatar.vue"),
      `<template><img /></template>
<script>export default { name: "Avatar", props: ["src"] };</script>`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const compSymbols = mod.symbols.filter((s) => s.kind === "component");
    expect(compSymbols.map((s) => s.name)).toContain("Avatar");
  });
});

// ─── scan() — mixins ──────────────────────────────────────────────────────────

describe("adapter-vue2 scan() — mixins", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-mixins-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/mixins/*.js and populates raw.mixins", async () => {
    await writeText(
      path.join(tmp, "src", "mixins", "paginationMixin.js"),
      `export default {
  data() { return { page: 1, pageSize: 10 }; },
  methods: {
    handlePageChange(page) { this.page = page; },
  },
};
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { mixins: Array<{ name: string }> };
    expect(raw.mixins).toHaveLength(1);
    expect(raw.mixins[0]!.name).toBe("paginationMixin");
  });
});

// ─── scan() — stores (Vuex) ───────────────────────────────────────────────────

describe("adapter-vue2 scan() — stores (Vuex)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-stores-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/store/*.js and extracts state / mutations / actions", async () => {
    await writeText(
      path.join(tmp, "src", "store", "user.js"),
      `export default {
  namespaced: true,
  state: {
    users: [],
    loading: false,
  },
  mutations: {
    SET_USERS(state, users) { state.users = users; },
    SET_LOADING(state, val) { state.loading = val; },
  },
  actions: {
    async fetchUsers({ commit }) {
      commit("SET_LOADING", true);
    },
  },
};
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as {
      stores: Array<{
        namespace?: string;
        stateProps: string[];
        mutations: string[];
        actions: string[];
      }>;
    };

    expect(raw.stores).toHaveLength(1);
    const store = raw.stores[0]!;

    expect(store.stateProps).toContain("users");
    expect(store.stateProps).toContain("loading");
    expect(store.mutations).toContain("SET_USERS");
    expect(store.mutations).toContain("SET_LOADING");
    expect(store.actions).toContain("fetchUsers");
  });
});

// ─── scan() — api / types ─────────────────────────────────────────────────────

describe("adapter-vue2 scan() — api / types", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-aux-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans src/api/*.js and emits api symbols", async () => {
    await writeText(
      path.join(tmp, "src", "api", "user.js"),
      `export const getUsers = () => fetch("/api/users");
export const deleteUser = (id) => fetch(\`/api/users/\${id}\`, { method: "DELETE" });
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { apiFiles: Array<{ exports: string[] }> };
    expect(raw.apiFiles).toHaveLength(1);
    expect(raw.apiFiles[0]!.exports).toContain("getUsers");
    expect(raw.apiFiles[0]!.exports).toContain("deleteUser");

    const apiSymbols = mod.symbols.filter((s) => s.kind === "api");
    expect(apiSymbols.map((s) => s.name)).toContain("getUsers");
  });

  it("scans src/types/*.ts and emits type symbols", async () => {
    await writeText(
      path.join(tmp, "src", "types", "user.ts"),
      `export interface User {
  id: string;
  name: string;
}
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const typeSymbols = mod.symbols.filter((s) => s.kind === "type");
    expect(typeSymbols.map((s) => s.name)).toContain("User");
  });
});

// ─── scan() — router ──────────────────────────────────────────────────────────

describe("adapter-vue2 scan() — router", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-router-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("extracts routes from src/router/index.js", async () => {
    await writeText(
      path.join(tmp, "src", "router", "index.js"),
      `import Vue from "vue";
import VueRouter from "vue-router";
import UserList from "../views/UserList.vue";

Vue.use(VueRouter);

const routes = [
  { path: "/", name: "home", component: UserList },
  { path: "/users/:id", name: "user-detail", component: () => import("../views/UserDetail.vue") },
  { path: "/login", component: () => import("../views/Login.vue") },
];

export default new VueRouter({ mode: "history", routes });
`,
    );

    const adapter = createVue2Adapter();
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
    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { routes: unknown[] };
    expect(raw.routes).toEqual([]);
  });
});

// ─── scan() — UI library (Element UI) ────────────────────────────────────────

describe("adapter-vue2 scan() — UI library detection", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-ui-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("detects element-ui and sets raw.uiLibrary.name to 'element-ui'", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^2.7.0",
        "element-ui": "^2.15.0",
      },
    });

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { name: string; version?: string } };
    expect(raw.uiLibrary).toBeDefined();
    expect(raw.uiLibrary!.name).toBe("element-ui");
    expect(raw.uiLibrary!.version).toBe("^2.15.0");
  });

  it("extracts Element UI component names from .vue source files", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: {
        vue: "^2.7.0",
        "element-ui": "^2.15.0",
      },
    });

    await writeText(
      path.join(tmp, "src", "views", "UserList.vue"),
      `<template><div /></template>
<script>
import { ElButton, ElTable } from "element-ui";
export default { components: { ElButton, ElTable } };
</script>
`,
    );

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: { components: string[] } };
    expect(raw.uiLibrary!.components).toContain("ElButton");
    expect(raw.uiLibrary!.components).toContain("ElTable");
  });

  it("leaves raw.uiLibrary undefined when no UI library is installed", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "web",
      dependencies: { vue: "^2.7.0" },
    });

    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    const raw = mod.raw as { uiLibrary?: unknown };
    expect(raw.uiLibrary).toBeUndefined();
  });
});

// ─── scan() — empty project ───────────────────────────────────────────────────

describe("adapter-vue2 scan() — empty project", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-empty-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns all empty arrays without throwing when src/ has no files", async () => {
    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);

    expect(mod.kind).toBe("frontend");
    expect(mod.raw?.framework).toBe("vue2");

    const raw = mod.raw as {
      views: unknown[];
      components: unknown[];
      mixins: unknown[];
      stores: unknown[];
      apiFiles: unknown[];
      typesFiles: unknown[];
      routes: unknown[];
    };

    expect(raw.views).toEqual([]);
    expect(raw.components).toEqual([]);
    expect(raw.mixins).toEqual([]);
    expect(raw.stores).toEqual([]);
    expect(raw.apiFiles).toEqual([]);
    expect(raw.typesFiles).toEqual([]);
    expect(raw.routes).toEqual([]);
    expect(mod.symbols).toEqual([]);
  });
});

// ─── scan() — module metadata ─────────────────────────────────────────────────

describe("adapter-vue2 scan() — module metadata", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-vue2-meta-"));
    await writeJson(path.join(tmp, "package.json"), VUE2_PKG);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("uses default module name 'web'", async () => {
    const adapter = createVue2Adapter();
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("web");
    expect(mod.kind).toBe("frontend");
  });

  it("respects custom moduleName option", async () => {
    const adapter = createVue2Adapter({ moduleName: "legacy" });
    const mod = await adapter.scan(tmp);
    expect(mod.name).toBe("legacy");
  });
});
