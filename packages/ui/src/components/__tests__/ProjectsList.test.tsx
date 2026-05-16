import { resolveLocale } from '@ownport/core';
import type { Ownport } from '@ownport/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import { ProjectsList } from '../ProjectsList.js';

const example = resolveLocale(exampleJson as unknown as Ownport, 'en');

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

  it('exposes machine-readable dateTime on project <time> elements', () => {
    render(<ProjectsList projects={example.projects} />);
    const times = screen.queryAllByText(/^\d{4}-\d{2}$/);
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t.tagName.toLowerCase()).toBe('time');
      expect(t).toHaveAttribute('datetime', t.textContent ?? '');
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
