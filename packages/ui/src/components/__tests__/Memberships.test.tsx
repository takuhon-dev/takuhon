import type { LocalizedMembership } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Memberships } from '../Memberships.js';

const sample: LocalizedMembership[] = [
  {
    id: 'iaap',
    organization: 'IAAP',
    role: 'Senior Member',
    startDate: '2022-09',
    endDate: null,
    isCurrent: true,
    url: 'https://www.accessibilityassociation.org',
  },
  {
    id: 'past',
    organization: 'Previous Society',
    startDate: '2018-04',
    endDate: '2021-12',
  },
];

const currentMembership = sample[0]!;
const pastMembership = sample[1]!;

describe('Memberships', () => {
  it('renders a labelled Memberships section with one entry per membership', () => {
    render(<Memberships memberships={sample} />);
    const section = screen.getByRole('region', { name: /memberships/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders "Present" when isCurrent is true', () => {
    render(<Memberships memberships={[currentMembership]} />);
    expect(screen.getByText(/Present/)).toBeInTheDocument();
  });

  it('renders both start and end as <time dateTime> for closed memberships', () => {
    const { container } = render(<Memberships memberships={[pastMembership]} />);
    const times = container.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0]?.getAttribute('datetime')).toBe('2018-04');
    expect(times[1]?.getAttribute('datetime')).toBe('2021-12');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Memberships memberships={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then startDate DESC', () => {
    const unordered: LocalizedMembership[] = [
      { id: 'a', organization: 'A', startDate: '2018-01', order: 2 },
      { id: 'b', organization: 'B', startDate: '2022-01', order: 1 },
      { id: 'c', organization: 'C', startDate: '2020-01', order: 1 },
    ];
    render(<Memberships memberships={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('B');
    expect(items[1]).toHaveTextContent('C');
    expect(items[2]).toHaveTextContent('A');
  });
});
