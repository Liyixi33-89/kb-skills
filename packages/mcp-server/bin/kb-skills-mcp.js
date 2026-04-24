#!/usr/bin/env node
// Thin launcher: defer to the compiled ESM entry.
import("../dist/index.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
