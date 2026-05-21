/**
 * BCP-47 locale-tag helpers shared by `normalize()` and `resolveLocale()`.
 *
 * These functions intentionally do not depend on `Intl.Locale`: the schema's
 * `propertyNames` pattern already guarantees structural validity for tags that
 * have passed validation, so this module only needs string-level operations
 * (case-insensitive lookup, primary-subtag fallback, simple regex shape check).
 * Keeping the implementation dependency-free also avoids platform differences
 * between Node, Workers, and modern browsers.
 */

/** Same shape as `takuhon.schema.json`'s `propertyNames` for localized maps. */
const BCP47_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

/**
 * Return whether a string has the structural shape of a BCP-47 tag accepted
 * by `takuhon.schema.json`. This is a syntactic check only — `'zz'` passes
 * because it matches the regex even though it is not a registered subtag.
 * Semantic validity (registered language / region) is intentionally out of
 * scope; consumers that want it should compose `Intl.Locale` on top.
 */
export function isValidBcp47(tag: string): boolean {
  return BCP47_PATTERN.test(tag);
}

/**
 * Expand a tag into a list of progressively shorter candidates by dropping
 * trailing subtags, e.g. `'zh-Hant-TW' → ['zh-Hant-TW', 'zh-Hant', 'zh']`.
 * Returns the input unchanged for single-subtag inputs (`'en' → ['en']`),
 * and returns `[]` for tags that do not match the BCP-47 shape.
 */
export function expandRegional(tag: string): string[] {
  if (!isValidBcp47(tag)) return [];
  const parts = tag.split('-');
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push(parts.slice(0, i).join('-'));
  }
  return out;
}

/** Compare two locale tags ignoring ASCII case (`'EN-us'` matches `'en-US'`). */
export function localeMatches(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Look up a value from a locale-keyed map ignoring ASCII case.
 *
 * BCP-47 tags use canonical casing (`zh-Hant`, `pt-BR`) but the spec asks for
 * case-insensitive comparison so consumers can query with `EN-us` or `EN-US`
 * regardless of how the document was authored.
 */
export function lookupCaseInsensitive<T>(
  map: Record<string, T> | undefined,
  key: string,
): T | undefined {
  if (!map) return undefined;
  const direct = map[key];
  if (direct !== undefined) return direct;
  const lower = key.toLowerCase();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === lower) return map[k];
  }
  return undefined;
}
