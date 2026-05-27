import type { LocalizedPublication } from '@takuhon/core';

import styles from './Publications.module.css';

export interface PublicationsProps {
  publications: LocalizedPublication[];
}

function sortPublications(entries: LocalizedPublication[]): LocalizedPublication[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.date.localeCompare(a.date);
  });
}

// Strip an optional doi.org URL prefix so the rendered href is always
// `https://doi.org/<bare-identifier>`. Defensive against fixtures that
// inadvertently store a full URL instead of the bare DOI per spec §6.15.
function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
}

export function Publications({ publications }: PublicationsProps): React.JSX.Element | null {
  if (publications.length === 0) return null;
  const ordered = sortPublications(publications);

  return (
    <section className={styles.section} aria-labelledby="takuhon-publications-heading">
      <h2 id="takuhon-publications-heading" className={styles.heading}>
        Publications
      </h2>
      <ul className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <p className={styles.title}>
              {entry.url ? (
                <a
                  className={styles.link}
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.title}
                </a>
              ) : (
                entry.title
              )}
            </p>
            {entry.publisher ? <p className={styles.publisher}>{entry.publisher}</p> : null}
            <p className={styles.date}>
              <time dateTime={entry.date}>{entry.date}</time>
            </p>
            {entry.coAuthors && entry.coAuthors.length > 0 ? (
              <p className={styles.coAuthors}>{`with ${entry.coAuthors.join(', ')}`}</p>
            ) : null}
            {entry.doi ? (
              (() => {
                const bare = normalizeDoi(entry.doi);
                return (
                  <p className={styles.doi}>
                    <a
                      className={styles.link}
                      href={`https://doi.org/${bare}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`doi:${bare}`}
                    </a>
                  </p>
                );
              })()
            ) : null}
            {entry.description ? (
              <p className={styles.description}>{entry.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
