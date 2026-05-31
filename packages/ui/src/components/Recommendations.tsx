import type { LocalizedRecommendation, LocaleTag } from '@takuhon/core';

import { formatYearMonth } from '../lib/date-formatter.js';

import styles from './Recommendations.module.css';

export interface RecommendationsProps {
  recommendations: LocalizedRecommendation[];
  locale?: LocaleTag;
}

function sortRecommendations(entries: LocalizedRecommendation[]): LocalizedRecommendation[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.date ?? '').localeCompare(a.date ?? '');
  });
}

export function Recommendations({
  recommendations,
  locale = 'en',
}: RecommendationsProps): React.JSX.Element | null {
  if (recommendations.length === 0) return null;
  const ordered = sortRecommendations(recommendations);

  return (
    <section className={styles.section} aria-labelledby="takuhon-recommendations-heading">
      <h2 id="takuhon-recommendations-heading" className={styles.heading}>
        Recommendations
      </h2>
      <ul className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <blockquote className={styles.body}>
              <p className={styles.quote}>{entry.body}</p>
            </blockquote>
            <p className={styles.attribution}>
              <span className={styles.author}>
                {entry.author.url ? (
                  <a
                    className={styles.link}
                    href={entry.author.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {entry.author.name}
                  </a>
                ) : (
                  entry.author.name
                )}
              </span>
              {entry.author.headline ? (
                <span className={styles.headline}>{entry.author.headline}</span>
              ) : null}
            </p>
            {entry.relationship ? <p className={styles.meta}>{entry.relationship}</p> : null}
            {entry.date ? (
              <p className={styles.meta}>
                <time dateTime={entry.date}>{formatYearMonth(entry.date, locale)}</time>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
