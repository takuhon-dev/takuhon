import type { LocaleTag, LocalizedPatent } from '@takuhon/core';

import { getUILabel } from '../lib/ui-labels.js';

import styles from './Patents.module.css';

export interface PatentsProps {
  patents: LocalizedPatent[];
  locale?: LocaleTag;
}

function sortPatents(entries: LocalizedPatent[]): LocalizedPatent[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aDate = a.grantDate ?? a.filingDate ?? '';
    const bDate = b.grantDate ?? b.filingDate ?? '';
    return bDate.localeCompare(aDate);
  });
}

export function Patents({ patents, locale = 'en' }: PatentsProps): React.JSX.Element | null {
  if (patents.length === 0) return null;
  const ordered = sortPatents(patents);

  return (
    <section className={styles.section} aria-labelledby="takuhon-patents-heading">
      <h2 id="takuhon-patents-heading" className={styles.heading}>
        Patents
      </h2>
      <ul className={styles.list}>
        {ordered.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <p className={styles.title}>
              {entry.url ? (
                <a
                  className={styles.link}
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.title}
                </a>
              ) : (
                entry.title
              )}
              <span className={styles.statusBadge} data-status={entry.status}>
                <span className={styles.srOnly}>Status: </span>
                {getUILabel(`patentStatus.${entry.status}`, locale)}
              </span>
            </p>
            <p className={styles.patentNumber}>{entry.patentNumber}</p>
            {entry.office ? <p className={styles.office}>{entry.office}</p> : null}
            {entry.filingDate !== undefined || entry.grantDate !== undefined ? (
              <p className={styles.dates}>
                {entry.filingDate ? (
                  <>
                    {`${getUILabel('patent.filed', locale)} `}
                    <time dateTime={entry.filingDate}>{entry.filingDate}</time>
                  </>
                ) : null}
                {entry.filingDate && entry.grantDate ? ' · ' : null}
                {entry.grantDate ? (
                  <>
                    {`${getUILabel('patent.granted', locale)} `}
                    <time dateTime={entry.grantDate}>{entry.grantDate}</time>
                  </>
                ) : null}
              </p>
            ) : null}
            {entry.coInventors && entry.coInventors.length > 0 ? (
              <p className={styles.coInventors}>
                {`${getUILabel('patent.coInventorsPrefix', locale)}${entry.coInventors.join(', ')}`}
              </p>
            ) : null}
            {entry.description ? <p className={styles.description}>{entry.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
