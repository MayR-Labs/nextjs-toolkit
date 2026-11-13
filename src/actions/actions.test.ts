import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createErrorReporter } from "../errors";
import { ActionError, createActionClient, formToObject } from ".";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

const errors = createErrorReporter({
  driver: { name: "test", capture: () => {} },
});
const action = createActionClient({
  context: async () => ({ role: "nurse" }),
  errors,
});

describe("actions", () => {
  it("converts form data", () => {
    const form = new FormData();
    form.append("name", "Ada");
    form.append("empty", "");
    form.append("tags[]", "a");
    form.append("tags[]", "b");
    expect(formToObject(form)).toEqual({
      name: "Ada",
      empty: undefined,
      tags: ["a", "b"],
    });
  });

  it("validates input and returns field errors", async () => {
    const run = action("t")
      .input(z.object({ name: z.string().min(2) }))
      .run(async ({ input }) => input.name);
    const bad = await run({ name: "A" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors?.name).toBeDefined();
    expect(await run({ name: "Ada" })).toEqual({ ok: true, data: "Ada" });
  });

  it("runs guards and maps expected errors", async () => {
    const run = action("t")
      .guard((ctx) => {
        if (ctx.role !== "doctor") throw new ActionError("Doctors only");
      })
      .run(async () => 1);
    expect(await run({})).toEqual({
      ok: false,
      error: "Doctors only",
      fieldErrors: undefined,
    });
  });

  it("hides unexpected errors behind a reference", async () => {
    const run = action("t").run(async () => {
      throw new Error("db down");
    });
    const result = await run({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Reference: [0-9A-F]{8}/);
  });
});
