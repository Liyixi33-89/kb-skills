# @kb-skills/adapter-vue3

**English** | [中文](./README.zh-CN.md)

> Scan adapter for **Vue 3 + Pinia** frontends, powering [`kb-skills`](https://github.com/Liyixi33-89/kb-skills).

Parses your Vue 3 project (Composition API `.vue` SFCs) and emits a `ModuleInfo` consumed by
[`@kb-skills/core`](../core) to produce the 5-layer Knowledge Base.

It detects:

| Kind | How it's detected |
|---|---|
| **Views / Pages** | `src/views/**/*.vue` + `src/pages/**/*.vue` — refs, computeds, watch, handlers, API calls |
| **Components** | `src/components/**/*.vue` — `defineProps` (TS generic & object style), `defineEmits` |
| **Composables** | `src/composables/useXxx.{ts,js}` — exported composable functions |
| **Pinia Stores** | `src/stores/**/*.{ts,js}` — `defineStore` id + exports |
| **API files** | `src/api/**/*.{ts,js}` — exported fetch wrappers |
| **Types** | `src/types/**/*.ts` — interfaces + type aliases |
| **Routes** | `src/router/index.{ts,js}` — `{ path, component, name }` route objects |
| **UI Library** | `element-plus` / `naive-ui` / `antd` / `antd-mobile` / `@mui/material` / `@chakra-ui/react` |

## Install

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
```

> Peer-depends on `@kb-skills/core` (installed transitively by `@kb-skills/cli`).

## Usage

`kb-skills init` wires the adapter automatically when it detects `vue ^3.x` in
your `package.json`. The generated `kb-skills.config.ts` looks like:

```ts
import { defineConfig } from "@kb-skills/cli/config";
import vue3Adapter from "@kb-skills/adapter-vue3";

export default defineConfig({
  kbRoot: "./kb",
  modules: [
    { name: "web", path: "./web", adapter: vue3Adapter() },
  ],
});
```

### Options

```ts
import { createVue3Adapter } from "@kb-skills/adapter-vue3";

createVue3Adapter({
  moduleName: "web", // optional, default: "web"
});
```

## UI library detection

The adapter scans every `.vue`, `.ts`, and `.js` file under `src/` and collects
all **PascalCase named imports** from the detected UI library package.

| `package.json` dep | `raw.uiLibrary.name` |
|---|---|
| `element-plus` | `"element-plus"` |
| `naive-ui` | `"naive-ui"` |
| `antd` | `"antd"` |
| `antd-mobile` | `"antd-mobile"` |
| `@mui/material` | `"material-ui"` |
| `@chakra-ui/react` | `"chakra-ui"` |

Priority: first match in the table above wins.

## Output shape

The adapter returns a `ModuleInfo` whose `raw` is a `Vue3Raw`:

```ts
interface Vue3Raw {
  framework:   "vue3";
  views:       Vue3PageInfo[];       // src/views/ + src/pages/
  components:  Vue3ComponentInfo[];  // src/components/
  composables: Vue3ComposableInfo[]; // src/composables/
  stores:      Vue3StoreInfo[];      // src/stores/ (Pinia)
  apiFiles:    TsFileInfo[];         // src/api/
  typesFiles:  TsFileInfo[];         // src/types/
  routes:      Vue3Route[];          // src/router/index.ts|js
  uiLibrary?:  UiLibraryInfo;        // detected UI library
}
```

### `Vue3PageInfo` (view / page)

```ts
interface Vue3PageInfo extends TsFileInfo {
  name:       string;   // file stem, e.g. "UserList"
  refs:       string[]; // ref() / reactive() variable names
  computeds:  string[]; // computed() variable names
  watchCount: number;   // watch() / watchEffect() call count
  apiCalls:   string[]; // api.xxx call names
  handlers:   string[]; // const handleXxx = ... names
}
```

### `Vue3StoreInfo` (Pinia store)

```ts
interface Vue3StoreInfo extends TsFileInfo {
  storeId?: string; // defineStore("id", ...) first argument
}
```

See [`@kb-skills/core` → `types.ts`](../core/src/types.ts) for the full type list.

## Requirements

- Node.js **>= 18.17**
- A Vue 3 project with `vue ^3.x` in `package.json`

## License

[MIT](../../LICENSE)
