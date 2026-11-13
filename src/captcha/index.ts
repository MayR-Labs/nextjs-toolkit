export type CaptchaProvider = "turnstile" | "hcaptcha";

const endpoints: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
};

/** Published always-pass keys for local development. */
export const TEST_KEYS: Record<CaptchaProvider, { siteKey: string; secretKey: string }> = {
  turnstile: { siteKey: "1x00000000000000000000AA", secretKey: "1x0000000000000000000000000000000AA" },
  hcaptcha: { siteKey: "10000000-ffff-ffff-ffff-000000000001", secretKey: "0x0000000000000000000000000000000000000000" },
};

export interface Captcha {
  provider: CaptchaProvider | "off";
  siteKey?: string;
  verify(token: string | undefined | null, ip?: string): Promise<boolean>;
}

export function createCaptcha(
  provider: CaptchaProvider | "off",
  keys?: { siteKey?: string; secretKey?: string },
  fetcher: typeof fetch = fetch,
): Captcha {
  if (provider === "off") return { provider, verify: async () => true };
  const secret = keys?.secretKey || TEST_KEYS[provider].secretKey;
  return {
    provider,
    siteKey: keys?.siteKey || TEST_KEYS[provider].siteKey,
    async verify(token, ip) {
      if (!token) return false;
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set("remoteip", ip);
      const response = await fetcher(endpoints[provider], { method: "POST", body });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    },
  };
}
