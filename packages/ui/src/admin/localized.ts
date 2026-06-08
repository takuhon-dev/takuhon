import type { LocaleTag } from '@takuhon/core';

/**
 * First non-empty localized value, preferring the order of `locales` and
 * falling back to any present value. Used for repeater item captions where a
 * single human-readable string is needed regardless of the active locale.
 */
export function firstLocalized(
  record: Record<LocaleTag, string> | undefined,
  locales: readonly LocaleTag[],
): string {
  if (!record) return '';
  for (const locale of locales) {
    const value = record[locale];
    if (value) return value;
  }
  return Object.values(record).find((value) => value !== '') ?? '';
}
