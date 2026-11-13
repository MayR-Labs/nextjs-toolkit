import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createWebkitEnv, webkitEnvRules } from "./webkit";

afterEach(() => vi.unstubAllEnvs());

describe("createWebkitEnv", () => {
  it("includes every webkit variable with defaults, plus the app's own, typed", () => {
    vi.stubEnv("EDITION", "clinic");
    const env = createWebkitEnv({
      server: { EDITION: z.enum(["clinic", "hospital"]).default("hospital") },
      skipValidation: false,
    });
    expect(env.EDITION).toBe("clinic");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.DEMO_MODE).toBe(false);
    expectTypeOf(env.EDITION).toEqualTypeOf<"clinic" | "hospital">();
    expectTypeOf(env.STORAGE_DRIVER).toEqualTypeOf<
      "local" | "s3" | "cloudinary"
    >();
  });

  it("lets the app override a webkit variable", () => {
    const env = createWebkitEnv({
      server: {
        EMAIL_FROM: z.string().default("Clinic <no-reply@clinic.test>"),
      },
      skipValidation: false,
    });
    expect(env.EMAIL_FROM).toBe("Clinic <no-reply@clinic.test>");
  });

  it("fails with the variable a selected provider needs, and runs app rules", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => createWebkitEnv({ skipValidation: false })).toThrow();
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(() =>
      createWebkitEnv({
        skipValidation: false,
        rules: () => [{ path: ["X"], message: "app rule" }],
      }),
    ).toThrow();
  });
});

describe("webkitEnvRules", () => {
  it("only asks for what the selected providers need", () => {
    expect(
      webkitEnvRules({ STORAGE_DRIVER: "local", EMAIL_DRIVER: "dev" }),
    ).toEqual([]);
    const paths = webkitEnvRules({
      EMAIL_DRIVER: "resend",
      PAYMENTS_PROVIDERS: ["paystack"],
    }).map((i) => i.path[0]);
    expect(paths).toEqual(["RESEND_API_KEY", "PAYSTACK_SECRET_KEY"]);
  });

  it("skips provider keys in demo mode and checks production secrets", () => {
    expect(webkitEnvRules({ DEMO_MODE: true, EMAIL_DRIVER: "resend" })).toEqual(
      [],
    );
    const paths = webkitEnvRules({
      NODE_ENV: "production",
      AUTH_DRIVER: "better-auth",
      STORAGE_DRIVER: "local",
      EMAIL_DRIVER: "dev",
    }).map((i) => i.path[0]);
    expect(paths).toEqual(["AUTH_SECRET", "STORAGE_SECRET"]);
    expect(
      webkitEnvRules({
        NODE_ENV: "production",
        AUTH_DRIVER: "clerk",
        STORAGE_SECRET: "s",
      })[0]?.path,
    ).toEqual(["CLERK_SECRET_KEY"]);
  });
});
