/**
 * Derive the public bundle the WordPress adapter serves from a canonical
 * takuhon.json, using only `@takuhon/core` and `@takuhon/api`.
 *
 * This is the heart of the adapter's "derive-at-edit-time" model: it runs in
 * the admin browser when the owner saves, so the public surface PHP serves is
 * produced by takuhon's single source of truth — never reimplemented in PHP.
 * The shape returned here is exactly what `Store::save()` (PHP) expects and
 * what the public REST/HTML surface reads.
 *
 * For each available locale it mirrors the live `@takuhon/api` public app:
 *   - `profiles[locale]` — `applyPublicPrivacyFilter(resolveLocale(...))`
 *     wrapped in the same `{ data, meta }` envelope as `GET /api/profile`.
 *   - `jsonld[locale]`   — `generateJsonLd` of that filtered, localized profile.
 *   - `pages[locale]`    — the server-rendered HTML from `generateSite`, the
 *     same generator the SSR `/` route and `takuhon build` use.
 * `canonical` is the locale-independent filtered profile served at
 * `/takuhon.json`.
 */

import { generateSite } from '@takuhon/api';
import {
  SCHEMA_VERSION,
  applyPublicPrivacyFilter,
  generateJsonLd,
  normalize,
  resolveLocale,
  schema,
  validate,
  type ValidationError,
} from '@takuhon/core';

/** A privacy-filtered, locale-resolved profile plus its response metadata. */
export interface ProfileEnvelope {
  readonly data: unknown;
  readonly meta: {
    readonly schemaVersion: string;
    readonly locale: string;
    readonly updatedAt?: string;
  };
}

/** The derived public bundle persisted and served by the PHP plugin. */
export interface PublicBundle {
  readonly profiles: Record<string, ProfileEnvelope>;
  readonly jsonld: Record<string, unknown>;
  readonly pages: Record<string, string>;
  readonly canonical: unknown;
  readonly schema: unknown;
  readonly meta: {
    readonly locales: string[];
    readonly default_locale: string;
    readonly schema_version: string;
    readonly generated_at: string;
  };
}

/** Result of {@link deriveBundle}: the master + bundle, or validation errors. */
export type DeriveResult =
  | { readonly ok: true; readonly master: unknown; readonly public: PublicBundle }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/**
 * Validate `raw` and, if valid, derive the canonical master and the public
 * bundle. `generatedAt` is the ISO timestamp to stamp into the bundle metadata
 * (passed in so callers control it and the derivation stays pure).
 */
export function deriveBundle(raw: unknown, generatedAt: string): DeriveResult {
  const result = validate(raw);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  const master = result.data;
  const normalized = normalize(master);
  const defaultLocale = normalized.settings.defaultLocale;
  // Default locale first, then the rest, de-duplicated — matching generateSite.
  const locales = [...new Set([defaultLocale, ...normalized.settings.availableLocales])];

  const profiles: Record<string, ProfileEnvelope> = {};
  const jsonld: Record<string, unknown> = {};
  for (const locale of locales) {
    const localized = applyPublicPrivacyFilter(resolveLocale(normalized, locale));
    profiles[locale] = {
      data: localized,
      meta: {
        schemaVersion: localized.schemaVersion,
        locale: localized.resolvedLocale,
        updatedAt: localized.meta.updatedAt,
      },
    };
    jsonld[locale] = generateJsonLd(localized);
  }

  const filtered = applyPublicPrivacyFilter(normalized);
  const pages: Record<string, string> = {};
  for (const page of generateSite(filtered)) {
    // generateSite emits the default locale at `/` and others at `/<locale>/`.
    const locale = '/' === page.route ? defaultLocale : page.route.replace(/\//g, '');
    pages[locale] = page.html;
  }

  return {
    ok: true,
    master,
    public: {
      profiles,
      jsonld,
      pages,
      canonical: filtered,
      schema,
      meta: {
        locales,
        default_locale: defaultLocale,
        schema_version: SCHEMA_VERSION,
        generated_at: generatedAt,
      },
    },
  };
}
