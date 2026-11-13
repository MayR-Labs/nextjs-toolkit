import type { Kit } from "./db/kit";

/**
 * Tables the toolkit itself relies on. Spread them into the app's `defineTables` factory:
 *   They are added to every schema by `defineTables`; call this yourself only for a custom schema.
 * Users are global identities; what a user may do in a tenant is the app's membership table.
 */
export function webkitTables(t: Kit) {
  const tenants = t.table(
    "mlwebkit__tenants",
    {
      id: t.id(),
      slug: t.text("slug", { length: 63 }).notNull(),
      name: t.text("name").notNull(),
      edition: t.text("edition", { length: 40 }).notNull(),
      /** "+module,-module" on top of the edition preset. */
      features: t.text("features").notNull().default(""),
      status: t.text("status", { length: 20 }).notNull().default("active"),
      plan: t.text("plan", { length: 40 }),
      limits: t.json<Record<string, number>>("limits"),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [t.uniqueIndex("mlwebkit__tenants_slug").on(table.slug)],
  );

  const tenantDomains = t.table(
    "mlwebkit__tenant_domains",
    {
      id: t.id(),
      tenantId: t.ref("tenant_id").notNull(),
      host: t.text("host").notNull(),
      verifiedAt: t.timestamp("verified_at"),
      createdAt: t.createdAt(),
    },
    (table) => [t.uniqueIndex("mlwebkit__tenant_domains_host").on(table.host)],
  );

  // Better Auth models (user, session, account, verification), mapped to mlwebkit__ tables.
  const users = t.table(
    "mlwebkit__users",
    {
      id: t.id(),
      name: t.text("name").notNull(),
      email: t.text("email").notNull(),
      emailVerified: t.bool("email_verified").notNull().default(false),
      image: t.longText("image"),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [t.uniqueIndex("mlwebkit__users_email").on(table.email)],
  );

  const sessions = t.table(
    "mlwebkit__sessions",
    {
      id: t.id(),
      userId: t.ref("user_id").notNull(),
      token: t.text("token").notNull(),
      expiresAt: t.timestamp("expires_at").notNull(),
      ipAddress: t.text("ip_address"),
      userAgent: t.longText("user_agent"),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [
      t.uniqueIndex("mlwebkit__sessions_token").on(table.token),
      t.index("mlwebkit__sessions_user").on(table.userId),
    ],
  );

  const accounts = t.table(
    "mlwebkit__accounts",
    {
      id: t.id(),
      userId: t.ref("user_id").notNull(),
      accountId: t.text("account_id").notNull(),
      providerId: t.text("provider_id").notNull(),
      accessToken: t.longText("access_token"),
      refreshToken: t.longText("refresh_token"),
      idToken: t.longText("id_token"),
      accessTokenExpiresAt: t.timestamp("access_token_expires_at"),
      refreshTokenExpiresAt: t.timestamp("refresh_token_expires_at"),
      scope: t.longText("scope"),
      password: t.longText("password"),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [t.index("mlwebkit__accounts_user").on(table.userId)],
  );

  const verifications = t.table(
    "mlwebkit__verifications",
    {
      id: t.id(),
      identifier: t.text("identifier").notNull(),
      value: t.longText("value").notNull(),
      expiresAt: t.timestamp("expires_at").notNull(),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [
      t.index("mlwebkit__verifications_identifier").on(table.identifier),
    ],
  );

  /** Fixed-window attempt counters (sign-in, password reset): see `createRateLimiter`. */
  const rateLimits = t.table(
    "mlwebkit__rate_limits",
    {
      id: t.id(),
      key: t.text("key").notNull(),
      count: t.int("count").notNull().default(0),
      windowStart: t.timestamp("window_start").notNull(),
    },
    (table) => [t.uniqueIndex("mlwebkit__rate_limits_key").on(table.key)],
  );

  const settings = t.table(
    "mlwebkit__settings",
    {
      id: t.id(),
      /** A tenant id, or "platform" for platform-wide defaults and locks. */
      tenantId: t.ref("tenant_id").notNull(),
      /** "" for tenant-wide, otherwise a branch code. */
      branch: t.text("branch", { length: 40 }).notNull().default(""),
      key: t.text("key", { length: 120 }).notNull(),
      value: t.json<unknown>("value"),
      locked: t.bool("locked").notNull().default(false),
      updatedBy: t.ref("updated_by"),
      updatedAt: t.updatedAt(),
    },
    (table) => [
      t
        .uniqueIndex("mlwebkit__settings_key")
        .on(table.tenantId, table.branch, table.key),
    ],
  );

  const outbox = t.table(
    "mlwebkit__outbox",
    {
      id: t.id(),
      tenantId: t.ref("tenant_id"),
      channel: t.text("channel", { length: 20 }).notNull(),
      to: t.text("to").notNull(),
      subject: t.text("subject"),
      body: t.longText("body").notNull(),
      createdAt: t.createdAt(),
    },
    (table) => [
      t.index("mlwebkit__outbox_tenant").on(table.tenantId, table.createdAt),
    ],
  );

  const paymentEvents = t.table(
    "mlwebkit__payment_events",
    {
      id: t.id(),
      provider: t.text("provider", { length: 40 }).notNull(),
      eventId: t.text("event_id").notNull(),
      type: t.text("type").notNull(),
      payload: t.json<unknown>("payload"),
      createdAt: t.createdAt(),
    },
    (table) => [
      t
        .uniqueIndex("mlwebkit__payment_events_event")
        .on(table.provider, table.eventId),
    ],
  );

  return {
    webkitTenants: tenants,
    webkitTenantDomains: tenantDomains,
    webkitUsers: users,
    webkitSessions: sessions,
    webkitAccounts: accounts,
    webkitVerifications: verifications,
    webkitSettings: settings,
    webkitOutbox: outbox,
    webkitPaymentEvents: paymentEvents,
    webkitRateLimits: rateLimits,
  };
}

export type WebkitTables = ReturnType<typeof webkitTables>;
