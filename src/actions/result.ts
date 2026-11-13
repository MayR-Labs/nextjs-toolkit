export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      ref?: string;
    };

/** An expected failure whose message is safe to show the user. */
export class ActionError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export const idle: ActionResult<never> | null = null;

/**
 * FormData → plain object. Repeated keys become arrays; keys ending in [] are always arrays;
 * empty strings become undefined so optional schema fields work.
 */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, raw] of form.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    const value =
      typeof raw === "string" ? (raw === "" ? undefined : raw) : raw;
    const isList = rawKey.endsWith("[]");
    const key = isList ? rawKey.slice(0, -2) : rawKey;
    if (isList) {
      const list = (out[key] as unknown[]) ?? [];
      if (value !== undefined) list.push(value);
      out[key] = list;
    } else if (key in out && out[key] !== undefined) {
      out[key] = Array.isArray(out[key])
        ? [...(out[key] as unknown[]), value]
        : [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
