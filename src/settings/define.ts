import type { z } from "zod";

export type SettingScope = "tenant" | "branch";

export interface SettingDefinition<S extends z.ZodType = z.ZodType> {
  schema: S;
  default: z.infer<S>;
  /** "branch" settings can also be set per branch. */
  scope: SettingScope;
  group: string;
  label: string;
  help?: string;
  /** Options shown in the settings screen for enum-like values. */
  options?: Array<{ value: string; label: string }>;
}

export type SettingsRegistry = Record<string, SettingDefinition>;

export type SettingValue<
  R extends SettingsRegistry,
  K extends keyof R,
> = z.infer<R[K]["schema"]>;

/** Declares the app's settings. Keys look like "billing.timing". */
export function defineSettings<R extends SettingsRegistry>(registry: R): R {
  return registry;
}

/** "billing.timing" → "SETTING_BILLING_TIMING"; with a branch → "SETTING_BILLING_TIMING__IKEJA". */
export function settingEnvName(key: string, branch?: string): string {
  const base = `SETTING_${key.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
  return branch ? `${base}__${branch.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}` : base;
}

/**
 * Parses an env string against a setting's schema. Tries the raw string, then JSON (numbers,
 * booleans, objects), then a comma-separated list. Returns undefined when none fits.
 */
export function parseEnvValue(schema: z.ZodType, raw: string | undefined): unknown {
  if (raw === undefined || raw === "") return undefined;
  const candidates: unknown[] = [raw];
  try {
    candidates.push(JSON.parse(raw));
  } catch {
    // not JSON
  }
  candidates.push(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const candidate of candidates) {
    const result = schema.safeParse(candidate);
    if (result.success) return result.data;
  }
  return undefined;
}
