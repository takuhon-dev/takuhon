import type { LocalizedHonor } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HonorsList } from '../HonorsList.js';

const sample: LocalizedHonor[] = [
  {
    id: 'best-paper',
    title: 'Best Paper Award',
    issuer: 'ACM SIGCHI',
    date: '2023-04',
  },
];

describe('HonorsList', () => {
  it('renders a labelled Honors section with one entry per honor', () => {
    render(<HonorsList honors={sample} />);
    const section = screen.getByRole('region', { name: /honors/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('exposes machine-readable dateTime on the date <time> element', () => {
    render(<HonorsList honors={sample} />);
    const time = screen.getByText('2023-04');
    expect(time.tagName.toLowerCase()).toBe('time');
    expect(time).toHaveAttribute('datetime', '2023-04');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<HonorsList honors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
