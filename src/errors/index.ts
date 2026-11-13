import { randomBytes } from "node:crypto";

export interface ErrorContext {
  userId?: string;
  tenantId?: string;
  action?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ErrorDriver {
  name: string;
  capture(error: unknown, context: ErrorContext & { ref: string }): void;
}

/** Field names whose values never leave the server in error reports. */
export const DEFAULT_SCRUB = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "note",
  "notes",
  "diagnosis",
  "history",
  "complaint",
  "result",
  "phone",
  "email",
  "address",
  "dateOfBirth",
];

/** Replaces values of sensitive keys (deeply) with "[scrubbed]". */
export function scrub(value: unknown, keys: string[] = DEFAULT_SCRUB, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, keys, depth + 1));
  const lower = keys.map((k) => k.toLowerCase());
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      lower.some((s) => k.toLowerCase().includes(s.toLowerCase())) ? "[scrubbed]" : scrub(v, keys, depth + 1),
    ]),
  );
}

export const consoleDriver: ErrorDriver = {
  name: "console",
  capture(error, context) {
    console.error(`[error ${context.ref}]`, context.action ?? "", error);
  },
};

/** A short code the user can quote to support; also attached to the report. */
export function errorRef(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function createErrorReporter(driver: ErrorDriver = consoleDriver, scrubKeys = DEFAULT_SCRUB) {
  return {
    driver: driver.name,
    capture(error: unknown, context: ErrorContext = {}): string {
      const ref = errorRef();
      try {
        driver.capture(error, { ...context, extra: scrub(context.extra, scrubKeys) as never, ref });
      } catch (reportError) {
        console.error("[error reporter failed]", reportError);
      }
      return ref;
    },
  };
}

export type ErrorReporter = ReturnType<typeof createErrorReporter>;
