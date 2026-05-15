import type { Skill } from '@meport/core';

import styles from './SkillsList.module.css';

export interface SkillsListProps {
  skills: Skill[];
}

interface SkillGroup {
  category: string;
  skills: Skill[];
}

function groupSkills(skills: Skill[]): SkillGroup[] {
  const sorted = [...skills].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder;
  });
  const groups = new Map<string, Skill[]>();
  for (const skill of sorted) {
    const key = skill.category ?? 'other';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(skill);
    } else {
      groups.set(key, [skill]);
    }
  }
  return [...groups.entries()].map(([category, items]) => ({ category, skills: items }));
}

export function SkillsList({ skills }: SkillsListProps): React.JSX.Element | null {
  if (skills.length === 0) return null;
  const groups = groupSkills(skills);

  return (
    <section className={styles.section} aria-labelledby="meport-skills-heading">
      <h2 id="meport-skills-heading" className={styles.heading}>
        Skills
      </h2>
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.category} className={styles.group}>
            <p className={styles.category}>{group.category}</p>
            <ul className={styles.list} aria-label={`${group.category} skills`}>
              {group.skills.map((skill) => (
                <li key={skill.id} className={styles.item}>
                  {skill.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
