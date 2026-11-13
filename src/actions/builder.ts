import { unstable_rethrow } from "next/navigation";
import { type ZodType, z } from "zod";
import type { ErrorReporter } from "../errors";
import { ActionError, type ActionResult, formToObject } from "./result";

export interface ActionClientOptions<Ctx> {
  /** Builds the request context (session, tenant, permissions). Throw ActionError to refuse. */
  context: () => Promise<Ctx>;
  errors: ErrorReporter;
  /** Called for every mutation before the handler (e.g. block writes in demo mode). */
  beforeMutation?: (ctx: Ctx, name: string) => Promise<void> | void;
}

type Guard<Ctx> = (ctx: Ctx) => Promise<void> | void;

/**
 * Builds server actions with one shape: validated input, guards, typed result, captured errors.
 *
 *   export const registerPatient = action("patients.register")
 *     .input(PatientSchema)
 *     .guard(requirePermission("patient.register"))
 *     .run(async ({ input, ctx }) => { … });
 *
 * The returned function works with useActionState (prevState, formData) or with a plain object.
 */
export function createActionClient<Ctx>(options: ActionClientOptions<Ctx>) {
  return function action(name: string): ActionBuilder<Ctx, unknown> {
    return makeBuilder<Ctx, unknown>(options, name, {
      guards: [],
      schema: z.any(),
      mutation: true,
    });
  };
}

export type ServerAction<T> = (
  prevOrInput?: unknown,
  maybeForm?: unknown,
) => Promise<ActionResult<T>>;

export interface ActionBuilder<Ctx, I> {
  input<S extends ZodType>(schema: S): ActionBuilder<Ctx, z.infer<S>>;
  guard(guard: Guard<Ctx>): ActionBuilder<Ctx, I>;
  /** Marks a read-only action (allowed in demo mode, no beforeMutation). */
  readOnly(): ActionBuilder<Ctx, I>;
  run<T>(
    handler: (args: { input: I; ctx: Ctx }) => Promise<T>,
  ): ServerAction<T>;
}

interface BuilderState<Ctx> {
  guards: Guard<Ctx>[];
  schema: ZodType;
  mutation: boolean;
}

function makeBuilder<Ctx, I>(
  options: ActionClientOptions<Ctx>,
  name: string,
  state: BuilderState<Ctx>,
): ActionBuilder<Ctx, I> {
  return {
    input<S extends ZodType>(schema: S) {
      return makeBuilder<Ctx, z.infer<S>>(options, name, { ...state, schema });
    },
    guard(guard: Guard<Ctx>) {
      return makeBuilder<Ctx, I>(options, name, {
        ...state,
        guards: [...state.guards, guard],
      });
    },
    /** Marks a read-only action (allowed in demo mode, no beforeMutation). */
    readOnly() {
      return makeBuilder<Ctx, I>(options, name, { ...state, mutation: false });
    },
    run<T>(handler: (args: { input: I; ctx: Ctx }) => Promise<T>) {
      return async (
        prevOrInput?: unknown,
        maybeForm?: unknown,
      ): Promise<ActionResult<T>> => {
        try {
          const raw =
            maybeForm instanceof FormData
              ? formToObject(maybeForm)
              : prevOrInput instanceof FormData
                ? formToObject(prevOrInput)
                : (prevOrInput ?? {});
          const ctx = await options.context();
          for (const guard of state.guards) await guard(ctx);
          const parsed = state.schema.safeParse(raw);
          if (!parsed.success) {
            return {
              ok: false,
              error: "Please check the highlighted fields.",
              fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
                string,
                string[]
              >,
            };
          }
          if (state.mutation) await options.beforeMutation?.(ctx, name);
          const data = await handler({ input: parsed.data as I, ctx });
          return { ok: true, data };
        } catch (error) {
          unstable_rethrow(error);
          if (error instanceof ActionError)
            return {
              ok: false,
              error: error.message,
              fieldErrors: error.fieldErrors,
            };
          const ref = options.errors.capture(error, { action: name });
          return {
            ok: false,
            error: `Something went wrong. Reference: ${ref}`,
            ref,
          };
        }
      };
    },
  };
}
