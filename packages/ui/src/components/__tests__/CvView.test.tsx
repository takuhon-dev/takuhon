import { deriveCv, normalize, resolveLocale, validate, type LocalizedTakuhon } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CvView } from '../CvView.js';

function localized(overrides: Record<string, unknown> = {}, locale = 'en'): LocalizedTakuhon {
  const doc = {
    schemaVersion: '0.5.0',
    profile: {
      displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' },
      tagline: { en: 'Maintainer' },
      location: { display: { en: 'Lisbon' } },
    },
    links: [{ id: 'site', type: 'website', url: 'https://example.com', featured: true }],
    careers: [
      {
        id: 'job',
        organization: { en: 'Acme' },
        role: { en: 'Engineer' },
        startDate: '2020-01',
        isCurrent: true,
        description: { en: 'Built things.' },
      },
    ],
    projects: [],
    skills: [{ id: 's1', label: 'TypeScript' }],
    education: [
      { id: 'e1', institution: { en: 'Uni' }, degree: { en: 'BSc' }, startDate: '2016-09' },
    ],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
  const result = validate(doc);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return resolveLocale(normalize(result.data), locale);
}

function renderCv(overrides: Record<string, unknown> = {}, locale = 'en') {
  const loc = localized(overrides, locale);
  return render(<CvView cv={deriveCv(loc)} locale={loc.resolvedLocale} />);
}

describe('CvView', () => {
  it('renders the name as the top-level heading and the tagline', () => {
    renderCv();
    expect(screen.getByRole('heading', { level: 1, name: 'Pat Rivera' })).toBeInTheDocument();
    expect(screen.getByText('Maintainer')).toBeInTheDocument();
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
  });

  it('renders each CV section as a heading with its entries', () => {
    renderCv();
    expect(screen.getByRole('heading', { level: 2, name: /career/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Engineer' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /education/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /skills/i })).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('shows an ongoing role as "Present"', () => {
    renderCv();
    // Within the experience entry, the date range ends with the present marker.
    const heading = screen.getByRole('heading', { level: 3, name: 'Engineer' });
    const entry = heading.closest('li');
    expect(entry).not.toBeNull();
    expect(within(entry as HTMLElement).getByText(/present/i)).toBeInTheDocument();
  });

  it('does not render web-only content (links) in the CV', () => {
    renderCv();
    expect(screen.queryByRole('link', { name: /example\.com/i })).not.toBeInTheDocument();
  });

  it('renders an email link only when the contact exposes one', () => {
    const { rerender } = renderCv();
    expect(screen.queryByRole('link', { name: 'pat@example.com' })).not.toBeInTheDocument();

    const loc = localized({ contact: { email: 'pat@example.com', showEmail: true } });
    rerender(<CvView cv={deriveCv(loc)} locale={loc.resolvedLocale} />);
    expect(screen.getByRole('link', { name: 'pat@example.com' })).toHaveAttribute(
      'href',
      'mailto:pat@example.com',
    );
  });

  it('localizes headings and content (ja)', () => {
    renderCv({}, 'ja');
    expect(screen.getByRole('heading', { level: 1, name: 'パット・リベラ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '職歴' })).toBeInTheDocument();
  });
});
