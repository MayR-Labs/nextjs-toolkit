import { describe, expect, it } from "vitest";
import { definePermissions } from "./permissions";

const access = definePermissions(["patient.read", "billing.refund", "billing.view", "admin.users"] as const, {
  owner: ["*"],
  cashier: ["billing.*", "patient.read"],
  nurse: ["patient.read"],
});

describe("permissions", () => {
  it("grants by exact, wildcard and star", () => {
    expect(access.can("cashier", "billing.refund")).toBe(true);
    expect(access.can("nurse", "billing.view")).toBe(false);
    expect(access.can(["nurse", "owner"], "admin.users")).toBe(true);
    expect(access.can("ghost", "patient.read")).toBe(false);
  });

  it("lists granted permissions", () => {
    expect(access.granted(["cashier"])).toEqual(["patient.read", "billing.refund", "billing.view"]);
  });
});
