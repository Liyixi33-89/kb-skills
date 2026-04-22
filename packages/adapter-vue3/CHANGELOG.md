# @kb-skills/adapter-vue3

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
  | Source | `kind` |
  |---|---|
  | `src/views/` + `src/pages/` | `"page"` |
  | `src/components/` | `"component"` |
  | `src/stores/` exports | `"store"` |
  | `src/api/` exports | `"api"` |
  | `src/types/` interfaces | `"type"` |
  | `src/composables/` | `"config"` |
