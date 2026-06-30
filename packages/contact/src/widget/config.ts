/**
 * Widget configuration: resolve the caller's options into concrete settings.
 * Locale resolution reuses the core {@link normalizeLocale} so the client and
 * server agree on what `ja` / `en` mean.
 */

import type { ContactLocale } from '../types.js';
import { normalizeLocale } from '../validate.js';

const DEFAULT_ENDPOINT = '/api/contact';

/** Options accepted when mounting the widget (e.g. from a global config object). */
export interface ContactWidgetOptions {
  /** Cloudflare Turnstile site key (public). Required. */
  siteKey: string;
  /** Contact endpoint to POST to. Defaults to `/api/contact` (same origin). */
  endpoint?: string;
  /** Explicit locale override; otherwise resolved from {@link lang}. */
  locale?: string;
  /** The page language (e.g. `document.documentElement.lang`) for locale resolution. */
  lang?: string | null;
  /** The page URL to include with the inquiry (e.g. `location.href`). */
  pageUrl?: string;
}

/** Concrete settings after defaults and locale resolution are applied. */
export interface ResolvedConfig {
  siteKey: string;
  endpoint: string;
  locale: ContactLocale;
  pageUrl?: string;
}

/** A plain key→value view of a script element's `data-*` attributes (DOMStringMap shape). */
export type WidgetDataset = Record<string, string | undefined>;

/**
 * Resolve the widget's mount options from its two config sources: the
 * `window.TAKUHON_CONTACT` global (preferred when it carries a site key) and the
 * loading script's `data-*` attributes. Pure — the browser entry supplies the
 * live `window` / `dataset` values — so the source precedence and attribute
 * mapping stay unit-testable without a DOM. Returns `undefined` when neither
 * source names a site key (nothing to mount).
 */
export function resolveWidgetConfig(
  globalConfig: (Partial<ContactWidgetOptions> & { siteKey?: string }) | undefined,
  dataset: WidgetDataset | undefined,
): (Partial<ContactWidgetOptions> & { siteKey: string }) | undefined {
  if (globalConfig?.siteKey) return { ...globalConfig, siteKey: globalConfig.siteKey };
  if (dataset?.siteKey) {
    return {
      siteKey: dataset.siteKey,
      ...(dataset.endpoint ? { endpoint: dataset.endpoint } : {}),
      ...(dataset.locale ? { locale: dataset.locale } : {}),
      ...(dataset.lang ? { lang: dataset.lang } : {}),
      ...(dataset.pageUrl ? { pageUrl: dataset.pageUrl } : {}),
    };
  }
  return undefined;
}

/** Resolve {@link ContactWidgetOptions} into a {@link ResolvedConfig}. */
export function resolveConfig(options: ContactWidgetOptions): ResolvedConfig {
  const endpoint =
    typeof options.endpoint === 'string' && options.endpoint.trim() !== ''
      ? options.endpoint.trim()
      : DEFAULT_ENDPOINT;
  return {
    siteKey: options.siteKey,
    endpoint,
    locale: normalizeLocale(options.locale ?? options.lang),
    ...(options.pageUrl ? { pageUrl: options.pageUrl } : {}),
  };
}
