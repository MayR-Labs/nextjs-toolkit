# @mayrlabs/nextjs-toolkit

Shared infrastructure for MLabs Next.js apps: env validation, a dialect-neutral Drizzle schema kit (SQLite,
PostgreSQL, MySQL), multi-tenancy, Better Auth, settings and feature registries with licences, branding,
storage, email, SMS, captcha, payments, error reporting, a server-action builder, demo helpers and test
utilities. Every provider SDK is an optional peer dependency behind its own subpath export.

```ts
import { defineTables } from "@mayrlabs/nextjs-toolkit/db";
import { toolkitTables } from "@mayrlabs/nextjs-toolkit";

export const schemaFor = defineTables((t) => ({
  ...toolkitTables(t),
  patients: t.table("patients", { id: t.id(), tenantId: t.ref("tenant_id").notNull(), name: t.text("name").notNull() }),
}));
```

See the repository docs for the design and the list of entry points.
