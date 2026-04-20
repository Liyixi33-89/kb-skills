import { describe, it, expect } from "vitest";
import { createLogger } from "../src/logger";

describe("createLogger", () => {
  it("returns an object with the expected Logger surface", () => {
    const logger = createLogger({ noColor: true });
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.success).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("debug is a no-op when verbose is false", () => {
    const logger = createLogger({ verbose: false, noColor: true });
    const spy = vi_console_spy("log");
    logger.debug("hidden");
    expect(spy.calls.length).toBe(0);
    spy.restore();
  });

  it("debug emits when verbose is true", () => {
    const logger = createLogger({ verbose: true, noColor: true });
    const spy = vi_console_spy("log");
    logger.debug("visible");
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0]!.join(" ")).toContain("visible");
    spy.restore();
  });
});

// ── tiny console spy helper (avoids pulling in vi.spyOn typings) ────────────
function vi_console_spy(method: "log" | "warn" | "error"): {
  calls: unknown[][];
  restore: () => void;
} {
  const original = console[method];
  const calls: unknown[][] = [];
  console[method] = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console[method] = original;
    },
  };
}
