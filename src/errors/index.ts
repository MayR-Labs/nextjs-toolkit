import { randomBytes } from "node:crypto";
import {
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";

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
export function scrub(
  value: unknown,
  keys: string[] = DEFAULT_SCRUB,
  depth = 0,
): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, keys, depth + 1));
  const lower = keys.map((k) => k.toLowerCase());
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      lower.some((s) => k.toLowerCase().includes(s.toLowerCase()))
        ? "[scrubbed]"
        : scrub(v, keys, depth + 1),
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

/** An error-reporting provider the app can select by name (`ERRORS_DRIVER`). Created on first use. */
export interface ErrorProvider {
  name: string;
  create(context: { env: EnvReader }): ErrorDriver;
}

export interface ErrorReporterOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Provider name, or a driver object. Defaults to `ERRORS_DRIVER`, then "console". */
  driver?: string | ErrorDriver;
  /** Providers that need an SDK, e.g. `sentry` from `@mlabshq/nextjs-webkit/errors/sentry`. */
  providers?: ErrorProvider[];
  /** Keys scrubbed from `extra`. Defaults to DEFAULT_SCRUB. */
  scrub?: string[];
}

export function createErrorReporter(options: ErrorReporterOptions = {}) {
  const env = envReader(options.env);
  const given = typeof options.driver === "object" ? options.driver : undefined;
  const selected =
    given?.name ??
    (options.driver as string | undefined) ??
    env.str("ERRORS_DRIVER", "console");
  const providers: ErrorProvider[] = [
    { name: "console", create: () => consoleDriver },
    ...(options.providers ?? []),
  ];
  const scrubKeys = options.scrub ?? DEFAULT_SCRUB;

  // Reporting must never throw: a misconfigured provider falls back to the console.
  const driver = lazy((): ErrorDriver => {
    if (given) return given;
    try {
      return pickProvider(providers, selected, {
        variable: "ERRORS_DRIVER",
        module: "error reporting",
        hints: {
          sentry:
            "add `sentry` from @mlabshq/nextjs-webkit/errors/sentry to `providers` (and install @sentry/nextjs).",
        },
      }).create({ env });
    } catch (error) {
      console.error(
        "[errors] falling back to the console:",
        (error as Error).message,
      );
      return consoleDriver;
    }
  });

  return {
    driver: selected,
    capture(error: unknown, context: ErrorContext = {}): string {
      const ref = errorRef();
      try {
        driver().capture(error, {
          ...context,
          extra: scrub(context.extra, scrubKeys) as never,
          ref,
        });
      } catch (reportError) {
        console.error("[error reporter failed]", reportError);
      }
      return ref;
    },
  };
}

export type ErrorReporter = ReturnType<typeof createErrorReporter>;
