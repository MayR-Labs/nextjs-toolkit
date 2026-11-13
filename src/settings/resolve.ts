import type { TenancyMode } from "../tenancy/host";
import {
  parseEnvValue,
  type SettingDefinition,
  settingEnvName,
} from "./define";

export type SettingSource =
  | "env"
  | "env-branch"
  | "platform-lock"
  | "tenant"
  | "branch"
  | "platform-default"
  | "default";

/** Stored rows relevant to one key: platform row, tenant row and branch row. */
export interface StoredValues {
  platform?: { value: unknown; locked: boolean };
  tenant?: unknown;
  branch?: unknown;
}

export interface ResolveInput {
  key: string;
  definition: SettingDefinition;
  mode: TenancyMode;
  env: Record<string, string | undefined>;
  stored: StoredValues;
  branch?: string;
  /** Single-tenant only: whether values not set in env may come from the database. */
  adminEditable?: boolean;
}

export interface Resolved {
  value: unknown;
  source: SettingSource;
  /** True when the settings screen must show this value read-only. */
  readOnly: boolean;
}

function valid(definition: SettingDefinition, value: unknown): boolean {
  return value !== undefined && definition.schema.safeParse(value).success;
}

/**
 * Single-tenant: env (branch, then global) → database (branch, then tenant) → code default.
 * Multi-tenant: platform lock → database (branch, then tenant) → platform default → env → code default.
 */
export function resolveSetting(input: ResolveInput): Resolved {
  const { definition: def, stored, env, key, branch } = input;
  const branchScoped = def.scope === "branch" && branch;
  const fromEnv = (b?: string) =>
    parseEnvValue(def.schema, env[settingEnvName(key, b)]);

  if (input.mode === "single") {
    if (branchScoped) {
      const v = fromEnv(branch);
      if (v !== undefined)
        return { value: v, source: "env-branch", readOnly: true };
    }
    const v = fromEnv();
    if (v !== undefined) return { value: v, source: "env", readOnly: true };
    const editable = input.adminEditable !== false;
    if (editable && branchScoped && valid(def, stored.branch))
      return { value: stored.branch, source: "branch", readOnly: false };
    if (editable && valid(def, stored.tenant))
      return { value: stored.tenant, source: "tenant", readOnly: false };
    return { value: def.default, source: "default", readOnly: !editable };
  }

  if (stored.platform?.locked && valid(def, stored.platform.value))
    return {
      value: stored.platform.value,
      source: "platform-lock",
      readOnly: true,
    };
  if (branchScoped && valid(def, stored.branch))
    return { value: stored.branch, source: "branch", readOnly: false };
  if (valid(def, stored.tenant))
    return { value: stored.tenant, source: "tenant", readOnly: false };
  if (stored.platform && valid(def, stored.platform.value))
    return {
      value: stored.platform.value,
      source: "platform-default",
      readOnly: false,
    };
  const v = fromEnv();
  if (v !== undefined)
    return { value: v, source: "platform-default", readOnly: false };
  return { value: def.default, source: "default", readOnly: false };
}
