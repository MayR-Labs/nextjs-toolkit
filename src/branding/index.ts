export interface Branding {
  name: string;
  shortName: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  markUrl?: string;
  faviconUrl?: string;
  ogImageUrl?: string;
  primaryColor: string;
  accentColor: string;
  sidebarColor?: string;
  font?: string;
  poweredBy: boolean;
  org: {
    name?: string;
    legalName?: string;
    rcNumber?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normaliseHex(
  value: string | undefined,
  fallback: string,
): string {
  if (!value || !HEX.test(value.trim())) return fallback;
  let hex = value.trim().replace("#", "");
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return `#${hex.toLowerCase()}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableText(background: string): "#ffffff" | "#0f172a" {
  return contrastRatio(background, "#ffffff") >=
    contrastRatio(background, "#0f172a")
    ? "#ffffff"
    : "#0f172a";
}

const pick = (env: Record<string, string | undefined>, key: string) =>
  env[key] || undefined;

/** Branding from BRAND_* / ORG_* env, over the app's defaults. */
export function brandingFromEnv(
  env: Record<string, string | undefined>,
  defaults: Branding,
): Branding {
  return mergeBranding(defaults, {
    name: pick(env, "BRAND_NAME"),
    shortName: pick(env, "BRAND_SHORT_NAME"),
    tagline: pick(env, "BRAND_TAGLINE"),
    description: pick(env, "BRAND_DESCRIPTION"),
    logoUrl: pick(env, "BRAND_LOGO_URL"),
    logoDarkUrl: pick(env, "BRAND_LOGO_DARK_URL"),
    markUrl: pick(env, "BRAND_MARK_URL"),
    faviconUrl: pick(env, "BRAND_FAVICON_URL"),
    ogImageUrl: pick(env, "BRAND_OG_IMAGE_URL"),
    primaryColor: pick(env, "BRAND_PRIMARY_COLOR"),
    accentColor: pick(env, "BRAND_ACCENT_COLOR"),
    sidebarColor: pick(env, "BRAND_SIDEBAR_COLOR"),
    font: pick(env, "BRAND_FONT"),
    poweredBy: env.BRAND_POWERED_BY
      ? env.BRAND_POWERED_BY !== "false"
      : undefined,
    org: {
      name: pick(env, "ORG_NAME"),
      legalName: pick(env, "ORG_LEGAL_NAME"),
      rcNumber: pick(env, "ORG_RC_NUMBER"),
      email: pick(env, "ORG_EMAIL"),
      phone: pick(env, "ORG_PHONE"),
      address: pick(env, "ORG_ADDRESS"),
      website: pick(env, "ORG_WEBSITE"),
    },
  });
}

type BrandingInput = Partial<Omit<Branding, "org">> & {
  org?: Partial<Branding["org"]>;
};

/** Fills unset fields from `base`. Used for env and for tenant settings alike. */
export function mergeBranding(base: Branding, over: BrandingInput): Branding {
  const clean = <T extends object>(o: T) =>
    Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== undefined && v !== ""),
    ) as Partial<T>;
  const merged: Branding = {
    ...base,
    ...clean(over),
    org: { ...base.org, ...clean(over.org ?? {}) },
  };
  merged.shortName = over.shortName || (over.name ? over.name : base.shortName);
  merged.primaryColor = normaliseHex(merged.primaryColor, base.primaryColor);
  merged.accentColor = normaliseHex(merged.accentColor, base.accentColor);
  if (merged.sidebarColor)
    merged.sidebarColor = normaliseHex(
      merged.sidebarColor,
      merged.primaryColor,
    );
  return merged;
}

/** CSS custom properties for the theme. */
export function brandCssVariables(brand: Branding): Record<string, string> {
  const sidebar = brand.sidebarColor ?? brand.primaryColor;
  return {
    "--brand-primary": brand.primaryColor,
    "--brand-primary-fg": readableText(brand.primaryColor),
    "--brand-accent": brand.accentColor,
    "--brand-accent-fg": readableText(brand.accentColor),
    "--brand-sidebar": sidebar,
    "--brand-sidebar-fg": readableText(sidebar),
  };
}
