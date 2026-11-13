/**
 * Roles map to permission patterns. A pattern is an exact permission ("patient.read"), a prefix
 * wildcard ("billing.*") or "*" for everything.
 *
 *   const access = definePermissions(["patient.read", "billing.refund"] as const, {
 *     cashier: ["billing.*", "patient.read"],
 *   });
 *   access.can("cashier", "billing.refund") // true
 */
export function definePermissions<P extends string, R extends string>(
  permissions: readonly P[],
  roles: Record<R, readonly string[]>,
) {
  const matches = (pattern: string, permission: string) =>
    pattern === "*" ||
    pattern === permission ||
    (pattern.endsWith(".*") && permission.startsWith(pattern.slice(0, -1)));

  return {
    permissions,
    roles: Object.keys(roles) as R[],
    /** Whether any of `userRoles` grants `permission`. Unknown roles grant nothing. */
    can(userRoles: string | readonly string[], permission: P): boolean {
      const list = typeof userRoles === "string" ? [userRoles] : userRoles;
      return list.some((role) =>
        ((roles as Record<string, readonly string[]>)[role] ?? []).some((p) => matches(p, permission)),
      );
    },
    /** Every permission a set of roles grants, e.g. for the roles screen. */
    granted(userRoles: readonly string[]): P[] {
      return permissions.filter((p) => this.can(userRoles, p));
    },
  };
}

export type Access = ReturnType<typeof definePermissions>;
