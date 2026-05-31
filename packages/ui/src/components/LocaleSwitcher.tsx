import type { LocaleTag } from '@takuhon/core';

import { getUILabel } from '../lib/ui-labels.js';

import styles from './LocaleSwitcher.module.css';

export interface LocaleSwitcherProps {
  availableLocales: LocaleTag[];
  currentLocale: LocaleTag;
  onSelect: (locale: LocaleTag) => void;
  ariaLabel?: string;
  formatLocale?: (locale: LocaleTag) => string;
}

export function LocaleSwitcher({
  availableLocales,
  currentLocale,
  onSelect,
  ariaLabel,
  formatLocale,
}: LocaleSwitcherProps): React.JSX.Element {
  const label = ariaLabel ?? getUILabel('a11y.selectLanguage', currentLocale);
  const format = formatLocale ?? ((locale: LocaleTag) => locale);
  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        aria-label={label}
        value={currentLocale}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        {availableLocales.map((locale) => (
          <option key={locale} value={locale}>
            {format(locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
