import { resolveLocale } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { CareerTimeline } from '../CareerTimeline.js';

const example = resolveLocale(exampleJson as unknown as Takuhon, 'en');

describe('CareerTimeline', () => {
  it('renders a labelled Career section with one entry per career', () => {
    render(<CareerTimeline careers={example.careers} />);
    const section = screen.getByRole('region', { name: /career/i });
    expect(section).toBeInTheDocument();
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(example.careers.length);
  });

  it('marks current positions with "Present" instead of a date', () => {
    render(<CareerTimeline careers={example.careers} />);
    const section = screen.getByRole('region', { name: /career/i });
    expect(section.textContent).toMatch(/2023-04\s+–\s+Present/);
  });

  it('localizes the ongoing-period marker via the locale prop', () => {
    render(<CareerTimeline careers={example.careers} locale="ja" />);
    const section = screen.getByRole('region', { name: /career/i });
    expect(section.textContent).toMatch(/現在/);
    expect(section.textContent).not.toMatch(/Present/);
  });

  it('exposes machine-readable dateTime on the startDate <time> element', () => {
    render(<CareerTimeline careers={example.careers} />);
    const section = screen.getByRole('region', { name: /career/i });
    const times = within(section).getAllByText(/^\d{4}-\d{2}$/);
    const first = times[0];
    expect(first?.tagName.toLowerCase()).toBe('time');
    expect(first).toHaveAttribute('datetime', first?.textContent ?? '');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<CareerTimeline careers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
