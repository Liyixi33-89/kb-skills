# @kb-skills/adapter-vue2

> Scan adapter for **Vue 2 + Vuex** frontends, powering [`kb-skills`](https://github.com/Liyixi33-89/kb-skills).

Parses your Vue 2 project (Options API `.vue` SFCs) and emits a `ModuleInfo` consumed by
[`@kb-skills/core`](../core) to produce the 5-layer Knowledge Base.

It detects:

| Kind | How it's detected |
|---|---|
| **Views / Pages** | `src/views/**/*.vue` + `src/pages/**/*.vue` — data, computed, watch, methods, API calls |
| **Components** | `src/components/**/*.vue` — props (array & object style), emits (`this.$emit`) |
| **Mixins** | `src/mixins/**/*.{js,ts}` — exported mixin objects |
| **Vuex Stores** | `src/store/**/*.{js,ts}` — state, mutations, actions, namespace |
| **API files** | `src/api/**/*.{js,ts}` — exported fetch wrappers |
| **Types** | `src/types/**/*.ts` — interfaces + type aliases |
| **Routes** | `src/router/index.{js,ts}` — `{ path, component, name }` route objects |
| **UI Library** | `element-ui` / `element-plus` / `vant` / `antd` / `antd-mobile` / `@mui/material` |

## Install

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-vue2
```

> Peer-depends on `@kb-skills/core` (installed transitively by `@kb-skills/cli`).

## Usage

`kb-skills init` wires the adapter automatically when it detects `vue ^2.x` or
`vue-template-compiler` in your `package.json`. The generated `kb-skills.config.ts` looks like:

```ts
import { defineConfig } from "@kb-skills/cli/config";
import vue2Adapter from "@kb-skills/adapter-vue2";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "web", path: "./web", adapter: vue2Adapter() },
  ],
});
```

### Options

```ts
import { createVue2Adapter } from "@kb-skills/adapter-vue2";

createVue2Adapter({
  moduleName: "web", // optional, default: "web"
});
```

## UI library detection

The adapter scans every `.vue`, `.ts`, and `.js` file under `src/` and collects
all **PascalCase named imports** from the detected UI library package.

| `package.json` dep | `raw.uiLibrary.name` |
|---|---|
| `element-ui` | `"element-ui"` |
| `element-plus` | `"element-plus"` |
| `vant` | `"vant"` |
| `antd` | `"antd"` |
| `antd-mobile` | `"antd-mobile"` |
| `@mui/material` | `"material-ui"` |

Priority: first match in the table above wins.

## Output shape

The adapter returns a `ModuleInfo` whose `raw` is a `Vue2Raw`:

```ts
interface Vue2Raw {
  framework: "vue2";
  views:      Vue2PageInfo[];      // src/views/ + src/pages/
  components: Vue2ComponentInfo[]; // src/components/
  mixins:     Vue2MixinInfo[];     // src/mixins/
  stores:     Vue2StoreInfo[];     // src/store/ (Vuex)
  apiFiles:   TsFileInfo[];        // src/api/
  typesFiles: TsFileInfo[];        // src/types/
  routes:     Vue2Route[];         // src/router/index.js|ts
  uiLibrary?: UiLibraryInfo;       // detected UI library
}
```

### `Vue2PageInfo` (view / page)

```ts
interface Vue2PageInfo extends TsFileInfo {
  name:       string;   // file stem, e.g. "UserList"
  dataProps:  string[]; // data() property names
  computeds:  string[]; // computed property names
  watchProps: string[]; // watch property names
  methods:    string[]; // methods block names
  apiCalls:   string[]; // this.$xxx / api.xxx call names
}
```

### `Vue2StoreInfo` (Vuex module)

```ts
interface Vue2StoreInfo extends TsFileInfo {
  namespace?:  string;   // from namespaced: true + directory name
  stateProps:  string[]; // state property names
  mutations:   string[]; // mutation names
  actions:     string[]; // action names
}
```

See [`@kb-skills/core` → `types.ts`](../core/src/types.ts) for the full type list.

## Requirements

- Node.js **>= 18.17**
- A Vue 2 project with `vue ^2.x` **or** `vue-template-compiler` in `package.json`

## License

[MIT](../../LICENSE)
