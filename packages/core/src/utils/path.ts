import path from "node:path";

/** Convert Windows paths to POSIX separators. */
export const toPosix = (p: string): string => p.split(path.sep).join("/");

/** POSIX-style relative path from `from` to `to`. */
export const relPosix = (from: string, to: string): string =>
  toPosix(path.relative(from, to));

/** Convert "PascalCase" / "camelCase" to "kebab-case". */
export const kebab = (name: string): string =>
  name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

/** Get basename without extension. */
export const stemOf = (file: string): string =>
  path.basename(file, path.extname(file));