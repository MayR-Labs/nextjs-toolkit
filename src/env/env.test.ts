import { describe, expect, it } from "vitest";
import { booleanString, commaList, emailList, requireWith } from ".";

describe("env helpers", () => {
  it("parses comma lists", () => {
    expect(commaList().parse(" a, b ,,c ")).toEqual(["a", "b", "c"]);
    expect(commaList().parse(undefined)).toEqual([]);
    expect(emailList().parse("A@x.com")).toEqual(["a@x.com"]);
  });

  it("parses booleans with a fallback", () => {
    expect(booleanString().parse("TRUE")).toBe(true);
    expect(booleanString(true).parse(undefined)).toBe(true);
    expect(booleanString(true).parse("no")).toBe(false);
  });

  it("reports missing companion keys", () => {
    const issues = requireWith({ S3_BUCKET: "b", S3_REGION: "" }, [
      ["S3_REGION", "S3_BUCKET", "S3 storage"],
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["S3_REGION"]);
  });
});
