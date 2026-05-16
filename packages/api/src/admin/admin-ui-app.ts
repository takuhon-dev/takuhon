import { Hono } from 'hono';

import { renderAdminHtml } from './admin-html.js';

/**
 * Per-request CSP (security.md §1.3). Differs from the public CSP:
 *  - `img-src` drops `data:` and adds `blob:` for client-side previews.
 *  - `style-src` and `script-src` drop `unsafe-inline` and pin a nonce.
 *  - `require-trusted-types-for 'script'` blocks DOM-XSS sinks.
 */
function adminCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "img-src 'self' blob:",
    `style-src 'self' 'nonce-${nonce}'`,
    `script-src 'self' 'nonce-${nonce}'`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "require-trusted-types-for 'script'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

/**
 * Hono factory for the `/admin` HTML editor. Mounted by adapters at
 * `/admin` (so the sub-app sees `/` as its root path). Each request gets a
 * freshly-generated nonce shared between the CSP header and the inline
 * `<style>` / `<script>` tags.
 */
export function createAdminUiApp(): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const nonce = generateNonce();
    c.header('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('referrer-policy', 'strict-origin-when-cross-origin');
    c.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    c.header('content-security-policy', adminCsp(nonce));
    c.header('cache-control', 'private, no-store');
    return c.html(renderAdminHtml(nonce));
  });

  return app;
}
