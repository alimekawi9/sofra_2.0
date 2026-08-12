// Resolves the site's public origin for building absolute URLs (e.g. og:image)
// in server contexts where `window.location` isn't available. Vercel doesn't
// expose a scheme, so https:// is assumed for any Vercel-provided host.
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercelProductionUrl) return `https://${vercelProductionUrl}`

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`

  return 'http://localhost:3000'
}
