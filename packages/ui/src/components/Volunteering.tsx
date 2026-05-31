import type { LocalizedVolunteering, LocaleTag } from '@takuhon/core';

import { formatYearMonth } from '../lib/date-formatter.js';
import { getUILabel } from '../lib/ui-labels.js';

import styles from './Volunteering.module.css';

export interface VolunteeringProps {
  volunteering: LocalizedVolunteering[];
  locale?: LocaleTag;
}

function sortVolunteering(entries: LocalizedVolunteering[]): LocalizedVolunteering[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.startDate.localeCompare(a.startDate);
  });
}

function isOngoing(entry: LocalizedVolunteering): boolean {
  return entry.isCurrent === true || entry.endDate === null || entry.endDate === undefined;
}

export function Volunteering({
  volunteering,
  locale = 'en',
}: VolunteeringProps): React.JSX.Element | null {
  if (volunteering.length === 0) return null;
  const ordered = sortVolunteering(volunteering);

  return (
    <section className={styles.section} aria-labelledby="takuhon-volunteering-heading">
      <h2 id="takuhon-volunteering-heading" className={styles.heading}>
        Volunteering
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
              <p className={styles.role}>
                {entry.role}
                {entry.cause ? (
                  <span className={styles.cause}>
                    <span className={styles.srOnly}>Cause: </span>
                    {entry.cause}
                  </span>
                ) : null}
              </p>
              <p className={styles.range}>
                <time dateTime={entry.startDate}>{formatYearMonth(entry.startDate, locale)}</time>
                {' – '}
                {isOngoing(entry) ? (
                  getUILabel('timeline.present', locale)
                ) : (
                  <time dateTime={entry.endDate!}>{formatYearMonth(entry.endDate!, locale)}</time>
                )}
              </p>
              {entry.description ? <p className={styles.description}>{entry.description}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
