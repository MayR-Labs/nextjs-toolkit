import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineSettings,
  envExample,
  parseEnvValue,
  resolveSetting,
  settingEnvName,
} from ".";

const registry = defineSettings({
  "billing.timing": {
    schema: z.enum(["prepaid", "postpaid", "by-payer"]),
    default: "by-payer",
    scope: "branch",
    group: "Billing",
    label: "When patients pay",
  },
  "lab.expiry_days": {
    schema: z.number().int(),
    default: 90,
    scope: "tenant",
    group: "Pharmacy",
    label: "Expiry warning",
  },
});
const timing = registry["billing.timing"];

describe("settings", () => {
  it("derives env names", () => {
    expect(settingEnvName("billing.timing")).toBe("SETTING_BILLING_TIMING");
    expect(settingEnvName("billing.timing", "ikeja")).toBe(
      "SETTING_BILLING_TIMING__IKEJA",
    );
  });

  it("parses env strings, JSON and lists", () => {
    expect(parseEnvValue(z.number(), "12")).toBe(12);
    expect(parseEnvValue(z.boolean(), "false")).toBe(false);
    expect(parseEnvValue(z.array(z.string()), "a, b")).toEqual(["a", "b"]);
    expect(parseEnvValue(z.enum(["x"]), "y")).toBeUndefined();
  });

  it("single-tenant: env wins, branch env first, then DB, then default", () => {
    const base = {
      key: "billing.timing",
      definition: timing,
      mode: "single" as const,
    };
    expect(
      resolveSetting({
        ...base,
        env: { SETTING_BILLING_TIMING: "prepaid" },
        stored: { tenant: "postpaid" },
      }),
    ).toEqual({ value: "prepaid", source: "env", readOnly: true });
    expect(
      resolveSetting({
        ...base,
        branch: "IKEJA",
        env: {
          SETTING_BILLING_TIMING: "prepaid",
          SETTING_BILLING_TIMING__IKEJA: "postpaid",
        },
        stored: {},
      }).value,
    ).toBe("postpaid");
    expect(
      resolveSetting({ ...base, env: {}, stored: { tenant: "postpaid" } })
        .source,
    ).toBe("tenant");
    expect(
      resolveSetting({
        ...base,
        env: {},
        stored: { tenant: "postpaid" },
        adminEditable: false,
      }),
    ).toEqual({ value: "by-payer", source: "default", readOnly: true });
  });

  it("multi-tenant: lock beats tenant, tenant beats platform default and env", () => {
    const base = {
      key: "billing.timing",
      definition: timing,
      mode: "multi" as const,
    };
    expect(
      resolveSetting({
        ...base,
        env: {},
        stored: {
          platform: { value: "prepaid", locked: true },
          tenant: "postpaid",
        },
      }).source,
    ).toBe("platform-lock");
    expect(
      resolveSetting({
        ...base,
        env: { SETTING_BILLING_TIMING: "prepaid" },
        stored: { tenant: "postpaid" },
      }).value,
    ).toBe("postpaid");
    expect(
      resolveSetting({
        ...base,
        env: { SETTING_BILLING_TIMING: "prepaid" },
        stored: {},
      }).source,
    ).toBe("platform-default");
  });

  it("ignores stored values that no longer validate", () => {
    expect(
      resolveSetting({
        key: "billing.timing",
        definition: timing,
        mode: "multi",
        env: {},
        stored: { tenant: "bogus" },
      }).value,
    ).toBe("by-payer");
  });

  it("renders an env example", () => {
    expect(envExample(registry)).toContain("# SETTING_LAB_EXPIRY_DAYS=90");
  });
});
