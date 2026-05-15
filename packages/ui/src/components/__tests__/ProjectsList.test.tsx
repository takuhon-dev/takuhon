import { resolveLocale } from '@meport/core';
import type { Meport } from '@meport/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/meport.json' with { type: 'json' };
import { ProjectsList } from '../ProjectsList.js';

const example = resolveLocale(exampleJson as unknown as Meport, 'en');

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

  it('returns nothing when given an empty list', () => {
    const { container } = render(<ProjectsList projects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
