import { resolveLocale } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { formatYearMonth } from '../../lib/date-formatter.js';
import { ProjectsList } from '../ProjectsList.js';

const example = resolveLocale(exampleJson as unknown as Takuhon, 'en');

describe('ProjectsList', () => {
  it('renders a labelled Projects section with one entry per project', () => {
    render(<ProjectsList projects={example.projects} />);
    const section = screen.getByRole('region', { name: /projects/i });
    const items = within(section).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(example.projects.length);
  });

  it('places highlighted projects before non-highlighted ones', () => {
    render(<ProjectsList projects={example.projects} />);
    const links = screen.getAllByRole('link');
    expect(links[0]?.textContent).toMatch(/axe-helpers/);
  });

  it('renders project tags as a labelled list when present', () => {
    render(<ProjectsList projects={example.projects} />);
    const tagLists = screen.getAllByRole('list', { name: /tags/i });
    expect(tagLists.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps a machine-readable YYYY-MM dateTime while displaying a localized label', () => {
    const { container } = render(<ProjectsList projects={example.projects} />);
    const times = container.querySelectorAll('time');
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      const raw = t.getAttribute('datetime') ?? '';
      expect(raw).toMatch(/^\d{4}-\d{2}$/);
      expect(t.textContent).toBe(formatYearMonth(raw, 'en'));
    }
  });

  it('omits <time> when a project has no startDate', () => {
    render(
      <ProjectsList
        projects={[{ id: 'no-date', title: 'Untimed', description: 'Project without dates.' }]}
      />,
    );
    const section = screen.getByRole('region', { name: /projects/i });
    expect(within(section).queryByText(/\d{4}-\d{2}/)).toBeNull();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<ProjectsList projects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
