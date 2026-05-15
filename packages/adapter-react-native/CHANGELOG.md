# @kb-skills/adapter-react-native

## 1.1.0

### Minor Changes

- 扩展屏幕元数据提取能力，新增 `useState`、`useEffect`、API 调用（`api.xxx`）和事件处理函数（`handleXxx`）的自动识别。
- 新增组件 Props 提取：从 `interface XxxProps { ... }` 中解析 prop 名称和类型。
- 新增导航路由提取：识别 `<Stack.Screen name="..." component={...} />` 模式，填充 `raw.routes`。

## 1.0.0

### Major Changes

- 首次发布 `@kb-skills/adapter-react-native`。

  **功能概述**

  React Native（裸工作流）和 Expo 项目扫描适配器，将 RN 项目结构解析为 KB 知识库，让 AI 精确理解移动端代码架构。

  **核心能力**

  - `createReactNativeAdapter(options?)` — 工厂函数，返回符合 `kb-skills` 适配器接口的实例
  - `detect(projectRoot)` — 检测 `package.json` 中是否包含 `react-native` 或 `expo` 依赖
  - `scan(projectRoot)` — 扫描项目目录，返回 `ModuleInfo`（含 `symbols`、`raw: ReactNativeRaw`）

  **扫描目录**

  | 目录 | 说明 |
  |------|------|
  | `src/screens/` | 屏幕组件（相当于 Web 中的页面） |
  | `src/components/` | 共享 UI 组件 |
  | `src/navigation/` | React Navigation 栈/标签/抽屉导航定义 |
  | `src/hooks/` | 自定义 Hooks |
  | `src/store/` / `src/stores/` | Zustand / Redux Store |
  | `src/api/` | API 辅助文件 |
  | `src/types/` | TypeScript 类型定义 |

  **检测特性**

  - **Expo 检测** — `package.json` 包含 `expo` 时，设置 `raw.isExpo = true`
  - **导航路由** — 提取 `<Stack.Screen name="..." component={...} />` 模式
  - **屏幕元数据** — `useState`、`useEffect`、`api.xxx` 调用、`handleXxx` 处理函数
  - **组件 Props** — 从 `interface XxxProps { ... }` 中提取

  **`ReactNativeRaw` 数据结构**

  ```typescript
  interface ReactNativeRaw {
    isExpo: boolean;
    screens: ScreenInfo[];
    components: ComponentInfo[];
    navigators: NavigatorInfo[];
    hooks: HookInfo[];
    stores: StoreInfo[];
    apiFiles: ApiFileInfo[];
    typesFiles: TypesFileInfo[];
    routes: RouteInfo[];
  }
  ```
