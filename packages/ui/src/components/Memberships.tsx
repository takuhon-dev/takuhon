import type { LocalizedMembership } from '@takuhon/core';

import styles from './Memberships.module.css';

export interface MembershipsProps {
  memberships: LocalizedMembership[];
}

function sortMemberships(entries: LocalizedMembership[]): LocalizedMembership[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.startDate.localeCompare(a.startDate);
  });
}

function isOngoing(entry: LocalizedMembership): boolean {
  return entry.isCurrent === true || entry.endDate === null || entry.endDate === undefined;
}

export function Memberships({ memberships }: MembershipsProps): React.JSX.Element | null {
  if (memberships.length === 0) return null;
  const ordered = sortMemberships(memberships);

  return (
    <section className={styles.section} aria-labelledby="takuhon-memberships-heading">
      <h2 id="takuhon-memberships-heading" className={styles.heading}>
        Memberships
      </h2>
      <ol className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <div className={styles.timelineMarker} aria-hidden="true" />
            <div className={styles.content}>
              <p className={styles.organization}>
                {entry.url ? (
                  <a
                    className={styles.link}
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {entry.organization}
                  </a>
                ) : (
                  entry.organization
                )}
              </p>
              {entry.role ? <p className={styles.role}>{entry.role}</p> : null}
              <p className={styles.range}>
                <time dateTime={entry.startDate}>{entry.startDate}</time>
                {' – '}
                {isOngoing(entry) ? (
                  'Present'
                ) : (
                  <time dateTime={entry.endDate!}>{entry.endDate}</time>
                )}
              </p>
              {entry.description ? (
                <p className={styles.description}>{entry.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
