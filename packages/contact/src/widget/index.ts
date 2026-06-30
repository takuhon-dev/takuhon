/**
 * Browser entry for the contact widget, built to a single IIFE asset
 * (`dist/contact-widget.js`) plus `dist/contact-widget.css`.
 *
 * The widget auto-mounts on DOM ready from one of two config sources, checked
 * in order:
 *
 *  1. `window.TAKUHON_CONTACT = { siteKey: '0x...' }` set before this script
 *     loads — convenient for pages that can emit an inline script.
 *  2. `data-*` attributes on this script's own tag, e.g.
 *     `<script src="/contact-widget.js" data-site-key="0x..." defer>` — the
 *     CSP-safe path for server-rendered pages whose policy forbids inline
 *     script (`@takuhon/api`'s turnkey injection uses this).
 *
 * The named export is also exposed on the IIFE global
 * (`TakuhonContact.mountContactWidget`) for manual mounting.
 */

import { resolveWidgetConfig, type ContactWidgetOptions } from './config.js';
import { mountContactWidget } from './widget.js';
import './styles.css';

declare global {
  interface Window {
    TAKUHON_CONTACT?: Partial<ContactWidgetOptions> & { siteKey: string };
  }
}

// Captured synchronously at module-eval time: `document.currentScript` points
// at the loading <script> only during its own top-level execution, not later
// inside the DOMContentLoaded callback, so it must be read now and remembered.
const ownScript = document.currentScript;

function autoMount(): void {
  const dataset = ownScript instanceof HTMLElement ? ownScript.dataset : undefined;
  const config = resolveWidgetConfig(window.TAKUHON_CONTACT, dataset);
  if (!config?.siteKey) return;
  mountContactWidget({
    siteKey: config.siteKey,
    endpoint: config.endpoint,
    locale: config.locale,
    lang: config.lang ?? document.documentElement.lang,
    pageUrl: config.pageUrl ?? window.location.href,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true });
} else {
  autoMount();
}

export { mountContactWidget };
export type { ContactWidgetOptions };
