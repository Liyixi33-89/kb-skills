import pc from "picocolors";
import type { Logger } from "./types";

export interface LoggerOptions {
  /** Suppress debug output unless true. */
  verbose?: boolean;
  /** Disable colors (useful in CI). */
  noColor?: boolean;
}

const noop = (): void => {};

/**
 * Create a minimal, dependency-light logger used by core and adapters.
 * Consumers can swap in their own Logger implementation via SkillContext.
 */
export const createLogger = (options: LoggerOptions = {}): Logger => {
  const { verbose = false, noColor = false } = options;
  const color = noColor
    ? {
        cyan: (s: string) => s,
        yellow: (s: string) => s,
        red: (s: string) => s,
        green: (s: string) => s,
        gray: (s: string) => s,
      }
    : {
        cyan: pc.cyan,
        yellow: pc.yellow,
        red: pc.red,
        green: pc.green,
        gray: pc.gray,
      };

  return {
    info: (msg: string) => console.log(`${color.cyan("ℹ")} ${msg}`),
    warn: (msg: string) => console.warn(`${color.yellow("⚠")} ${msg}`),
    error: (msg: string) => console.error(`${color.red("✖")} ${msg}`),
    success: (msg: string) => console.log(`${color.green("✔")} ${msg}`),
    debug: verbose ? (msg: string) => console.log(`${color.gray("·")} ${msg}`) : noop,
  };
};