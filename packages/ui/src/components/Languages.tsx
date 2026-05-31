import type { LocaleTag, LocalizedLanguage } from '@takuhon/core';

import { getUILabel } from '../lib/ui-labels.js';

import styles from './Languages.module.css';

export interface LanguagesProps {
  languages: LocalizedLanguage[];
  locale?: LocaleTag;
}

function sortLanguages(languages: LocalizedLanguage[]): LocalizedLanguage[] {
  return [...languages].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder;
  });
}

export function Languages({ languages, locale = 'en' }: LanguagesProps): React.JSX.Element | null {
  if (languages.length === 0) return null;
  const ordered = sortLanguages(languages);

  return (
    <section className={styles.section} aria-labelledby="takuhon-languages-heading">
      <h2 id="takuhon-languages-heading" className={styles.heading}>
        {getUILabel('section.languages', locale)}
      </h2>
      <ul className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <span className={styles.name} lang={entry.language}>
              {entry.displayName ?? entry.language}
            </span>
            <span className={styles.proficiency}>
              {getUILabel(`proficiency.${entry.proficiency}`, locale)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
