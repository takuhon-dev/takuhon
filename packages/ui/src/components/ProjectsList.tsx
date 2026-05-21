import type { LocalizedProject } from '@takuhon/core';

import styles from './ProjectsList.module.css';

export interface ProjectsListProps {
  projects: LocalizedProject[];
}

function sortProjects(projects: LocalizedProject[]): LocalizedProject[] {
  return [...projects].sort((a, b) => {
    const aHighlighted = a.highlighted ? 1 : 0;
    const bHighlighted = b.highlighted ? 1 : 0;
    if (aHighlighted !== bHighlighted) return bHighlighted - aHighlighted;
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder;
  });
}

export function ProjectsList({ projects }: ProjectsListProps): React.JSX.Element | null {
  if (projects.length === 0) return null;
  const ordered = sortProjects(projects);

  return (
    <section className={styles.section} aria-labelledby="ownport-projects-heading">
      <h2 id="ownport-projects-heading" className={styles.heading}>
        Projects
      </h2>
      <ul className={styles.list}>
        {ordered.map((project) => (
          <li
            key={project.id}
            className={styles.item}
            data-highlighted={project.highlighted ? 'true' : undefined}
          >
            <p className={styles.title}>
              {project.url ? (
                <a
                  className={styles.titleLink}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.title}
                </a>
              ) : (
                project.title
              )}
            </p>
            {project.startDate !== undefined ? (
              <p className={styles.range}>
                <time dateTime={project.startDate}>{project.startDate}</time>
                {' – '}
                {project.endDate ? (
                  <time dateTime={project.endDate}>{project.endDate}</time>
                ) : (
                  'Present'
                )}
              </p>
            ) : null}
            {project.description ? (
              <p className={styles.description}>{project.description}</p>
            ) : null}
            {project.tags && project.tags.length > 0 ? (
              <ul className={styles.tags} aria-label="Tags">
                {project.tags.map((tag) => (
                  <li key={tag} className={styles.tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
