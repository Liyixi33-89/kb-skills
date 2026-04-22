# @kb-skills/adapter-vue3

## 2.0.0

### Major Changes

- Initial release of `adapter-vue3` — Vue 3 + Pinia scan adapter with Element Plus UI detection.

  **`@kb-skills/adapter-vue3`** _(new package — 1.0.0)_
  - `detect()`: recognises Vue 3 projects via `vue ^3.x` in `package.json`
  - Scans `src/views/` + `src/pages/` (`.vue`) → `raw.views` with `ref / computed / watch / apiCalls / handlers`
  - Scans `src/components/` → `raw.components` with `defineProps` (TS generic) + `defineEmits` (array & TS style)
  - Scans `src/composables/` → `raw.composables`
  - Scans `src/stores/` (Pinia) → `raw.stores` with `storeId` from `defineStore("id", ...)`
  - Scans `src/api/` + `src/types/` → `raw.apiFiles` / `raw.typesFiles`
  - Extracts routes from `src/router/index.ts` → `raw.routes` (`path / component / name`)
  - UI library detection (priority: `element-plus` → `naive-ui` → `antd` → …) → `raw.uiLibrary`
  - 24 integration tests, all passing

  **`@kb-skills/core`** _(minor — new Vue 3 types)_
  - New interfaces: `Vue3PageInfo`, `Vue3ComponentInfo`, `Vue3Route`, `Vue3ComposableInfo`, `Vue3StoreInfo`, `Vue3Raw`
  - `ScanRaw` union type now includes `Vue3Raw`

### Patch Changes

- Updated dependencies
  - @kb-skills/core@0.2.0

## 1.0.0

### Major Changes

- Initial release: Vue 3 + Pinia scan adapter with Element Plus UI detection.

  ## Highlights

  ### Vue 3 SFC scanning
  - Scans `src/views/` and `src/pages/` (compatibility alias) for `.vue` files
  - Extracts `ref()` / `reactive()` variables, `computed()` names, `watch` / `watchEffect` count
  - Extracts `api.xxx` call names and `handleXxx` handler names from `<script setup>`

  ### Component scanning
  - Scans `src/components/*.vue`
  - Extracts `defineProps<{ ... }>()` (TypeScript generic style) → props with optional flag
  - Extracts `defineEmits([...])` (array style) and `defineEmits<{ (e: '...') }>()` (TS style)

  ### Composables & Pinia stores
  - Scans `src/composables/*.ts` → `raw.composables`
  - Scans `src/stores/*.ts` → `raw.stores` with `storeId` from `defineStore("id", ...)`

  ### Router extraction
  - Reads `src/router/index.ts` and extracts `{ path, component, name }` route objects
  - Supports both direct component references and `() => import(...)` lazy imports

  ### UI library detection (Element Plus first)
  - Priority order: `element-plus` → `naive-ui` → `antd` → `antd-mobile` → `@mui/material`
  - Scans all `.vue` / `.ts` / `.js` source files for named imports
  - Emits `raw.uiLibrary: { name, version, components[] }`

  ### Symbol emission

  | Source                      | `kind`        |
  | --------------------------- | ------------- |
  | `src/views/` + `src/pages/` | `"page"`      |
  | `src/components/`           | `"component"` |
  | `src/stores/` exports       | `"store"`     |
  | `src/api/` exports          | `"api"`       |
  | `src/types/` interfaces     | `"type"`      |
  | `src/composables/`          | `"config"`    |
