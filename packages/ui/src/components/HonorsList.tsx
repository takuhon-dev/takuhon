import type { LocalizedHonor, LocaleTag } from '@takuhon/core';

import { formatYearMonth } from '../lib/date-formatter.js';

import styles from './HonorsList.module.css';

export interface HonorsListProps {
  honors: LocalizedHonor[];
  locale?: LocaleTag;
}

function sortHonors(honors: LocalizedHonor[]): LocalizedHonor[] {
  return [...honors].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.date.localeCompare(a.date);
  });
}

export function HonorsList({ honors, locale = 'en' }: HonorsListProps): React.JSX.Element | null {
  if (honors.length === 0) return null;
  const ordered = sortHonors(honors);

  return (
    <section className={styles.section} aria-labelledby="takuhon-honors-heading">
      <h2 id="takuhon-honors-heading" className={styles.heading}>
        Honors &amp; Awards
      </h2>
      <ul className={styles.list}>
        {ordered.map((honor) => (
          <li key={honor.id} className={styles.item}>
            <p className={styles.title}>
              {honor.url ? (
                <a
                  className={styles.link}
                  href={honor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {honor.title}
                </a>
              ) : (
                honor.title
              )}
            </p>
            <p className={styles.meta}>
              {honor.issuer}
              {' · '}
              <time dateTime={honor.date}>{formatYearMonth(honor.date, locale)}</time>
            </p>
            {honor.description ? <p className={styles.description}>{honor.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
