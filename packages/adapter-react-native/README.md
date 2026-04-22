# @kb-skills/adapter-react-native

> Scan adapter for **React Native** (bare workflow) and **Expo** projects.

## Installation

```bash
npm install @kb-skills/adapter-react-native @kb-skills/core
```

## Usage

```ts
import createReactNativeAdapter from "@kb-skills/adapter-react-native";

const adapter = createReactNativeAdapter({ moduleName: "app" });

// Auto-detect
const isRN = await adapter.detect("/path/to/rn-project");

// Scan
const moduleInfo = await adapter.scan("/path/to/rn-project");
const raw = moduleInfo.raw; // ReactNativeRaw
```

## Scanned Directories

| Directory | Description |
|---|---|
| `src/screens/` | Screen components (equivalent to pages in web) |
| `src/components/` | Shared UI components |
| `src/navigation/` | React Navigation stack/tab/drawer definitions |
| `src/hooks/` | Custom hooks |
| `src/store/` / `src/stores/` | Zustand / Redux stores |
| `src/api/` | API helper files |
| `src/types/` | TypeScript type definitions |

## Detected Features

- **Expo** — sets `raw.isExpo = true` when `expo` is in `package.json`
- **Navigation routes** — extracts `<Stack.Screen name="..." component={...} />` patterns
- **Screen metadata** — `useState`, `useEffect`, `api.xxx` calls, `handleXxx` handlers
- **Component props** — extracted from `interface XxxProps { ... }`

## `kb-skills.config.ts` Example

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

## Supported Project Layouts

```
my-rn-app/
├── src/
│   ├── screens/        ← scanned
│   ├── components/     ← scanned
│   ├── navigation/     ← scanned
│   ├── hooks/          ← scanned
│   ├── store/          ← scanned
│   ├── api/            ← scanned
│   └── types/          ← scanned
├── android/
├── ios/
└── package.json        ← react-native / expo detected here
```
