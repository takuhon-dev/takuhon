import { resolveLocale } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { formatYearMonth } from '../../lib/date-formatter.js';
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
    expect(section.textContent).toMatch(/Apr 2023\s+–\s+Present/);
  });

  it('localizes the ongoing-period marker via the locale prop', () => {
    render(<CareerTimeline careers={example.careers} locale="ja" />);
    const section = screen.getByRole('region', { name: /career/i });
    expect(section.textContent).toMatch(/現在/);
    expect(section.textContent).not.toMatch(/Present/);
  });

  it('keeps a machine-readable YYYY-MM dateTime while displaying a localized label', () => {
    const { container } = render(<CareerTimeline careers={example.careers} />);
    const times = container.querySelectorAll('time');
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) {
      const raw = time.getAttribute('datetime') ?? '';
      // dateTime keeps the raw ISO YearMonth; the visible text is exactly its
      // locale-formatted form, so a constant or shifted dateTime cannot pass.
      expect(raw).toMatch(/^\d{4}-\d{2}$/);
      expect(time.textContent).toBe(formatYearMonth(raw, 'en'));
    }
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<CareerTimeline careers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
