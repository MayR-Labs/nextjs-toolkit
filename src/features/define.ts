export interface FeatureDefinition {
  label: string;
  /** Other features this one cannot work without; enabled automatically. */
  requires?: string[];
}

export type FeatureRegistry = Record<string, FeatureDefinition>;

export function defineFeatures<
  F extends FeatureRegistry,
  E extends Record<string, Array<keyof F & string>>,
>(features: F, editions: E) {
  return { features, editions };
}

/** Parses "+a,-b,c" into additions and removals (bare names are additions). */
export function parseOverrides(spec: string | undefined): {
  add: string[];
  remove: string[];
} {
  const add: string[] = [];
  const remove: string[] = [];
  for (const raw of (spec ?? "").split(",")) {
    const item = raw.trim();
    if (!item) continue;
    if (item.startsWith("-")) remove.push(item.slice(1));
    else add.push(item.replace(/^\+/, ""));
  }
  return { add, remove };
}

/**
 * The enabled set for an edition plus overrides. Unknown names are ignored; dependencies of enabled
 * features are added, and removing a feature also removes everything that requires it.
 */
export function resolveFeatures(
  registry: FeatureRegistry,
  preset: readonly string[],
  overrides?: string,
): Set<string> {
  const { add, remove } = parseOverrides(overrides);
  const removed = new Set(remove);
  const enabled = new Set(
    [...preset, ...add].filter((f) => f in registry && !removed.has(f)),
  );

  // Removed features only grow and are never re-added, so this always terminates.
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of [...enabled]) {
      for (const dep of registry[f]?.requires ?? []) {
        if (removed.has(dep)) {
          enabled.delete(f);
          removed.add(f);
          changed = true;
          break;
        }
        if (!enabled.has(dep) && dep in registry) {
          enabled.add(dep);
          changed = true;
        }
      }
    }
  }
  return enabled;
}
