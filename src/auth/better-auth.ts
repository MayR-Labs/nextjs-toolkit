import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { isAPIError } from "better-auth/api";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import type { EnvReader } from "../config";
import type { Dialect } from "../db/dialect";
import type { Database } from "../db/driver";
import { randomToken } from "../db/ids";
import { escapeHtml, type MailMessage } from "../email";
import type { WebkitTables } from "../tables";
import { type AuthDriver, AuthError, type AuthProvider } from "./driver";

export interface AuthConfig {
  db: Database;
  dialect: Dialect;
  tables: Pick<
    WebkitTables,
    "webkitUsers" | "webkitSessions" | "webkitAccounts" | "webkitVerifications"
  >;
  secret: string;
  baseURL: string;
  appName: string;
  /** Extra origins allowed to call auth endpoints (tenant domains are added per request by the app). */
  trustedOrigins?: string[] | ((request?: Request) => Promise<string[]>);
  signUp: "invite-only" | "open" | "open-with-approval";
  session: {
    strategy: "database" | "cookie-cache";
    /** Idle timeout: the session slides forward on activity and expires after this many minutes idle. */
    idleMinutes: number;
    cookieCacheMinutes?: number;
  };
  lockout?: { attempts: number; minutes: number };
  google?: { clientId: string; clientSecret: string };
  sendResetPassword?: (data: {
    email: string;
    name: string;
    url: string;
  }) => Promise<void>;
  /** Any further Better Auth options (plugins, hooks). Merged last. */
  extend?: Partial<BetterAuthOptions>;
}

const providerFor = {
  postgres: "pg",
  mysql: "mysql",
  sqlite: "sqlite",
} as const;

/** Better Auth on the app's own database, mapped onto the toolkit's mlwebkit__ tables. */
export function createBetterAuth(config: AuthConfig) {
  const idleSeconds = Math.max(5, config.session.idleMinutes) * 60;
  return betterAuth({
    appName: config.appName,
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(config.db, {
      provider: providerFor[config.dialect],
      schema: {
        user: config.tables.webkitUsers,
        session: config.tables.webkitSessions,
        account: config.tables.webkitAccounts,
        verification: config.tables.webkitVerifications,
      },
    }),
    advanced: { database: { generateId: false } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.signUp === "invite-only",
      minPasswordLength: 8,
      sendResetPassword: config.sendResetPassword
        ? async ({ user, url }) =>
            config.sendResetPassword?.({
              email: user.email,
              name: user.name,
              url,
            })
        : undefined,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: config.google ? { google: config.google } : undefined,
    session: {
      expiresIn: idleSeconds,
      updateAge: Math.min(60, idleSeconds / 2),
      cookieCache:
        config.session.strategy === "cookie-cache"
          ? {
              enabled: true,
              maxAge: (config.session.cookieCacheMinutes ?? 5) * 60,
            }
          : undefined,
    },
    rateLimit: config.lockout
      ? {
          enabled: true,
          customRules: {
            "/sign-in/email": {
              window: config.lockout.minutes * 60,
              max: config.lockout.attempts,
            },
          },
        }
      : undefined,
    ...config.extend,
    plugins: [...(config.extend?.plugins ?? []), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createBetterAuth>;

/**
 * Creates a user with a password directly (invitations, seeding), bypassing sign-up restrictions.
 * Returns the existing user's id when the email is already registered.
 */
export async function createUserWithPassword(
  auth: Auth,
  input: {
    email: string;
    name: string;
    password: string;
    emailVerified?: boolean;
  },
): Promise<string> {
  const ctx = await auth.$context;
  const email = input.email.toLowerCase();
  const existing = await ctx.internalAdapter.findUserByEmail(email, {
    includeAccounts: false,
  });
  if (existing) return existing.user.id;
  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: input.name,
      emailVerified: input.emailVerified ?? true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user.id;
}

/** Signs a user out everywhere. */
export async function revokeAllSessions(
  auth: Auth,
  userId: string,
): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

function toAuthError(
  error: unknown,
  fallback: { message: string; code: AuthError["code"] },
): never {
  if (isAPIError(error)) {
    if (error.status === "UNAUTHORIZED")
      throw new AuthError(fallback.message, fallback.code);
    if (
      typeof error.status === "string" &&
      error.status !== "INTERNAL_SERVER_ERROR"
    )
      throw new AuthError(
        error.body?.message ?? fallback.message,
        fallback.code,
      );
  }
  throw error;
}

/** Wraps a Better Auth instance in the shared AuthDriver interface. */
export function betterAuthDriver(
  auth: Auth,
  options: { baseURL: string },
): AuthDriver {
  const handler = toNextJsHandler(auth);
  const requestReset = (email: string, redirectTo: string, headers?: Headers) =>
    auth.api.requestPasswordReset({
      body: { email: email.toLowerCase(), redirectTo },
      headers,
    });

  return {
    name: "better-auth",
    signInMode: "password",
    invitePath: "/reset-password",
    async getSession(headers) {
      const session = await auth.api.getSession({ headers });
      if (!session) return null;
      return {
        user: {
          id: session.user.id,
          email: session.user.email.toLowerCase(),
          name: session.user.name,
        },
        createdAt: new Date(session.session.createdAt),
      };
    },
    async signOut(headers) {
      await auth.api.signOut({ headers });
    },
    createUser: (input) =>
      createUserWithPassword(auth, {
        ...input,
        password: input.password ?? randomToken(24),
      }),
    async inviteUser(input) {
      const userId = await createUserWithPassword(auth, {
        ...input,
        password: randomToken(24),
      });
      await requestReset(
        input.email,
        input.redirectTo ?? `${options.baseURL}/reset-password`,
      );
      return userId;
    },
    revokeAllSessions: (userId) => revokeAllSessions(auth, userId),
    password: {
      async signIn(input, headers) {
        try {
          await auth.api.signInEmail({
            body: {
              email: input.email.toLowerCase(),
              password: input.password,
            },
            headers,
          });
        } catch (error) {
          toAuthError(error, {
            message: "Email or password is incorrect.",
            code: "invalid-credentials",
          });
        }
      },
      async requestReset(input, headers) {
        try {
          await requestReset(input.email, input.redirectTo, headers);
        } catch (error) {
          toAuthError(error, {
            message: "Could not send the link. Try again.",
            code: "rejected",
          });
        }
      },
      async reset(input, headers) {
        try {
          await auth.api.resetPassword({
            body: { token: input.token, newPassword: input.password },
            headers,
          });
        } catch (error) {
          toAuthError(error, {
            message: "This link has expired. Ask for a new one.",
            code: "invalid-token",
          });
        }
      },
    },
    handler: { GET: handler.GET, POST: handler.POST },
  };
}

/** Anything with a `send` like the webkit's mailer. */
export interface MailSender {
  send(message: MailMessage): Promise<unknown>;
}

export type BetterAuthProviderOptions = Partial<
  Omit<AuthConfig, "db" | "dialect" | "tables">
> & {
  /** Sends password-reset and invitation emails with a default template (unless `sendResetPassword` is given). */
  mailer?: MailSender | (() => MailSender);
};

/** Tenant hosts in multi-tenant mode: the platform host and every `<slug>.<root domain>`. */
function tenancyOrigins(env: EnvReader, baseURL: string) {
  if (env.str("TENANCY_MODE") !== "multi") return undefined;
  const root = env.str("TENANCY_ROOT_DOMAIN")?.split(":")[0];
  const platform = env.str("TENANCY_PLATFORM_HOST")?.split(":")[0];
  return async (request?: Request) => {
    const origin = request?.headers.get("origin");
    if (!origin) return [baseURL];
    const host = new URL(origin).hostname;
    const trusted =
      host === platform || (root ? host.endsWith(`.${root}`) : false);
    return trusted ? [baseURL, origin] : [baseURL];
  };
}

function defaultResetEmail(mailer: () => MailSender, appName: string) {
  return async ({
    email,
    name,
    url,
  }: {
    email: string;
    name: string;
    url: string;
  }) => {
    await mailer().send({
      to: email,
      subject: `Set your ${appName} password`,
      html: `<p>Hello ${escapeHtml(name)},</p><p>Use the link below to set your password. It expires in one hour.</p><p><a href="${url}">Set my password</a></p>`,
      text: `Hello ${name},\n\nSet your password: ${url}\n\nThe link expires in one hour.`,
    });
  };
}

/**
 * Better Auth as a provider for `createAuth`, on the database `createAuth` was given. Settings come from
 * env (AUTH_SECRET, AUTH_SIGN_UP, AUTH_SESSION_STRATEGY, AUTH_IDLE_TIMEOUT_MINUTES,
 * AUTH_COOKIE_CACHE_MINUTES, AUTH_LOCKOUT_*, GOOGLE_*, AUTH_METHODS, BRAND_NAME, TENANCY_*); any option
 * passed here wins. Nothing is built until this provider is selected.
 */
export function betterAuthProvider(
  options: BetterAuthProviderOptions | (() => BetterAuthProviderOptions) = {},
): AuthProvider {
  return {
    name: "better-auth",
    signInMode: "password",
    create({ env, database, baseURL }) {
      const o = typeof options === "function" ? options() : options;
      const secret = o.secret ?? env.str("AUTH_SECRET");
      if (!secret && env.production)
        throw new Error(
          "AUTH_SECRET is required in production with Better Auth.",
        );
      const appName = o.appName ?? env.str("BRAND_NAME", "App");
      const methods = env.list("AUTH_METHODS");
      const googleId = env.str("GOOGLE_CLIENT_ID");
      const googleSecret = env.str("GOOGLE_CLIENT_SECRET");
      const mailer = o.mailer;
      const { schema } = database;
      const auth = createBetterAuth({
        db: database.db,
        dialect: database.dialect,
        tables: {
          webkitUsers: schema.webkitUsers,
          webkitSessions: schema.webkitSessions,
          webkitAccounts: schema.webkitAccounts,
          webkitVerifications: schema.webkitVerifications,
        },
        secret: secret ?? "dev-only-secret-change-me-dev-only-secret",
        baseURL: o.baseURL ?? baseURL,
        appName,
        trustedOrigins: o.trustedOrigins ?? tenancyOrigins(env, baseURL),
        signUp:
          o.signUp ??
          (env.str("AUTH_SIGN_UP", "invite-only") as AuthConfig["signUp"]),
        session: o.session ?? {
          strategy: env.str("AUTH_SESSION_STRATEGY", "database") as
            | "database"
            | "cookie-cache",
          idleMinutes: env.int("AUTH_IDLE_TIMEOUT_MINUTES", 30),
          cookieCacheMinutes: env.int("AUTH_COOKIE_CACHE_MINUTES", 5),
        },
        lockout: o.lockout ?? {
          attempts: env.int("AUTH_LOCKOUT_ATTEMPTS", 5),
          minutes: env.int("AUTH_LOCKOUT_MINUTES", 15),
        },
        google:
          o.google ??
          (googleId &&
          googleSecret &&
          (methods.length === 0 || methods.includes("google"))
            ? { clientId: googleId, clientSecret: googleSecret }
            : undefined),
        sendResetPassword:
          o.sendResetPassword ??
          (mailer
            ? defaultResetEmail(
                typeof mailer === "function" ? mailer : () => mailer,
                appName,
              )
            : undefined),
        extend: o.extend,
      });
      return betterAuthDriver(auth, { baseURL: o.baseURL ?? baseURL });
    },
  };
}
