import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
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
