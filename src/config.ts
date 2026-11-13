/**
 * Shared plumbing for modules that pick a provider from configuration.
 *
 * Every `create*` function reads its settings from `process.env`, with an optional `env` object layered
 * on top: usually the app's validated env (from `@t3-oss/env-nextjs`), whose values may already be
 * numbers, booleans or lists. Providers are created on first use, so a missing key fails when the service is used, with a
 * message naming the variable, instead of failing the build.
 */

export type EnvSource = Record<string, unknown>;

/** A provider is selected or configured incorrectly. The message names the variable to fix. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface EnvReader {
  /** The value as a string; arrays are joined with commas. Empty strings count as unset. */
  str(name: string): string | undefined;
  str(name: string, fallback: string): string;
  /** Like `str`, but throws a ConfigError saying why the variable is needed. */
  need(name: string, why: string): string;
  int(name: string, fallback: number): number;
  bool(name: string, fallback?: boolean): boolean;
  /** "a, b" or an array → ["a", "b"]. */
  list(name: string): string[];
  production: boolean;
}

/**
 * Reads `source` first, then `process.env`. Passing the app's validated env object means its defaults
 * apply, while variables its schema does not declare still come from `process.env`.
 */
export function envReader(source?: EnvSource): EnvReader {
  const unset = (value: unknown) =>
    value === undefined || value === null || value === "";
  const raw = (name: string): unknown => {
    const value = source?.[name];
    if (!unset(value)) return value;
    const fallback = process.env[name];
    return unset(fallback) ? undefined : fallback;
  };
  function str(name: string): string | undefined;
  function str(name: string, fallback: string): string;
  function str(name: string, fallback?: string): string | undefined {
    const value = raw(name);
    if (value === undefined) return fallback;
    return Array.isArray(value) ? value.join(",") : String(value);
  }
  return {
    str,
    need(name, why) {
      const value = str(name);
      if (!value) throw new ConfigError(`${name} is required ${why}.`);
      return value;
    },
    int(name, fallback) {
      const value = raw(name);
      if (value === undefined) return fallback;
      const n =
        typeof value === "number" ? value : Number.parseInt(String(value), 10);
      return Number.isFinite(n) ? n : fallback;
    },
    bool(name, fallback = false) {
      const value = raw(name);
      if (value === undefined) return fallback;
      if (typeof value === "boolean") return value;
      return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
    },
    list(name) {
      const value = raw(name);
      if (value === undefined) return [];
      const items = Array.isArray(value)
        ? value.map(String)
        : String(value).split(",");
      return items.map((item) => item.trim()).filter(Boolean);
    },
    production: str("NODE_ENV") === "production",
  };
}

/** Builds the value on first call and returns the same one afterwards. */
export function lazy<T>(make: () => T): () => T {
  let made = false;
  let value: T;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value;
  };
}

/** Finds the named provider among the registered ones (later entries override earlier ones). */
export function pickProvider<P extends { name: string }>(
  providers: P[],
  selected: string,
  context: { variable: string; module: string; hints?: Record<string, string> },
): P {
  const found = [...providers].reverse().find((p) => p.name === selected);
  if (found) return found;
  const known = [...new Set(providers.map((p) => p.name))].join(", ");
  const hint = context.hints?.[selected];
  throw new ConfigError(
    hint
      ? `${context.variable}=${selected}: ${hint}`
      : `${context.variable}=${selected} is not a ${context.module} provider this app registered (registered: ${known}).`,
  );
}
