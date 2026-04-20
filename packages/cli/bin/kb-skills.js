#!/usr/bin/env node
// Thin launcher: defer to the compiled ESM entry.
// Keeping this file plain JS means zero runtime compile overhead for users.
import("../dist/index.js").catch((err) => {
  console.error(err);
  process.exit(1);
});