import type { LocaleTag, LocalizedLink } from '@takuhon/core';

import { getUILabel } from '../lib/ui-labels.js';

import styles from './LinksList.module.css';

export interface LinksListProps {
  links: LocalizedLink[];
  locale?: LocaleTag;
}

function sortLinks(links: LocalizedLink[]): LocalizedLink[] {
  return [...links].sort((a, b) => {
    const aFeatured = a.featured ? 1 : 0;
    const bFeatured = b.featured ? 1 : 0;
    if (aFeatured !== bFeatured) return bFeatured - aFeatured;
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder;
  });
}

function formatLinkLabel(link: LocalizedLink): string {
  if (link.label) return link.label;
  if (link.type === 'custom') return link.id;
  return link.type;
}

export function LinksList({ links, locale = 'en' }: LinksListProps): React.JSX.Element | null {
  if (links.length === 0) return null;

  const ordered = sortLinks(links);

  return (
    <nav aria-label={getUILabel('a11y.profileLinks', locale)} className={styles.nav}>
      <ul className={styles.list}>
        {ordered.map((link) => (
          <li key={link.id} className={styles.item}>
            <a
              className={styles.link}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              data-featured={link.featured ? 'true' : undefined}
            >
              {link.iconUrl ? <img className={styles.icon} src={link.iconUrl} alt="" /> : null}
              <span className={styles.label}>{formatLinkLabel(link)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
