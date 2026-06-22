/**
 * Browser entry for the contact widget, built to a single IIFE asset
 * (`dist/contact-widget.js`) plus `dist/contact-widget.css`.
 *
 * If the page sets `window.TAKUHON_CONTACT = { siteKey: '0x...' }` before this
 * script loads, the widget auto-mounts on DOM ready. The named export is also
 * exposed on the IIFE global (`TakuhonContact.mountContactWidget`) for manual
 * mounting.
 */

import type { ContactWidgetOptions } from './config.js';
import { mountContactWidget } from './widget.js';
import './styles.css';

declare global {
  interface Window {
    TAKUHON_CONTACT?: Partial<ContactWidgetOptions> & { siteKey: string };
  }
}

function autoMount(): void {
  const config = window.TAKUHON_CONTACT;
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
