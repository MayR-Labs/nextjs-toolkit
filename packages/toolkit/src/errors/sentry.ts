import * as Sentry from "@sentry/nextjs";
import type { ErrorDriver } from "./index";

/** Reports through @sentry/nextjs. Initialise Sentry in the app's instrumentation files. */
export const sentryDriver: ErrorDriver = {
  name: "sentry",
  capture(error, context) {
    Sentry.withScope((scope) => {
      scope.setTag("ref", context.ref);
      if (context.action) scope.setTag("action", context.action);
      if (context.tenantId) scope.setTag("tenant", context.tenantId);
      for (const [k, v] of Object.entries(context.tags ?? {})) scope.setTag(k, v);
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.extra) scope.setExtras(context.extra);
      Sentry.captureException(error);
    });
  },
};
