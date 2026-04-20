import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { resolve: false, entry: "src/index.ts" },
  tsconfig: "./tsconfig.build.json",
  sourcemap: true,
  clean: true,
  target: "node18",
  splitting: false,
  shims: false,
  treeshake: true,
});