import { z } from "zod";

export { platformUrl } from "./platform";

const isProduction = () => process.env.NODE_ENV === "production";

/** Optional locally, required when NODE_ENV=production. */
export const requiredInProduction = () =>
  isProduction() ? z.string().min(1) : z.string().min(1).optional();

/** "a, b ,c" → ["a", "b", "c"]. Empty or unset → []. */
export const commaList = () =>
  z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );

/** Lower-cased email list, e.g. SUPER_ADMIN_EMAILS. */
export const emailList = () =>
  commaList().transform((emails) => emails.map((e) => e.toLowerCase()));

/** "true" / "1" / "yes" → true. */
export const booleanString = (fallback = false) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === ""
        ? fallback
        : ["true", "1", "yes", "on"].includes(value.toLowerCase()),
    );

/** Integer from a string, with a default. */
export const intString = (fallback: number) =>
  z.coerce.number().int().default(fallback);

/**
 * Cross-field rule helper for `createFinalSchema`: when `by` is set, `key` must be too.
 * Returns the issues instead of throwing so callers can compose several.
 */
export function requireWith<T extends Record<string, unknown>>(
  values: T,
  pairs: Array<[key: keyof T, by: keyof T, what: string]>,
): Array<{ path: string[]; message: string }> {
  const issues: Array<{ path: string[]; message: string }> = [];
  for (const [key, by, what] of pairs) {
    if (values[by] && !values[key]) {
      issues.push({
        path: [String(key)],
        message: `${String(key)} is required with ${String(by)} to set up ${what}`,
      });
    }
  }
  return issues;
}

/** The value of the first defined env var among `names`. */
export function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}
