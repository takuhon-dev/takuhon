import type { LocalizedProject } from '@meport/core';

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

function formatRange(project: LocalizedProject): string | null {
  if (!project.startDate) return null;
  const end = project.endDate ?? 'Present';
  return `${project.startDate} – ${end}`;
}

export function ProjectsList({ projects }: ProjectsListProps): React.JSX.Element | null {
  if (projects.length === 0) return null;
  const ordered = sortProjects(projects);

  return (
    <section className={styles.section} aria-labelledby="meport-projects-heading">
      <h2 id="meport-projects-heading" className={styles.heading}>
        Projects
      </h2>
      <ul className={styles.list}>
        {ordered.map((project) => {
          const range = formatRange(project);
          return (
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
              {range ? (
                <p className={styles.range}>
                  <time>{range}</time>
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
          );
        })}
      </ul>
    </section>
  );
}
