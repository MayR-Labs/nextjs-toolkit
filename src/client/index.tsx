"use client";

import { createContext, type ReactNode, use, useEffect, useRef } from "react";

/** Values the browser needs, resolved on the server per request (never NEXT_PUBLIC_*). */
export type PublicConfig = Record<string, string | number | boolean | null | undefined>;

const PublicConfigContext = createContext<PublicConfig>({});

export function PublicConfigProvider({ value, children }: { value: PublicConfig; children: ReactNode }) {
  return <PublicConfigContext value={value}>{children}</PublicConfigContext>;
}

export function usePublicConfig(): PublicConfig {
  return use(PublicConfigContext);
}

const scripts: Record<string, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js",
  hcaptcha: "https://js.hcaptcha.com/1/api.js",
};

/**
 * Renders the configured captcha widget. Its token is posted with the form as
 * `cf-turnstile-response` or `h-captcha-response`.
 */
export function CaptchaWidget({ provider, siteKey }: { provider?: string; siteKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!provider || provider === "off" || !scripts[provider]) return;
    if (document.querySelector(`script[src="${scripts[provider]}"]`)) return;
    const script = document.createElement("script");
    script.src = scripts[provider] as string;
    script.async = true;
    document.head.appendChild(script);
  }, [provider]);
  if (!provider || provider === "off" || !siteKey) return null;
  return <div ref={ref} className={provider === "turnstile" ? "cf-turnstile" : "h-captcha"} data-sitekey={siteKey} />;
}
