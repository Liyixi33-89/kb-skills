# @kb-skills/adapter-vue3

[English](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/adapter-vue3/README.md) | **中文**

> **Vue 3 + Pinia** 前端扫描适配器，为 [`kb-skills`](https://github.com/Liyixi33-89/kb-skills) 提供支持。

解析你的 Vue 3 项目（Composition API `.vue` SFC）并输出 `ModuleInfo`，供 [`@kb-skills/core`](../core) 生成五层知识库。

支持检测以下内容：

| 类型 | 检测方式 |
|---|---|
| **视图 / 页面** | `src/views/**/*.vue` + `src/pages/**/*.vue` — ref、computed、watch、handler、API 调用 |
| **组件** | `src/components/**/*.vue` — `defineProps`（TS 泛型和对象风格）、`defineEmits` |
| **Composable** | `src/composables/useXxx.{ts,js}` — 导出的 composable 函数 |
| **Pinia Store** | `src/stores/**/*.{ts,js}` — `defineStore` id + 导出 |
| **API 文件** | `src/api/**/*.{ts,js}` — 导出的 fetch 封装 |
| **类型** | `src/types/**/*.ts` — interface + type alias |
| **路由** | `src/router/index.{ts,js}` — `{ path, component, name }` 路由对象 |
| **UI 组件库** | `element-plus` / `naive-ui` / `antd` / `antd-mobile` / `@mui/material` / `@chakra-ui/react` |

## 安装

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-vue3
```

> 对 `@kb-skills/core` 有对等依赖（由 `@kb-skills/cli` 自动传递安装）。

## 使用方式

当 `kb-skills init` 检测到 `package.json` 中包含 `vue ^3.x` 时，会自动接入此适配器。生成的 `kb-skills.config.ts` 如下：

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

### 配置项

```ts
import { createVue3Adapter } from "@kb-skills/adapter-vue3";

createVue3Adapter({
  moduleName: "web", // 可选，默认值："web"
});
```

## UI 组件库检测

适配器扫描 `src/` 下所有 `.vue`、`.ts`、`.js` 文件，收集从检测到的 UI 库包中导入的所有 **PascalCase 命名导入**。

| `package.json` 依赖 | `raw.uiLibrary.name` |
|---|---|
| `element-plus` | `"element-plus"` |
| `naive-ui` | `"naive-ui"` |
| `antd` | `"antd"` |
| `antd-mobile` | `"antd-mobile"` |
| `@mui/material` | `"material-ui"` |
| `@chakra-ui/react` | `"chakra-ui"` |

优先级：以上表格中第一个匹配项优先。

## 输出结构

适配器返回一个 `ModuleInfo`，其 `raw` 字段类型为 `Vue3Raw`：

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
  uiLibrary?:  UiLibraryInfo;        // 检测到的 UI 库
}
```

### `Vue3PageInfo`（视图 / 页面）

```ts
interface Vue3PageInfo extends TsFileInfo {
  name:       string;   // 文件名（不含扩展名），如 "UserList"
  refs:       string[]; // ref() / reactive() 变量名
  computeds:  string[]; // computed() 变量名
  watchCount: number;   // watch() / watchEffect() 调用次数
  apiCalls:   string[]; // api.xxx 调用名
  handlers:   string[]; // const handleXxx = ... 名称
}
```

### `Vue3StoreInfo`（Pinia Store）

```ts
interface Vue3StoreInfo extends TsFileInfo {
  storeId?: string; // defineStore("id", ...) 第一个参数
}
```

完整类型定义请参见 [`@kb-skills/core` → `types.ts`](../core/src/types.ts)。

## 环境要求

- Node.js **>= 18.17**
- `package.json` 中包含 `vue ^3.x` 的 Vue 3 项目

## 许可证

[MIT](../../LICENSE)
