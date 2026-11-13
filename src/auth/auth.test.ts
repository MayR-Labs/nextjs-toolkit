import { describe, expect, it, vi } from "vitest";
import {
  type AuthDatabase,
  type AuthDriver,
  AuthError,
  type AuthProvider,
  createAuth,
} from ".";

const database = {} as AuthDatabase;

const driver = (
  name: string,
  overrides: Partial<AuthDriver> = {},
): AuthDriver => ({
  name,
  signInMode: "password",
  invitePath: "/reset-password",
  getSession: async () => ({ user: { id: "u1", email: "a@b.c", name: "A" } }),
  signOut: async () => {},
  createUser: async () => "u1",
  inviteUser: async () => "u1",
  revokeAllSessions: async () => {},
  password: null,
  handler: {
    GET: async () => new Response(name),
    POST: async () => new Response(name),
  },
  ...overrides,
});

const provider = (
  name: string,
  overrides?: Partial<AuthDriver>,
): AuthProvider => ({
  name,
  signInMode: overrides?.signInMode ?? "password",
  create: vi.fn(() => driver(name, overrides)),
});

describe("createAuth", () => {
  it("creates only the provider AUTH_DRIVER selects", async () => {
    const a = provider("better-auth");
    const b = provider("clerk", { signInMode: "hosted" });
    const auth = createAuth({
      database,
      env: { AUTH_DRIVER: "clerk" },
      providers: [a, b],
    });
    expect(auth.signInMode).toBe("hosted");
    expect(await (await auth.handler.GET(new Request("http://x"))).text()).toBe(
      "clerk",
    );
    expect(a.create).not.toHaveBeenCalled();
  });

  it("defaults to the first provider and passes headers through", async () => {
    const getSession = vi.fn(async () => null);
    const auth = createAuth({
      database,
      env: {},
      providers: [provider("better-auth", { getSession })],
    });
    expect(auth.driver).toBe("better-auth");
    const headers = new Headers({ cookie: "x" });
    await auth.getSession(headers);
    expect(getSession).toHaveBeenCalledWith(headers);
  });

  it("refuses password flows on hosted providers and unknown drivers", async () => {
    const auth = createAuth({
      database,
      env: { AUTH_DRIVER: "clerk" },
      providers: [provider("clerk", { signInMode: "hosted" })],
    });
    await expect(
      auth.password.signIn({ email: "a", password: "b" }, new Headers()),
    ).rejects.toBeInstanceOf(AuthError);
    const missing = createAuth({
      database,
      env: { AUTH_DRIVER: "clerk" },
      providers: [provider("better-auth")],
    });
    await expect(missing.getSession(new Headers())).rejects.toThrow(
      /auth\/clerk/,
    );
  });

  it("treats sessions older than AUTH_ABSOLUTE_TIMEOUT_HOURS as signed out", async () => {
    const old = new Date(Date.now() - 3 * 3_600_000);
    const auth = createAuth({
      database,
      env: { AUTH_ABSOLUTE_TIMEOUT_HOURS: 2 },
      providers: [
        provider("better-auth", {
          getSession: async () => ({
            user: { id: "u1", email: "a@b.c", name: "A" },
            createdAt: old,
          }),
        }),
      ],
    });
    expect(await auth.getSession(new Headers())).toBeNull();
  });
});

describe("inviteUser", () => {
  it("lands on the provider's page under the app or a tenant's URL", async () => {
    const inviteUser = vi.fn(async () => "u1");
    const auth = createAuth({
      database,
      env: {},
      baseURL: "https://app.test/",
      providers: [
        provider("clerk", {
          signInMode: "hosted",
          invitePath: "/sign-up",
          inviteUser,
        }),
      ],
    });
    await auth.inviteUser({ email: "a@b.c", name: "A" });
    await auth.inviteUser({
      email: "a@b.c",
      name: "A",
      baseURL: "https://acme.app.test",
    });
    expect(
      inviteUser.mock.calls.map(
        (c) => (c as unknown as [{ redirectTo: string }])[0].redirectTo,
      ),
    ).toEqual(["https://app.test/sign-up", "https://acme.app.test/sign-up"]);
  });
});
