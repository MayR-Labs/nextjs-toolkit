/** The public URL of this deployment, from APP_URL or the host platform's own variables. */
export function platformUrl(): string | undefined {
  const env = process.env;
  if (env.APP_URL) return env.APP_URL;
  if (env.URL) return env.URL; // Netlify
  if (env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  if (env.HEROKU_APP_NAME)
    return `https://${env.HEROKU_APP_NAME}.herokuapp.com`;
  return undefined;
}
