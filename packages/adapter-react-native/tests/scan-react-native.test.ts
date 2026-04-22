import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import createReactNativeAdapter from "../src/index";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "kb-skills-rn-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

const writeJson = (file: string, obj: unknown) =>
  writeFile(file, JSON.stringify(obj, null, 2), "utf8");

const mkdirs = (...dirs: string[]) =>
  Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));

// ─── detect ───────────────────────────────────────────────────────────────────

describe("adapter-react-native — detect()", () => {
  it("returns true for a react-native project", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-rn-app",
      dependencies: { "react-native": "^0.73.0", react: "^18.0.0" },
    });
    const adapter = createReactNativeAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns true for an Expo project", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-expo-app",
      dependencies: { expo: "^50.0.0", react: "^18.0.0" },
    });
    const adapter = createReactNativeAdapter();
    expect(await adapter.detect(tmp)).toBe(true);
  });

  it("returns false for a plain React web project", async () => {
    await writeJson(path.join(tmp, "package.json"), {
      name: "my-web-app",
      dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
    });
    const adapter = createReactNativeAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });

  it("returns false when package.json is missing", async () => {
    const adapter = createReactNativeAdapter();
    expect(await adapter.detect(tmp)).toBe(false);
  });
});

// ─── scan — screens ───────────────────────────────────────────────────────────

describe("adapter-react-native — scan() screens", () => {
  it("scans src/screens/ and extracts screen info", async () => {
    const screensDir = path.join(tmp, "src", "screens");
    await mkdirs(screensDir);
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { "react-native": "^0.73.0" },
    });

    await writeFile(
      path.join(screensDir, "HomeScreen.tsx"),
      `
import React, { useState, useEffect } from "react";
import { View, Text } from "react-native";
import api from "../api";

const HomeScreen = () => {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.fetchData();
  }, []);

  const handlePress = () => setCount(c => c + 1);

  return <View><Text>{count}</Text></View>;
};

export default HomeScreen;
`,
      "utf8",
    );

    const adapter = createReactNativeAdapter();
    const result = await adapter.scan(tmp);
    const raw = result.raw as import("../src/index").ReactNativeRaw;

    expect(raw.framework).toBe("react-native");
    expect(raw.screens).toHaveLength(1);

    const screen = raw.screens[0]!;
    expect(screen.name).toBe("HomeScreen");
    expect(screen.states).toHaveLength(2);
    expect(screen.effectCount).toBe(1);
    expect(screen.apiCalls).toContain("fetchData");
    expect(screen.handlers).toContain("handlePress");
  });
});

// ─── scan — Expo detection ────────────────────────────────────────────────────

describe("adapter-react-native — scan() Expo", () => {
  it("sets isExpo=true when expo dep is present", async () => {
    await mkdirs(path.join(tmp, "src", "screens"));
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { expo: "^50.0.0", "react-native": "^0.73.0" },
    });

    const adapter = createReactNativeAdapter();
    const result = await adapter.scan(tmp);
    const raw = result.raw as import("../src/index").ReactNativeRaw;

    expect(raw.isExpo).toBe(true);
  });

  it("leaves isExpo undefined for bare React Native", async () => {
    await mkdirs(path.join(tmp, "src", "screens"));
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { "react-native": "^0.73.0" },
    });

    const adapter = createReactNativeAdapter();
    const result = await adapter.scan(tmp);
    const raw = result.raw as import("../src/index").ReactNativeRaw;

    expect(raw.isExpo).toBeUndefined();
  });
});

// ─── scan — navigation ────────────────────────────────────────────────────────

describe("adapter-react-native — scan() navigation", () => {
  it("extracts routes from React Navigation stack navigator", async () => {
    const navDir = path.join(tmp, "src", "navigation");
    await mkdirs(navDir);
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { "react-native": "^0.73.0" },
    });

    await writeFile(
      path.join(navDir, "AppNavigator.tsx"),
      `
import { createStackNavigator } from "@react-navigation/stack";
import HomeScreen from "../screens/HomeScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Stack = createStackNavigator();

export const AppNavigator = () => (
  <Stack.Navigator>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
  </Stack.Navigator>
);
`,
      "utf8",
    );

    const adapter = createReactNativeAdapter();
    const result = await adapter.scan(tmp);
    const raw = result.raw as import("../src/index").ReactNativeRaw;

    expect(raw.navigation).toHaveLength(2);
    const names = raw.navigation.map((r) => r.name);
    expect(names).toContain("Home");
    expect(names).toContain("Profile");
  });
});

// ─── scan — symbols ───────────────────────────────────────────────────────────

describe("adapter-react-native — scan() symbols", () => {
  it("emits page symbols for screens", async () => {
    const screensDir = path.join(tmp, "src", "screens");
    await mkdirs(screensDir);
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { "react-native": "^0.73.0" },
    });
    await writeFile(
      path.join(screensDir, "SettingsScreen.tsx"),
      `export const SettingsScreen = () => null;`,
      "utf8",
    );

    const adapter = createReactNativeAdapter();
    const result = await adapter.scan(tmp);

    const pageSymbols = result.symbols.filter((s) => s.kind === "page");
    expect(pageSymbols).toHaveLength(1);
    expect(pageSymbols[0]!.name).toBe("SettingsScreen");
    expect(pageSymbols[0]!.framework).toBe("react-native");
  });

  it("uses custom moduleName when provided", async () => {
    await mkdirs(path.join(tmp, "src", "screens"));
    await writeJson(path.join(tmp, "package.json"), {
      dependencies: { "react-native": "^0.73.0" },
    });

    const adapter = createReactNativeAdapter({ moduleName: "mobile" });
    const result = await adapter.scan(tmp);
    expect(result.name).toBe("mobile");
  });
});
