import type { LocalizedEducation } from '@takuhon/core';

import styles from './EducationTimeline.module.css';

export interface EducationTimelineProps {
  education: LocalizedEducation[];
}

function sortEducation(entries: LocalizedEducation[]): LocalizedEducation[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.startDate.localeCompare(a.startDate);
  });
}

function isOngoing(entry: LocalizedEducation): boolean {
  return entry.isCurrent === true || entry.endDate === null || entry.endDate === undefined;
}

function composeStudyLine(entry: LocalizedEducation): string | undefined {
  if (entry.degree !== undefined && entry.fieldOfStudy !== undefined) {
    return `${entry.degree} · ${entry.fieldOfStudy}`;
  }
  return entry.degree ?? entry.fieldOfStudy;
}

export function EducationTimeline({ education }: EducationTimelineProps): React.JSX.Element | null {
  if (education.length === 0) return null;
  const ordered = sortEducation(education);

  return (
    <section className={styles.section} aria-labelledby="takuhon-education-heading">
      <h2 id="takuhon-education-heading" className={styles.heading}>
        Education
      </h2>
      <ol className={styles.list}>
        {ordered.map((entry) => {
          const study = composeStudyLine(entry);
          return (
            <li key={entry.id} className={styles.item}>
              <div className={styles.timelineMarker} aria-hidden="true" />
              <div className={styles.content}>
                <p className={styles.institution}>
                  {entry.url ? (
                    <a
                      className={styles.link}
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {entry.institution}
                    </a>
                  ) : (
                    entry.institution
                  )}
                </p>
                {study ? <p className={styles.study}>{study}</p> : null}
                <p className={styles.range}>
                  <time dateTime={entry.startDate}>{entry.startDate}</time>
                  {' – '}
                  {isOngoing(entry) ? (
                    // TODO(i18n-phase-2): Localize the 'Present' label via the locale resolver.
                    'Present'
                  ) : (
                    <time dateTime={entry.endDate!}>{entry.endDate}</time>
                  )}
                </p>
                {entry.grade ? <p className={styles.grade}>{entry.grade}</p> : null}
                {entry.description ? (
                  <p className={styles.description}>{entry.description}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
