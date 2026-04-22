# @kb-skills/adapter-vue2

## 1.0.0

### Major Changes

- Initial release: Vue 2 + Vuex scan adapter.

  ## Highlights

  ### Vue 2 SFC scanning (Options API)
  - Scans `src/views/` and `src/pages/` (`.vue`) → `raw.views` with `data / computed / watch / methods / apiCalls`
  - Scans `src/components/` → `raw.components` with `props` (array & object style) + `emits` from `this.$emit`

  ### Mixins & Vuex stores
  - Scans `src/mixins/*.js|ts` → `raw.mixins`
  - Scans `src/store/*.js|ts` (Vuex) → `raw.stores` with `stateProps / mutations / actions / namespace`

  ### Router extraction
  - Reads `src/router/index.js|ts` and extracts `{ path, component, name }` route objects

  ### UI library detection (Element UI first)
  - Priority order: `element-ui` → `element-plus` → `vant` → `antd` → `antd-mobile`
  - Emits `raw.uiLibrary: { name, version, components[] }`

  ### Symbol emission
  | Source | `kind` |
  |---|---|
  | `src/views/` + `src/pages/` | `"page"` |
  | `src/components/` | `"component"` |
  | `src/store/` exports | `"store"` |
  | `src/api/` exports | `"api"` |
  | `src/types/` interfaces | `"type"` |
  | `src/mixins/` | `"config"` |
