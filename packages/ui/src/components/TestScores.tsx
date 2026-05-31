import type { LocalizedTestScore } from '@takuhon/core';

import styles from './TestScores.module.css';

export interface TestScoresProps {
  testScores: LocalizedTestScore[];
}

function sortTestScores(entries: LocalizedTestScore[]): LocalizedTestScore[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.date.localeCompare(a.date);
  });
}

export function TestScores({ testScores }: TestScoresProps): React.JSX.Element | null {
  if (testScores.length === 0) return null;
  const ordered = sortTestScores(testScores);

  return (
    <section className={styles.section} aria-labelledby="takuhon-test-scores-heading">
      <h2 id="takuhon-test-scores-heading" className={styles.heading}>
        Test Scores
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
            <p className={styles.meta}>
              <span className={styles.score}>{entry.score}</span>
              {' · '}
              <time dateTime={entry.date}>{entry.date}</time>
            </p>
            {entry.description ? <p className={styles.description}>{entry.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
