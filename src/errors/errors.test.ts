import { describe, expect, it, vi } from "vitest";
import { createErrorReporter, scrub } from ".";

describe("errors", () => {
  it("scrubs sensitive fields deeply", () => {
    expect(
      scrub({ name: "A", password: "x", nested: [{ phoneNumber: "080" }] }),
    ).toEqual({
      name: "A",
      password: "[scrubbed]",
      nested: [{ phoneNumber: "[scrubbed]" }],
    });
  });

  it("returns a reference and passes scrubbed context", () => {
    const capture = vi.fn();
    const reporter = createErrorReporter({ driver: { name: "test", capture } });
    const ref = reporter.capture(new Error("x"), { extra: { email: "a@b.c" } });
    expect(ref).toMatch(/^[0-9A-F]{8}$/);
    expect(capture.mock.calls[0]?.[1].extra).toEqual({ email: "[scrubbed]" });
  });

  it("selects the driver from ERRORS_DRIVER and falls back to the console when misconfigured", () => {
    const capture = vi.fn();
    const custom = {
      name: "custom",
      create: () => ({ name: "custom", capture }),
    };
    createErrorReporter({
      env: { ERRORS_DRIVER: "custom" },
      providers: [custom],
    }).capture(new Error("x"));
    expect(capture).toHaveBeenCalledOnce();

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = createErrorReporter({ env: { ERRORS_DRIVER: "sentry" } });
    expect(() => reporter.capture(new Error("y"))).not.toThrow();
    expect(log.mock.calls[0]?.[1]).toMatch(/errors\/sentry/);
    log.mockRestore();
  });
});
