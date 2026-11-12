import { describe, expect, it } from "vitest";
import { type Branding, brandCssVariables, brandingFromEnv, normaliseHex, readableText } from ".";

const defaults: Branding = {
  name: "Hospital MS",
  shortName: "Hospital MS",
  primaryColor: "#1e4fa0",
  accentColor: "#10b981",
  poweredBy: true,
  org: {},
};

describe("branding", () => {
  it("normalises colours and rejects junk", () => {
    expect(normaliseHex("#ABC", "#000000")).toBe("#aabbcc");
    expect(normaliseHex("blue", "#000000")).toBe("#000000");
  });

  it("picks readable text", () => {
    expect(readableText("#1e4fa0")).toBe("#ffffff");
    expect(readableText("#f8fafc")).toBe("#0f172a");
  });

  it("merges env over defaults", () => {
    const b = brandingFromEnv({ BRAND_NAME: "St. Luke's", BRAND_PRIMARY_COLOR: "zzz", ORG_PHONE: "0800" }, defaults);
    expect(b.name).toBe("St. Luke's");
    expect(b.shortName).toBe("St. Luke's");
    expect(b.primaryColor).toBe("#1e4fa0");
    expect(b.org.phone).toBe("0800");
    expect(brandCssVariables(b)["--brand-primary-fg"]).toBe("#ffffff");
  });
});
