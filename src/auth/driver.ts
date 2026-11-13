import { ActionError } from "../actions/result";
import {
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";
import type { Dialect } from "../db/dialect";
import type { Database } from "../db/driver";
import { platformUrl } from "../env/platform";
import type { WebkitTables } from "../tables";

/** What auth needs from the database: the connection `createDatabase` returns satisfies it. */
export interface AuthDatabase {
  db: Database;
  dialect: Dialect;
  schema: WebkitTables;
}

export interface AuthContext {
  env: EnvReader;
  database: AuthDatabase;
  /** The app's public URL (option `baseURL`, else APP_URL or the host platform's URL). */
  baseURL: string;
}

/** A signed-in user. `id` is always the local `mlwebkit__users` id, whichever provider signed them in. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  /** When the session started, if the provider exposes it (Better Auth does; Clerk does not). */
  createdAt?: Date;
}

/** Email and password flows the app renders itself. Only drivers with `signInMode: "password"` have them. */
export interface PasswordAuth {
  signIn(
    input: { email: string; password: string },
    headers: Headers,
  ): Promise<void>;
  /** Emails a link to `redirectTo?token=…`. Does not reveal whether the email has an account. */
  requestReset(
    input: { email: string; redirectTo: string },
    headers: Headers,
  ): Promise<void>;
  reset(
    input: { token: string; password: string },
    headers: Headers,
  ): Promise<void>;
}

export interface AuthDriver {
  name: string;
  /** "password": the app renders its own sign-in pages. "hosted": the provider's components or pages. */
  signInMode: "password" | "hosted";
  /** Where invitation links land, relative to the app URL: "/reset-password" or "/sign-up". */
  invitePath: string;
  getSession(headers: Headers): Promise<AuthSession | null>;
  signOut(headers: Headers): Promise<void>;
  /** Creates a user (or finds one by email) without signing them in. Returns the local user id. */
  createUser(input: {
    email: string;
    name: string;
    password?: string;
  }): Promise<string>;
  /**
   * Creates the user if needed and sends them a link to set a password (Better Auth, default
   * `<baseURL>/reset-password`) or a Clerk invitation (default `<baseURL>/sign-up`).
   */
  inviteUser(input: {
    email: string;
    name: string;
    redirectTo?: string;
  }): Promise<string>;
  /** Signs a user out on every device. */
  revokeAllSessions(userId: string): Promise<void>;
  password: PasswordAuth | null;
  /** Route handlers for `app/api/auth/[...all]/route.ts`. */
  handler: {
    GET(request: Request): Promise<Response>;
    POST(request: Request): Promise<Response>;
  };
}

/** An auth provider the app can select by name (`AUTH_DRIVER`). Created on first use. */
export interface AuthProvider {
  name: string;
  signInMode: AuthDriver["signInMode"];
  create(context: AuthContext): AuthDriver;
}

export type AuthErrorCode =
  | "invalid-credentials"
  | "invalid-token"
  | "unsupported"
  | "rejected";

/** An expected auth failure whose message is safe to show the user. */
export class AuthError extends ActionError {
  constructor(
    message: string,
    public code: AuthErrorCode,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** The connection from `createDatabase`; auth uses its `mlwebkit__*` tables. */
  database: AuthDatabase;
  /** Defaults to `AUTH_DRIVER`, then the first provider. */
  driver?: string;
  /** The providers this app ships, e.g. `[betterAuthProvider(), clerkProvider()]`. */
  providers: AuthProvider[];
  /** The app's public URL. Defaults to APP_URL, then the host platform's URL, then localhost:3000. */
  baseURL?: string;
}

async function requestHeaders(given?: Headers): Promise<Headers> {
  if (given) return given;
  const { headers } = await import("next/headers");
  return new Headers(await headers());
}

/**
 * The app's auth, backed by whichever provider `AUTH_DRIVER` selects. Every method reads the current
 * request's headers itself when none are passed.
 */
export function createAuth(options: AuthOptions) {
  const env = envReader(options.env);
  if (options.providers.length === 0)
    throw new Error("createAuth needs at least one provider.");
  const selected =
    options.driver ??
    env.str("AUTH_DRIVER") ??
    options.providers[0]?.name ??
    "";
  const provider = lazy(() =>
    pickProvider(options.providers, selected, {
      variable: "AUTH_DRIVER",
      module: "auth",
      hints: {
        clerk:
          "add `clerkProvider` from @mlabshq/nextjs-webkit/auth/clerk to `providers` (and install @clerk/nextjs).",
        "better-auth":
          "add `betterAuthProvider` from @mlabshq/nextjs-webkit/auth/better-auth to `providers` (and install better-auth).",
      },
    }),
  );
  const baseURL = (
    options.baseURL ??
    env.str("APP_URL") ??
    platformUrl() ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const driver = lazy(() =>
    provider().create({ env, database: options.database, baseURL }),
  );
  // Absolute lifetime for providers that report when a session started (0 turns it off).
  const maxAgeMs = env.int("AUTH_ABSOLUTE_TIMEOUT_HOURS", 0) * 3_600_000;
  const unsupported = () =>
    new AuthError(
      `Password sign-in is not available with ${selected}; use its sign-in page.`,
      "unsupported",
    );

  return {
    /** The selected provider's name. */
    driver: selected,
    baseURL,
    get signInMode() {
      return provider().signInMode;
    },
    /** The signed-in user, or null. Sessions older than AUTH_ABSOLUTE_TIMEOUT_HOURS count as signed out. */
    getSession: async (headers?: Headers): Promise<AuthSession | null> => {
      const session = await driver().getSession(await requestHeaders(headers));
      if (session?.createdAt && maxAgeMs > 0)
        if (Date.now() - session.createdAt.getTime() > maxAgeMs) return null;
      return session;
    },
    signOut: async (headers?: Headers) =>
      driver().signOut(await requestHeaders(headers)),
    createUser: (input: { email: string; name: string; password?: string }) =>
      driver().createUser(input),
    /**
     * Creates the user if needed and sends a set-password link or invitation. The link lands on
     * `redirectTo`, else on the provider's page (/reset-password or /sign-up) under `baseURL` (for a
     * tenant's own host) or the app URL.
     */
    inviteUser: (input: {
      email: string;
      name: string;
      redirectTo?: string;
      baseURL?: string;
    }) => {
      const d = driver();
      const { baseURL: base, ...rest } = input;
      return d.inviteUser({
        ...rest,
        redirectTo:
          input.redirectTo ??
          `${(base ?? baseURL).replace(/\/$/, "")}${d.invitePath}`,
      });
    },
    revokeAllSessions: (userId: string) => driver().revokeAllSessions(userId),
    password: {
      signIn: async (
        input: { email: string; password: string },
        headers?: Headers,
      ) => {
        const password = driver().password;
        if (!password) throw unsupported();
        await password.signIn(input, await requestHeaders(headers));
      },
      requestReset: async (
        input: { email: string; redirectTo: string },
        headers?: Headers,
      ) => {
        const password = driver().password;
        if (!password) throw unsupported();
        await password.requestReset(input, await requestHeaders(headers));
      },
      reset: async (
        input: { token: string; password: string },
        headers?: Headers,
      ) => {
        const password = driver().password;
        if (!password) throw unsupported();
        await password.reset(input, await requestHeaders(headers));
      },
    },
    /** `export const { GET, POST } = auth.handler;` in `app/api/auth/[...all]/route.ts`. */
    handler: {
      GET: (request: Request) => driver().handler.GET(request),
      POST: (request: Request) => driver().handler.POST(request),
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
