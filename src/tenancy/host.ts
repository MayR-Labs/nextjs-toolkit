export type TenancyMode = "single" | "multi";

export type HostMatch =
  | { kind: "platform" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; host: string }
  | { kind: "none" };

/** Fixed id of the one tenant in single-tenant mode, so data can later move between modes. */
export const DEFAULT_TENANT_ID = "00000000-0000-7000-8000-000000000000";
/** mlwebkit__settings.tenant_id for platform-wide defaults and locks. */
export const PLATFORM_SCOPE = "platform";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return (
    SLUG.test(slug) &&
    !["www", "api", "admin", "app", "platform"].includes(slug)
  );
}

/** Classifies a request host for multi-tenant routing. Pure, so it is easy to test. */
export function matchHost(
  rawHost: string | null | undefined,
  options: { rootDomain?: string; platformHost?: string },
): HostMatch {
  const host = (rawHost ?? "").toLowerCase().split(":")[0]?.trim() ?? "";
  if (!host) return { kind: "none" };
  const platform = options.platformHost?.toLowerCase().split(":")[0];
  if (platform && host === platform) return { kind: "platform" };
  const root = options.rootDomain?.toLowerCase().split(":")[0];
  if (root && host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1));
    return isValidSlug(slug) ? { kind: "subdomain", slug } : { kind: "none" };
  }
  if (root && host === root) return { kind: "none" };
  return { kind: "custom", host };
}
