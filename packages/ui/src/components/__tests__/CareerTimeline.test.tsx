import { resolveLocale } from '@meport/core';
import type { Meport } from '@meport/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/meport.json' with { type: 'json' };
import { CareerTimeline } from '../CareerTimeline.js';

const example = resolveLocale(exampleJson as unknown as Meport, 'en');

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
    expect(screen.getByText(/2023-04 – Present/)).toBeInTheDocument();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<CareerTimeline careers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
