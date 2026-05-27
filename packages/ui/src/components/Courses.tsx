import type { LocalizedCourse } from '@takuhon/core';

import styles from './Courses.module.css';

export interface CoursesProps {
  courses: LocalizedCourse[];
}

function sortCourses(entries: LocalizedCourse[]): LocalizedCourse[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.completionDate ?? '').localeCompare(a.completionDate ?? '');
  });
}

export function Courses({ courses }: CoursesProps): React.JSX.Element | null {
  if (courses.length === 0) return null;
  const ordered = sortCourses(courses);

  return (
    <section className={styles.section} aria-labelledby="takuhon-courses-heading">
      <h2 id="takuhon-courses-heading" className={styles.heading}>
        Courses
      </h2>
      <ul className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <p className={styles.title}>
              {entry.certificateUrl ? (
                <a
                  className={styles.link}
                  href={entry.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.title}
                </a>
              ) : (
                entry.title
              )}
            </p>
            {entry.provider ? <p className={styles.provider}>{entry.provider}</p> : null}
            {entry.courseNumber ? (
              <p className={styles.courseNumber}>{entry.courseNumber}</p>
            ) : null}
            {entry.completionDate ? (
              <p className={styles.date}>
                <time dateTime={entry.completionDate}>{entry.completionDate}</time>
              </p>
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
