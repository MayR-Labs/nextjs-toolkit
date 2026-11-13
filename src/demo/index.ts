import { ActionError } from "../actions/result";

export type DemoStrategy = "sandbox" | "shared-reset";

export interface DemoConfig {
  enabled: boolean;
  strategy: DemoStrategy;
  /** Actions that stay blocked even in a sandbox (e.g. inviting real email addresses). */
  blocked?: string[];
}

/** Guard for the action client's `beforeMutation`: refuses blocked actions in demo mode. */
export function demoGuard(config: DemoConfig) {
  const blocked = new Set(config.blocked ?? []);
  return (name: string) => {
    if (!config.enabled) return;
    if (blocked.has(name) || [...blocked].some((b) => b.endsWith(".*") && name.startsWith(b.slice(0, -1)))) {
      throw new ActionError("This is disabled in the demo.");
    }
  };
}

/** Relative dates keep demo data current: the seed is always "today" whenever it is rebuilt. */
export function daysFromNow(days: number, hour = 9, minute = 0, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Deterministic pseudo-random numbers so demo data is the same on every rebuild. */
export function seededRandom(seed = 42) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p: number) => next() < p,
  };
}
