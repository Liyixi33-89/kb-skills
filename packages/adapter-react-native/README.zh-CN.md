# @kb-skills/adapter-react-native

[English](https://github.com/Liyixi33-89/kb-skills/blob/main/packages/adapter-react-native/README.md) | **中文**

> **React Native**（裸工作流）和 **Expo** 项目扫描适配器。

## 安装

```bash
npm install @kb-skills/adapter-react-native @kb-skills/core
```

## 使用方式

```ts
import createReactNativeAdapter from "@kb-skills/adapter-react-native";

const adapter = createReactNativeAdapter({ moduleName: "app" });

// 自动检测
const isRN = await adapter.detect("/path/to/rn-project");

// 扫描
const moduleInfo = await adapter.scan("/path/to/rn-project");
const raw = moduleInfo.raw; // ReactNativeRaw
```

## 扫描目录

| 目录 | 说明 |
|---|---|
| `src/screens/` | 屏幕组件（相当于 Web 中的页面） |
| `src/components/` | 共享 UI 组件 |
| `src/navigation/` | React Navigation 栈/标签/抽屉导航定义 |
| `src/hooks/` | 自定义 Hooks |
| `src/store/` / `src/stores/` | Zustand / Redux Store |
| `src/api/` | API 辅助文件 |
| `src/types/` | TypeScript 类型定义 |

## 检测特性

- **Expo** — 当 `package.json` 中包含 `expo` 时，设置 `raw.isExpo = true`
- **导航路由** — 提取 `<Stack.Screen name="..." component={...} />` 模式
- **屏幕元数据** — `useState`、`useEffect`、`api.xxx` 调用、`handleXxx` 处理函数
- **组件 Props** — 从 `interface XxxProps { ... }` 中提取

## `kb-skills.config.ts` 示例

```ts
import createReactNativeAdapter from "@kb-skills/adapter-react-native";

export default {
  modules: [
    {
      name: "app",
      path: ".",
      adapter: createReactNativeAdapter(),
    },
  ],
};
```

## 支持的项目结构

```
my-rn-app/
├── src/
│   ├── screens/        ← 已扫描
│   ├── components/     ← 已扫描
│   ├── navigation/     ← 已扫描
│   ├── hooks/          ← 已扫描
│   ├── store/          ← 已扫描
│   ├── api/            ← 已扫描
│   └── types/          ← 已扫描
├── android/
├── ios/
└── package.json        ← 在此检测 react-native / expo
```
