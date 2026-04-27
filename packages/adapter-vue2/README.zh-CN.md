# @kb-skills/adapter-vue2

[English](./README.md) | **中文**

> **Vue 2 + Vuex** 前端扫描适配器，为 [`kb-skills`](https://github.com/Liyixi33-89/kb-skills) 提供支持。

解析你的 Vue 2 项目（Options API `.vue` SFC）并输出 `ModuleInfo`，供 [`@kb-skills/core`](../core) 生成五层知识库。

支持检测以下内容：

| 类型 | 检测方式 |
|---|---|
| **视图 / 页面** | `src/views/**/*.vue` + `src/pages/**/*.vue` — data、computed、watch、methods、API 调用 |
| **组件** | `src/components/**/*.vue` — props（数组和对象风格）、emits（`this.$emit`） |
| **Mixin** | `src/mixins/**/*.{js,ts}` — 导出的 mixin 对象 |
| **Vuex Store** | `src/store/**/*.{js,ts}` — state、mutations、actions、namespace |
| **API 文件** | `src/api/**/*.{js,ts}` — 导出的 fetch 封装 |
| **类型** | `src/types/**/*.ts` — interface + type alias |
| **路由** | `src/router/index.{js,ts}` — `{ path, component, name }` 路由对象 |
| **UI 组件库** | `element-ui` / `element-plus` / `vant` / `antd` / `antd-mobile` / `@mui/material` |

## 安装

```bash
npm i -D @kb-skills/cli @kb-skills/adapter-vue2
```

> 对 `@kb-skills/core` 有对等依赖（由 `@kb-skills/cli` 自动传递安装）。

## 使用方式

当 `kb-skills init` 检测到 `package.json` 中包含 `vue ^2.x` 或 `vue-template-compiler` 时，会自动接入此适配器。生成的 `kb-skills.config.ts` 如下：

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

### 配置项

```ts
import { createVue2Adapter } from "@kb-skills/adapter-vue2";

createVue2Adapter({
  moduleName: "web", // 可选，默认值："web"
});
```

## UI 组件库检测

适配器扫描 `src/` 下所有 `.vue`、`.ts`、`.js` 文件，收集从检测到的 UI 库包中导入的所有 **PascalCase 命名导入**。

| `package.json` 依赖 | `raw.uiLibrary.name` |
|---|---|
| `element-ui` | `"element-ui"` |
| `element-plus` | `"element-plus"` |
| `vant` | `"vant"` |
| `antd` | `"antd"` |
| `antd-mobile` | `"antd-mobile"` |
| `@mui/material` | `"material-ui"` |

优先级：以上表格中第一个匹配项优先。

## 输出结构

适配器返回一个 `ModuleInfo`，其 `raw` 字段类型为 `Vue2Raw`：

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
  uiLibrary?: UiLibraryInfo;       // 检测到的 UI 库
}
```

### `Vue2PageInfo`（视图 / 页面）

```ts
interface Vue2PageInfo extends TsFileInfo {
  name:       string;   // 文件名（不含扩展名），如 "UserList"
  dataProps:  string[]; // data() 属性名
  computeds:  string[]; // computed 属性名
  watchProps: string[]; // watch 属性名
  methods:    string[]; // methods 方法名
  apiCalls:   string[]; // this.$xxx / api.xxx 调用名
}
```

### `Vue2StoreInfo`（Vuex 模块）

```ts
interface Vue2StoreInfo extends TsFileInfo {
  namespace?:  string;   // 来自 namespaced: true + 目录名
  stateProps:  string[]; // state 属性名
  mutations:   string[]; // mutation 名称
  actions:     string[]; // action 名称
}
```

完整类型定义请参见 [`@kb-skills/core` → `types.ts`](../core/src/types.ts)。

## 环境要求

- Node.js **>= 18.17**
- `package.json` 中包含 `vue ^2.x` **或** `vue-template-compiler` 的 Vue 2 项目

## 许可证

[MIT](../../LICENSE)
