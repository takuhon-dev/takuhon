import type { LocalizedCareer, LocaleTag } from '@takuhon/core';

import { formatYearMonth } from '../lib/date-formatter.js';
import { getUILabel } from '../lib/ui-labels.js';

import styles from './CareerTimeline.module.css';

export interface CareerTimelineProps {
  careers: LocalizedCareer[];
  locale?: LocaleTag;
}

function sortCareers(careers: LocalizedCareer[]): LocalizedCareer[] {
  return [...careers].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.startDate.localeCompare(a.startDate);
  });
}

function isOngoing(career: LocalizedCareer): boolean {
  return career.isCurrent === true || career.endDate === null || career.endDate === undefined;
}

export function CareerTimeline({
  careers,
  locale = 'en',
}: CareerTimelineProps): React.JSX.Element | null {
  if (careers.length === 0) return null;
  const ordered = sortCareers(careers);

  return (
    <section className={styles.section} aria-labelledby="takuhon-career-heading">
      <h2 id="takuhon-career-heading" className={styles.heading}>
        Career
      </h2>
      <ol className={styles.list}>
        {ordered.map((career) => (
          <li key={career.id} className={styles.item}>
            <div className={styles.timelineMarker} aria-hidden="true" />
            <div className={styles.content}>
              <p className={styles.role}>
                {career.url ? (
                  <a
                    className={styles.organizationLink}
                    href={career.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {career.role} · {career.organization}
                  </a>
                ) : (
                  <>
                    {career.role} · {career.organization}
                  </>
                )}
              </p>
              <p className={styles.range}>
                <time dateTime={career.startDate}>{formatYearMonth(career.startDate, locale)}</time>
                {' – '}
                {isOngoing(career) ? (
                  getUILabel('timeline.present', locale)
                ) : (
                  <time dateTime={career.endDate!}>{formatYearMonth(career.endDate!, locale)}</time>
                )}
              </p>
              {career.location?.display ? (
                <p className={styles.location}>{career.location.display}</p>
              ) : null}
              {career.description ? (
                <p className={styles.description}>{career.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
