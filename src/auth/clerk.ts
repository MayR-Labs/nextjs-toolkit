import type { clerkClient as ClerkClientFn } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/driver";
import { newId } from "../db/ids";
import type { WebkitTables } from "../tables";
import type { AuthDriver, AuthProvider, AuthUser } from "./driver";

// Clerk's SDK is loaded on first use, so apps and scripts that run Better Auth never load it.
const clerkServer = () => import("@clerk/nextjs/server");
const auth = async () => (await clerkServer()).auth();
const clerkClient = async () => (await clerkServer()).clerkClient();

export interface ClerkConfig {
  db: Database;
  /** Used for the default invitation redirect, `<baseURL>/sign-up`. */
  baseURL?: string;
  tables: Pick<WebkitTables, "webkitUsers" | "webkitAccounts">;
}

const PROVIDER_ID = "clerk";

type ClerkUser = Awaited<
  ReturnType<Awaited<ReturnType<typeof ClerkClientFn>>["users"]["getUser"]>
>;

function profile(user: ClerkUser) {
  const address = user.primaryEmailAddress ?? user.emailAddresses[0];
  const email = address?.emailAddress.toLowerCase();
  if (!email) throw new Error(`Clerk user ${user.id} has no email address`);
  const name =
    user.fullName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    email;
  /** Only a verified address proves the Clerk user owns it. */
  const verified = address?.verification?.status === "verified";
  return { email, name, verified };
}

function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return {
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
  };
}

/**
 * Clerk as the auth provider. Clerk owns sign-in, passwords and sessions; the local `mlwebkit__users` table
 * stays the source of user ids. A Clerk user is linked to a local user (through `mlwebkit__accounts`) on first
 * sign-in, matching by email, so users invited before they first sign in keep their id. Only a verified
 * Clerk email is matched; an unverified one gets a separate local user.
 *
 * The app must run `clerkMiddleware()` in `proxy.ts`, wrap the root layout in `<ClerkProvider>`, and
 * render Clerk's `<SignIn />`. Clerk reads CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY itself.
 */
export function clerkDriver(config: ClerkConfig): AuthDriver {
  const { db, tables } = config;
  const { webkitUsers, webkitAccounts } = tables;

  async function localUser(id: string): Promise<AuthUser | null> {
    const [row] = await db
      .select({
        id: webkitUsers.id,
        email: webkitUsers.email,
        name: webkitUsers.name,
      })
      .from(webkitUsers)
      .where(eq(webkitUsers.id, id))
      .limit(1);
    return row ?? null;
  }

  /** The local user for an email, created if missing. */
  async function ensureLocalUser(
    email: string,
    name: string,
    emailVerified = true,
  ): Promise<string> {
    const find = async () => {
      const [row] = await db
        .select({ id: webkitUsers.id })
        .from(webkitUsers)
        .where(eq(webkitUsers.email, email))
        .limit(1);
      return row?.id;
    };
    const existing = await find();
    if (existing) return existing;
    const id = newId();
    try {
      await db.insert(webkitUsers).values({ id, email, name, emailVerified });
      return id;
    } catch (error) {
      // Another request created it at the same moment (unique email).
      const raced = await find();
      if (raced) return raced;
      throw error;
    }
  }

  async function emailTaken(email: string): Promise<boolean> {
    const [row] = await db
      .select({ id: webkitUsers.id })
      .from(webkitUsers)
      .where(eq(webkitUsers.email, email))
      .limit(1);
    return Boolean(row);
  }

  async function linkedUserId(
    clerkUserId: string,
  ): Promise<string | undefined> {
    const [link] = await db
      .select({ userId: webkitAccounts.userId })
      .from(webkitAccounts)
      .where(
        and(
          eq(webkitAccounts.providerId, PROVIDER_ID),
          eq(webkitAccounts.accountId, clerkUserId),
        ),
      )
      .limit(1);
    return link?.userId;
  }

  async function link(user: ClerkUser): Promise<string> {
    const already = await linkedUserId(user.id);
    if (already) return already;
    const { email, name, verified } = profile(user);
    // Linking by email hands over an existing local user (and its memberships), so it needs proof the
    // Clerk user owns the address. Unverified: a local user of its own, never an existing one. If the
    // email is already taken locally, that user gets a placeholder address under `.invalid`.
    const userId = verified
      ? await ensureLocalUser(email, name)
      : await ensureLocalUser(
          (await emailTaken(email))
            ? `clerk-${user.id.toLowerCase()}@unverified.invalid`
            : email,
          name,
          false,
        );
    await db.insert(webkitAccounts).values({
      id: newId(),
      userId,
      accountId: user.id,
      providerId: PROVIDER_ID,
    });
    return userId;
  }

  async function clerkIdsFor(userId: string): Promise<string[]> {
    const rows = await db
      .select({ accountId: webkitAccounts.accountId })
      .from(webkitAccounts)
      .where(
        and(
          eq(webkitAccounts.providerId, PROVIDER_ID),
          eq(webkitAccounts.userId, userId),
        ),
      );
    return rows.map((r) => r.accountId);
  }

  async function findClerkUser(email: string): Promise<ClerkUser | undefined> {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    return data[0];
  }

  const notFound = async () => new Response("Not found", { status: 404 });

  return {
    name: "clerk",
    signInMode: "hosted",
    invitePath: "/sign-up",
    async getSession() {
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) return null;
      let userId = await linkedUserId(clerkUserId);
      if (!userId)
        userId = await link(
          await (await clerkClient()).users.getUser(clerkUserId),
        );
      const user = await localUser(userId);
      return user
        ? { user: { ...user, email: user.email.toLowerCase() } }
        : null;
    },
    async signOut() {
      const { sessionId } = await auth();
      if (sessionId)
        await (await clerkClient()).sessions.revokeSession(sessionId);
    },
    async createUser(input) {
      const email = input.email.toLowerCase();
      const existing = await findClerkUser(email);
      const user =
        existing ??
        (await (
          await clerkClient()
        ).users.createUser({
          emailAddress: [email],
          ...splitName(input.name),
          password: input.password,
          skipPasswordRequirement: !input.password,
        }));
      return link(user);
    },
    async inviteUser(input) {
      const email = input.email.toLowerCase();
      const userId = await ensureLocalUser(email, input.name);
      await (await clerkClient()).invitations.createInvitation({
        emailAddress: email,
        redirectUrl:
          input.redirectTo ??
          (config.baseURL ? `${config.baseURL}/sign-up` : undefined),
        ignoreExisting: true,
      });
      return userId;
    },
    async revokeAllSessions(userId) {
      const client = await clerkClient();
      for (const clerkUserId of await clerkIdsFor(userId)) {
        const { data } = await client.sessions.getSessionList({
          userId: clerkUserId,
          status: "active",
        });
        await Promise.all(
          data.map((session) => client.sessions.revokeSession(session.id)),
        );
      }
    },
    password: null,
    handler: { GET: notFound, POST: notFound },
  };
}

/**
 * Clerk as a provider for `createAuth`, on the database `createAuth` was given. Clerk reads
 * CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY itself; for development without an account,
 * `npx clerk@latest init` writes temporary keys.
 */
export function clerkProvider(): AuthProvider {
  return {
    name: "clerk",
    signInMode: "hosted",
    create({ env, database, baseURL }) {
      if (env.production) {
        env.need("CLERK_SECRET_KEY", "in production with AUTH_DRIVER=clerk");
        env.need(
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          "in production with AUTH_DRIVER=clerk",
        );
      }
      const { schema } = database;
      return clerkDriver({
        db: database.db,
        tables: {
          webkitUsers: schema.webkitUsers,
          webkitAccounts: schema.webkitAccounts,
        },
        baseURL,
      });
    },
  };
}
