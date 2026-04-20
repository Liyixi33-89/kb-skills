// ESLint 9 Flat Config — minimal, dependency-light.
// Only lints plain JS (eslint.config.mjs / scripts). TypeScript source files
// are type-checked & syntax-validated by `pnpm typecheck` (tsc -b), so they
// are intentionally ignored here to avoid pulling in typescript-eslint.
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tpl",
      "**/*.md",
      "**/*.ts",
      "**/*.tsx",
      "pnpm-lock.yaml",
      "packages/core/assets/**",
      "examples/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
