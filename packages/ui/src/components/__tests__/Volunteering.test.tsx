import type { LocalizedVolunteering } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Volunteering } from '../Volunteering.js';

const sample: LocalizedVolunteering[] = [
  {
    id: 'code-org',
    organization: 'Code.org',
    role: 'Volunteer Instructor',
    cause: 'Education',
    startDate: '2021-09',
    endDate: '2024-06',
  },
];

describe('Volunteering', () => {
  it('renders a labelled Volunteering section with one entry per role', () => {
    render(<Volunteering volunteering={sample} />);
    const section = screen.getByRole('region', { name: /volunteering/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders the cause as inline text when present', () => {
    render(<Volunteering volunteering={sample} />);
    expect(screen.getByText(/Education/)).toBeInTheDocument();
  });

  it('prefixes the cause chip with a screen-reader-only "Cause:" label', () => {
    const { container } = render(<Volunteering volunteering={sample} />);
    const causeChip = container.querySelector('[class*="cause"]');
    expect(causeChip?.textContent).toMatch(/Cause:\s*Education/);
  });

  it('omits the cause element when cause is absent', () => {
    const noCause: LocalizedVolunteering[] = [
      {
        id: 'no-cause',
        organization: 'Org',
        role: 'Helper',
        startDate: '2020-01',
      },
    ];
    render(<Volunteering volunteering={noCause} />);
    expect(screen.queryByText(/Cause:/)).not.toBeInTheDocument();
  });

  it('renders "Present" when isCurrent is true', () => {
    const current: LocalizedVolunteering[] = [
      {
        id: 'now',
        organization: 'Org',
        role: 'Helper',
        startDate: '2020-01',
        isCurrent: true,
        endDate: null,
      },
    ];
    render(<Volunteering volunteering={current} />);
    expect(screen.getByText(/Present/)).toBeInTheDocument();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Volunteering volunteering={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then startDate DESC', () => {
    const unordered: LocalizedVolunteering[] = [
      { id: 'a', organization: 'A', role: 'Helper', startDate: '2018-01', order: 2 },
      { id: 'b', organization: 'B', role: 'Helper', startDate: '2022-01', order: 1 },
      { id: 'c', organization: 'C', role: 'Helper', startDate: '2020-01', order: 1 },
    ];
    render(<Volunteering volunteering={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('B');
    expect(items[1]).toHaveTextContent('C');
    expect(items[2]).toHaveTextContent('A');
  });
});
