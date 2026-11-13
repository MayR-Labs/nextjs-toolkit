import { describe, expect, it, vi } from "vitest";
import { createErrorReporter, scrub } from ".";

describe("errors", () => {
  it("scrubs sensitive fields deeply", () => {
    expect(scrub({ name: "A", password: "x", nested: [{ phoneNumber: "080" }] })).toEqual({
      name: "A",
      password: "[scrubbed]",
      nested: [{ phoneNumber: "[scrubbed]" }],
    });
  });

  it("returns a reference and passes scrubbed context", () => {
    const capture = vi.fn();
    const reporter = createErrorReporter({ name: "test", capture });
    const ref = reporter.capture(new Error("x"), { extra: { email: "a@b.c" } });
    expect(ref).toMatch(/^[0-9A-F]{8}$/);
    expect(capture.mock.calls[0]?.[1].extra).toEqual({ email: "[scrubbed]" });
  });
});
