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
