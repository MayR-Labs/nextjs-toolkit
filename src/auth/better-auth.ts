import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import type { Dialect } from "../db/dialect";
import type { Database } from "../db/driver";
import type { ToolkitTables } from "../tables";

export interface AuthConfig {
  db: Database;
  dialect: Dialect;
  tables: Pick<ToolkitTables, "tkUsers" | "tkSessions" | "tkAccounts" | "tkVerifications">;
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
  sendResetPassword?: (data: { email: string; name: string; url: string }) => Promise<void>;
  /** Any further Better Auth options (plugins, hooks). Merged last. */
  extend?: Partial<BetterAuthOptions>;
}

const providerFor = { postgres: "pg", mysql: "mysql", sqlite: "sqlite" } as const;

/** Better Auth on the app's own database, mapped onto the toolkit's tk_ tables. */
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
        user: config.tables.tkUsers,
        session: config.tables.tkSessions,
        account: config.tables.tkAccounts,
        verification: config.tables.tkVerifications,
      },
    }),
    advanced: { database: { generateId: false } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.signUp === "invite-only",
      minPasswordLength: 8,
      sendResetPassword: config.sendResetPassword
        ? async ({ user, url }) =>
            config.sendResetPassword?.({ email: user.email, name: user.name, url })
        : undefined,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: config.google ? { google: config.google } : undefined,
    session: {
      expiresIn: idleSeconds,
      updateAge: Math.min(60, idleSeconds / 2),
      cookieCache:
        config.session.strategy === "cookie-cache"
          ? { enabled: true, maxAge: (config.session.cookieCacheMinutes ?? 5) * 60 }
          : undefined,
    },
    rateLimit: config.lockout
      ? {
          enabled: true,
          customRules: {
            "/sign-in/email": { window: config.lockout.minutes * 60, max: config.lockout.attempts },
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
  input: { email: string; name: string; password: string; emailVerified?: boolean },
): Promise<string> {
  const ctx = await auth.$context;
  const email = input.email.toLowerCase();
  const existing = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: false });
  if (existing) return existing.user.id;
  const user = await ctx.internalAdapter.createUser({
    email,
    name: input.name,
    emailVerified: input.emailVerified ?? true,
  }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user.id;
}

/** Signs a user out everywhere. */
export async function revokeAllSessions(auth: Auth, userId: string): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}
