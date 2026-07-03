import type { LocaleTag, LocalizedSkill } from '@takuhon/core';

import { getUILabel } from '../lib/ui-labels.js';

import styles from './SkillsList.module.css';

export interface SkillsListProps {
  skills: LocalizedSkill[];
  locale?: LocaleTag;
}

interface SkillGroup {
  category: string;
  skills: LocalizedSkill[];
}

/** Internal grouping key for skills with no `category`; localized for display. */
const UNCATEGORIZED = 'other';

function groupSkills(skills: LocalizedSkill[]): SkillGroup[] {
  const sorted = [...skills].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder;
  });
  const groups = new Map<string, LocalizedSkill[]>();
  for (const skill of sorted) {
    const key = skill.category ?? UNCATEGORIZED;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(skill);
    } else {
      groups.set(key, [skill]);
    }
  }
  return [...groups.entries()].map(([category, items]) => ({ category, skills: items }));
}

export function SkillsList({ skills, locale = 'en' }: SkillsListProps): React.JSX.Element | null {
  if (skills.length === 0) return null;
  const groups = groupSkills(skills);

  return (
    <section className={styles.section} aria-labelledby="takuhon-skills-heading">
      <h2 id="takuhon-skills-heading" className={styles.heading}>
        {getUILabel('section.skills', locale)}
      </h2>
      <div className={styles.groups}>
        {groups.map((group) => {
          // User-provided category names are profile data and stay as-is; only
          // the internal uncategorized fallback is a UI string to localize.
          const categoryLabel =
            group.category === UNCATEGORIZED
              ? getUILabel('skills.uncategorized', locale)
              : group.category;
          return (
            <div key={group.category} className={styles.group}>
              <h3 className={styles.category}>{categoryLabel}</h3>
              <ul
                className={styles.list}
                aria-label={`${categoryLabel} ${getUILabel('a11y.skillsSuffix', locale)}`}
              >
                {group.skills.map((skill) => (
                  <li key={skill.id} className={styles.item}>
                    {skill.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
