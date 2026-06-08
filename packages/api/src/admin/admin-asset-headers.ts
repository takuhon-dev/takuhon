/**
 * Strict admin Content-Security-Policy + security headers for a *bundled*
 * admin SPA served from static assets (security.md §1.2 admin pages).
 *
 * Unlike {@link createAdminUiApp}'s per-request policy, this variant carries no
 * nonce: the SPA's scripts and styles are external, same-origin files, so
 * `script-src 'self'` / `style-src 'self'` cover them without `'unsafe-inline'`.
 * `require-trusted-types-for 'script'` is retained to block DOM-XSS sinks.
 */
const ADMIN_ASSET_CSP = [
  "default-src 'self'",
  "img-src 'self' blob:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "require-trusted-types-for 'script'",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Response headers to attach to admin SPA asset responses. Adapters serving the
 * bundle (e.g. Cloudflare Workers Assets) clone the asset response and apply
 * these so the admin origin keeps the strict CSP and is never cached.
 */
export function adminAssetSecurityHeaders(): Record<string, string> {
  return {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'content-security-policy': ADMIN_ASSET_CSP,
    'cache-control': 'private, no-store',
  };
}
