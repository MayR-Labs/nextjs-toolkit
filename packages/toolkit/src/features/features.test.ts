import { describe, expect, it } from "vitest";
import { generateLicenceKeys, resolveFeatures, signLicence, verifyLicence } from ".";

const registry = {
  patients: { label: "Patients" },
  billing: { label: "Billing", requires: ["patients"] },
  pharmacy: { label: "Pharmacy", requires: ["patients", "inventory"] },
  inventory: { label: "Inventory" },
  wards: { label: "Wards", requires: ["patients"] },
};

describe("features", () => {
  it("applies overrides and dependencies", () => {
    const set = resolveFeatures(registry, ["billing"], "+pharmacy,-wards,+nope");
    expect([...set].sort()).toEqual(["billing", "inventory", "patients", "pharmacy"]);
  });

  it("removing a dependency removes its dependants", () => {
    const set = resolveFeatures(registry, ["patients", "billing", "wards"], "-patients");
    expect(set.size).toBe(0);
  });

  it("removing a shared dependency terminates and removes every dependant", () => {
    const chain = {
      billing: { label: "B" },
      outpatients: { label: "O", requires: ["billing"] },
      triage: { label: "T", requires: ["outpatients"] },
      notes: { label: "N" },
    };
    expect([...resolveFeatures(chain, ["triage", "outpatients", "billing", "notes"], "-billing")]).toEqual(["notes"]);
  });

  it("signs and verifies licences", () => {
    const keys = generateLicenceKeys();
    const key = signLicence({ licensee: "St Luke", edition: "clinic", expiresAt: "2020-01-01" }, keys.privateKey);
    const check = verifyLicence(key, keys.publicKey);
    expect(check).toMatchObject({ valid: true, expired: true });
    const tampered = `${Buffer.from('{"licensee":"x","edition":"hospital"}').toString("base64url")}.${key.split(".")[1]}`;
    expect(verifyLicence(tampered, keys.publicKey).valid).toBe(false);
  });
});
