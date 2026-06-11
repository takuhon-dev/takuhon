import type { CvDocument, CvSection, LocaleTag, LocalizedLanguage } from '@takuhon/core';

import { formatYearMonth } from '../lib/date-formatter.js';
import { getUILabel, type UILabelKey } from '../lib/ui-labels.js';

import styles from './CvView.module.css';

export interface CvViewProps {
  /** The CV projection from `@takuhon/core`'s `deriveCv` (already privacy-filtered upstream). */
  cv: CvDocument;
  /** Locale for headings and dates; defaults to the CV's resolved locale. */
  locale?: LocaleTag;
}

/** Map each CV section kind to its `section.*` UI-label key. */
const SECTION_LABEL: Record<CvSection['kind'], UILabelKey> = {
  experience: 'section.career',
  education: 'section.education',
  skills: 'section.skills',
  certifications: 'section.certifications',
  publications: 'section.publications',
  honors: 'section.honors',
  courses: 'section.courses',
  patents: 'section.patents',
  languages: 'section.languages',
  volunteering: 'section.volunteering',
  memberships: 'section.memberships',
};

/** A normalized entry row: a heading (optionally linked), dates, a sub line, and a body. */
interface EntryView {
  key: string;
  heading: string;
  url?: string;
  dates?: string;
  sub?: string;
  body?: string;
}

function joinNonEmpty(values: (string | undefined)[], separator: string): string | undefined {
  const joined = values
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(separator);
  return joined.length > 0 ? joined : undefined;
}

function EntryList({ entries }: { entries: EntryView[] }): React.JSX.Element {
  return (
    <ul className={styles.list}>
      {entries.map((e) => (
        <li key={e.key} className={styles.entry}>
          <div className={styles.row}>
            <h3 className={styles.entryHeading}>
              {e.url !== undefined ? <a href={e.url}>{e.heading}</a> : e.heading}
            </h3>
            {e.dates !== undefined ? <span className={styles.dates}>{e.dates}</span> : null}
          </div>
          {e.sub !== undefined ? <p className={styles.sub}>{e.sub}</p> : null}
          {e.body !== undefined ? <p className={styles.body}>{e.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ChipList({ labels }: { labels: string[] }): React.JSX.Element {
  return (
    <ul className={styles.chips}>
      {labels.map((label, i) => (
        <li key={`${label}-${String(i)}`} className={styles.chip}>
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Build the dated date-range string for an entry, or undefined when blank. */
function range(
  locale: LocaleTag,
  start?: string,
  end?: string | null,
  isCurrent?: boolean,
): string | undefined {
  const left = start ? formatYearMonth(start, locale) : '';
  const ongoing = isCurrent === true || end === null;
  const right = ongoing
    ? getUILabel('timeline.present', locale)
    : end
      ? formatYearMonth(end, locale)
      : '';
  const text = left && right ? `${left} – ${right}` : left || right;
  return text || undefined;
}

function languageLabel(l: LocalizedLanguage, locale: LocaleTag): string {
  const name = l.displayName ?? l.language;
  return `${name} — ${getUILabel(`proficiency.${l.proficiency}`, locale)}`;
}

/** Render one CV section's body (entry list or chip list), dispatching on kind. */
function SectionBody({
  section,
  locale,
}: {
  section: CvSection;
  locale: LocaleTag;
}): React.JSX.Element {
  switch (section.kind) {
    case 'experience':
      return (
        <EntryList
          entries={section.entries.map((c) => ({
            key: c.id,
            heading: c.role,
            sub: c.organization,
            dates: range(locale, c.startDate, c.endDate, c.isCurrent),
            body: c.description,
            url: c.url,
          }))}
        />
      );
    case 'education':
      return (
        <EntryList
          entries={section.entries.map((e) => {
            const degree = joinNonEmpty([e.degree, e.fieldOfStudy], ', ');
            return {
              key: e.id,
              heading: degree ?? e.institution,
              sub: degree ? e.institution : undefined,
              dates: range(locale, e.startDate, e.endDate, e.isCurrent),
              body: e.description,
              url: e.url,
            };
          })}
        />
      );
    case 'skills':
      return <ChipList labels={section.entries.map((s) => s.label)} />;
    case 'languages':
      return <ChipList labels={section.entries.map((l) => languageLabel(l, locale))} />;
    case 'certifications':
      return (
        <EntryList
          entries={section.entries.map((c) => ({
            key: c.id,
            heading: c.title,
            sub: c.issuingOrganization,
            dates: range(locale, c.issueDate, c.expirationDate),
            url: c.url,
          }))}
        />
      );
    case 'publications':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.title,
            sub: joinNonEmpty([x.publisher, x.coAuthors?.join(', ')], ' · '),
            dates: range(locale, x.date),
            body: x.description,
            url: x.url ?? (x.doi ? `https://doi.org/${x.doi}` : undefined),
          }))}
        />
      );
    case 'honors':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.title,
            sub: x.issuer,
            dates: range(locale, x.date),
            body: x.description,
            url: x.url,
          }))}
        />
      );
    case 'courses':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.title,
            sub: x.provider,
            dates: range(locale, x.completionDate),
            body: x.description,
            url: x.certificateUrl,
          }))}
        />
      );
    case 'patents':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.title,
            sub: joinNonEmpty([x.patentNumber, x.office, x.status], ' · '),
            dates: range(locale, x.filingDate ?? x.grantDate),
            body: x.description,
            url: x.url,
          }))}
        />
      );
    case 'volunteering':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.role,
            sub: joinNonEmpty([x.organization, x.cause], ' · '),
            dates: range(locale, x.startDate, x.endDate, x.isCurrent),
            body: x.description,
            url: x.url,
          }))}
        />
      );
    case 'memberships':
      return (
        <EntryList
          entries={section.entries.map((x) => ({
            key: x.id,
            heading: x.role ?? x.organization,
            sub: x.role ? x.organization : undefined,
            dates: range(locale, x.startDate, x.endDate, x.isCurrent),
            body: x.description,
            url: x.url,
          }))}
        />
      );
  }
}

/**
 * Print-ready résumé/CV view, the React counterpart of the CLI's `renderCvHtml`.
 * Renders a {@link CvDocument} (from `@takuhon/core`'s `deriveCv`) as an A4
 * single-column document; the co-located CSS module carries an `@media print`
 * block so the browser's "Save as PDF" yields a clean résumé. This is a
 * presentational component (it shows what `deriveCv` gives it, which the host
 * has already privacy-filtered) and renders nothing for an empty CV.
 */
export function CvView({ cv, locale }: CvViewProps): React.JSX.Element | null {
  const loc = locale ?? cv.resolvedLocale;
  const h = cv.header;
  if (cv.sections.length === 0 && h.displayName === '') return null;

  const contact: React.JSX.Element[] = [];
  if (h.location !== undefined) contact.push(<span key="loc">{h.location}</span>);
  if (h.email !== undefined) {
    contact.push(
      <a key="email" href={`mailto:${h.email}`}>
        {h.email}
      </a>,
    );
  }
  if (h.formUrl !== undefined) {
    contact.push(
      <a key="form" href={h.formUrl}>
        {getUILabel('contact.formLink', loc)}
      </a>,
    );
  }

  return (
    <article className={styles.cv} lang={loc}>
      <header className={styles.header}>
        <h1 className={styles.name}>{h.displayName}</h1>
        {h.tagline !== undefined ? <p className={styles.tagline}>{h.tagline}</p> : null}
        {contact.length > 0 ? <div className={styles.contact}>{contact}</div> : null}
        {h.bio !== undefined ? <p className={styles.bio}>{h.bio}</p> : null}
      </header>
      {cv.sections.map((section) => (
        <section key={section.kind} className={styles.section}>
          <h2 className={styles.heading}>{getUILabel(SECTION_LABEL[section.kind], loc)}</h2>
          <SectionBody section={section} locale={loc} />
        </section>
      ))}
    </article>
  );
}
