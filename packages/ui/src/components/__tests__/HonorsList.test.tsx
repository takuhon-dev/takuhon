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

  it('keeps a machine-readable YYYY-MM dateTime while displaying a localized label', () => {
    const { container } = render(<HonorsList honors={sample} />);
    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time?.getAttribute('datetime')).toBe('2023-04'); // raw ISO retained
    expect(time?.textContent).toBe('Apr 2023'); // localized display (default en)
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<HonorsList honors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
