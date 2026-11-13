import { type EnvSource, envReader } from "../config";

export type CaptchaProvider = "turnstile" | "hcaptcha";

const endpoints: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
};

/** Form field the widget posts its token in. */
const tokenFields: Record<CaptchaProvider, string> = {
  turnstile: "cf-turnstile-response",
  hcaptcha: "h-captcha-response",
};

const envPrefix: Record<CaptchaProvider, string> = {
  turnstile: "TURNSTILE",
  hcaptcha: "HCAPTCHA",
};

/** Published always-pass keys for local development. */
export const TEST_KEYS: Record<
  CaptchaProvider,
  { siteKey: string; secretKey: string }
> = {
  turnstile: {
    siteKey: "1x00000000000000000000AA",
    secretKey: "1x0000000000000000000000000000000AA",
  },
  hcaptcha: {
    siteKey: "10000000-ffff-ffff-ffff-000000000001",
    secretKey: "0x0000000000000000000000000000000000000000",
  },
};

export interface Captcha {
  provider: CaptchaProvider | "off";
  /** Public key for the widget. Undefined when captcha is off or misconfigured in production. */
  siteKey?: string;
  /** The form field holding the widget's token, e.g. "cf-turnstile-response". */
  tokenField?: string;
  verify(token: string | undefined | null, ip?: string): Promise<boolean>;
  /** Reads the token from a submitted form and verifies it. */
  verifyForm(form: FormData, ip?: string): Promise<boolean>;
}

export interface CaptchaOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Defaults to `CAPTCHA_DRIVER`, then "off". */
  provider?: CaptchaProvider | "off";
  /** Defaults to `TURNSTILE_SITE_KEY` or `HCAPTCHA_SITE_KEY`. */
  siteKey?: string;
  /** Defaults to `TURNSTILE_SECRET_KEY` or `HCAPTCHA_SECRET_KEY`. */
  secretKey?: string;
  fetcher?: typeof fetch;
}

/**
 * Server-side captcha verification. Outside production, missing keys fall back to the provider's
 * always-pass test keys. In production, missing keys make every verification fail (and log why), so a
 * misconfigured deployment never silently accepts bots.
 */
export function createCaptcha(options: CaptchaOptions = {}): Captcha {
  const env = envReader(options.env);
  const provider =
    options.provider ??
    (env.str("CAPTCHA_DRIVER", "off") as CaptchaProvider | "off");
  if (provider === "off")
    return { provider, verify: async () => true, verifyForm: async () => true };
  if (!(provider in endpoints))
    throw new Error(
      `Unknown captcha provider "${provider}" (use turnstile, hcaptcha or off).`,
    );

  const fetcher = options.fetcher ?? fetch;
  const prefix = envPrefix[provider];
  const siteKey = options.siteKey ?? env.str(`${prefix}_SITE_KEY`);
  const secretKey = options.secretKey ?? env.str(`${prefix}_SECRET_KEY`);
  const configured = Boolean(siteKey && secretKey);
  const keys = configured
    ? { siteKey, secretKey }
    : env.production
      ? undefined
      : TEST_KEYS[provider];
  let warned = false;

  async function verify(token: string | undefined | null, ip?: string) {
    if (!keys?.secretKey) {
      if (!warned) {
        console.error(
          `[captcha] ${prefix}_SITE_KEY and ${prefix}_SECRET_KEY are required in production; rejecting.`,
        );
        warned = true;
      }
      return false;
    }
    if (!token) return false;
    const body = new URLSearchParams({
      secret: keys.secretKey,
      response: token,
    });
    if (ip) body.set("remoteip", ip);
    const response = await fetcher(endpoints[provider as CaptchaProvider], {
      method: "POST",
      body,
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  }

  return {
    provider,
    siteKey: keys?.siteKey,
    tokenField: tokenFields[provider],
    verify,
    verifyForm: (form, ip) => {
      const token = form.get(tokenFields[provider]);
      return verify(typeof token === "string" ? token : null, ip);
    },
  };
}
