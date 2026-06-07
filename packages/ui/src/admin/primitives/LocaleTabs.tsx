import type { LocaleTag } from '@takuhon/core';
import { useId, useRef, useState } from 'react';

import { errorsAt, hasErrorsUnder, NO_FIELD_ERRORS, type FieldErrorIndex } from '../errors.js';

import styles from './LocaleTabs.module.css';

export interface LocaleTabsProps {
  /** Group label, e.g. `"Display name"`. */
  label: string;
  /** Current localized value (BCP-47 tag → string), or undefined when empty. */
  value: Record<LocaleTag, string> | undefined;
  /** Locales offered as tabs (typically `settings.availableLocales`). */
  locales: readonly LocaleTag[];
  /**
   * Receives the next localized record. Empty strings are pruned, and a record
   * that becomes empty is reported as `undefined` so the field is omitted
   * rather than emitted as `{}` (which fails the schema's `minProperties`).
   */
  onChange: (next: Record<LocaleTag, string> | undefined) => void;
  /** Render a `<textarea>` instead of an `<input>` for body-length text. */
  multiline?: boolean;
  required?: boolean;
  hint?: string;
  /** Full error index; per-locale errors are looked up at `${pointer}/${locale}`. */
  errors?: FieldErrorIndex;
  /** Base RFC 6901 pointer to this localized field, e.g. `/profile/displayName`. */
  pointer?: string;
  /** Render a friendlier tab label than the raw locale tag. */
  formatLocale?: (locale: LocaleTag) => string;
}

/**
 * Edits a localized string map (`LocalizedTitle` / `LocalizedBody`) behind one
 * tab per locale (spec §14.2 "多言語タブ"). Implements the WAI-ARIA Tabs
 * pattern — roving tabindex, arrow/Home/End navigation, a single shared
 * `tabpanel` — so it stays keyboard-operable and screen-reader-correct
 * (WCAG 2.1 AA, spec §8.5).
 */
export function LocaleTabs({
  label,
  value,
  locales,
  onChange,
  multiline = false,
  required,
  hint,
  errors = NO_FIELD_ERRORS,
  pointer,
  formatLocale,
}: LocaleTabsProps): React.JSX.Element {
  const baseId = useId();
  const hintId = useId();
  const errorId = useId();
  const [active, setActive] = useState<LocaleTag>(() => locales[0] ?? '');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const format = formatLocale ?? ((locale: LocaleTag) => locale);
  const labelId = `${baseId}-label`;

  if (locales.length === 0) {
    return (
      <div className={styles.group} role="group" aria-labelledby={labelId}>
        <span className={styles.groupLabel} id={labelId}>
          {label}
        </span>
        <p className={styles.hint}>No locales are configured yet; add one under Settings.</p>
      </div>
    );
  }

  // Reconcile the active tab against the current locale list so editing
  // `availableLocales` elsewhere never strands the selection on a stale tag.
  const activeLocale = locales.includes(active) ? active : locales[0]!;
  const text = value?.[activeLocale] ?? '';
  // Errors on the field itself (`required`, `minProperties`,
  // `propertyNames`) land on the base pointer, not on a locale key, so surface
  // both — otherwise a missing-value failure would be invisible.
  const baseErrors = pointer ? errorsAt(errors, pointer) : [];
  const localeErrors = pointer ? errorsAt(errors, `${pointer}/${activeLocale}`) : [];
  const shownErrors = [...baseErrors, ...localeErrors];
  const hasErrors = shownErrors.length > 0;
  const describedBy =
    [hint ? hintId : undefined, hasErrors ? errorId : undefined].filter(Boolean).join(' ') ||
    undefined;

  const setText = (next: string): void => {
    const record: Record<string, string> = { ...(value ?? {}) };
    if (next === '') delete record[activeLocale];
    else record[activeLocale] = next;
    onChange(Object.keys(record).length === 0 ? undefined : record);
  };

  const onTabKeyDown = (event: React.KeyboardEvent): void => {
    const current = locales.indexOf(activeLocale);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (current + 1) % locales.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (current - 1 + locales.length) % locales.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = locales.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextLocale = locales[nextIndex];
    if (nextLocale !== undefined) {
      setActive(nextLocale);
      tabRefs.current[nextLocale]?.focus();
    }
  };

  const controlName = `${label} (${format(activeLocale)})`;

  return (
    <div className={styles.group} role="group" aria-labelledby={labelId}>
      <span className={styles.groupLabel} id={labelId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      <div className={styles.tablist} role="tablist" aria-label={label}>
        {locales.map((locale) => {
          const selected = locale === activeLocale;
          const tabHasErrors = pointer ? hasErrorsUnder(errors, `${pointer}/${locale}`) : false;
          return (
            <button
              key={locale}
              ref={(element) => {
                tabRefs.current[locale] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${locale}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
              onClick={() => {
                setActive(locale);
              }}
              onKeyDown={onTabKeyDown}
            >
              {format(locale)}
              {tabHasErrors ? (
                <>
                  <span className={styles.tabError} aria-hidden="true">
                    {' '}
                    ●
                  </span>
                  <span className={styles.srOnly}> (has errors)</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${activeLocale}`}
        className={styles.panel}
      >
        {multiline ? (
          <textarea
            className={`${styles.control} ${styles.textarea}`}
            value={text}
            rows={4}
            aria-label={controlName}
            aria-invalid={hasErrors || undefined}
            aria-required={required ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        ) : (
          <input
            className={styles.control}
            type="text"
            value={text}
            aria-label={controlName}
            aria-invalid={hasErrors || undefined}
            aria-required={required ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        )}
        {hasErrors ? (
          <ul className={styles.errors} id={errorId}>
            {shownErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
