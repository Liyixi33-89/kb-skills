import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "config/define": "src/config/define.ts",
  },
  format: ["esm"],
  dts: true,
  tsconfig: "./tsconfig.build.json",
  sourcemap: true,
  clean: true,
  target: "node18",
  splitting: false,
  shims: false,
  treeshake: true,
});