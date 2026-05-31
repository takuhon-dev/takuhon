import type { LocalizedRecommendation } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Recommendations } from '../Recommendations.js';

const sample: LocalizedRecommendation[] = [
  {
    id: 'rec-jordan',
    body: 'Pat is one of the most rigorous accessibility engineers I have worked with.',
    author: {
      name: 'Jordan Avery',
      headline: 'Engineering Manager at Stellar UX',
      url: 'https://example.org/in/jordan-avery',
    },
    relationship: 'Managed Pat directly',
    date: '2023-09',
    order: 0,
  },
  {
    id: 'rec-sofia',
    body: 'Their attention to non-visual user journeys raised the bar for the whole org.',
    author: {
      name: 'Sofia Almeida',
      headline: 'Staff Engineer at Harbor Labs',
    },
    date: '2021-06',
    order: 1,
  },
];

describe('Recommendations', () => {
  it('renders a labelled Recommendations section with one entry per recommendation', () => {
    render(<Recommendations recommendations={sample} />);
    const section = screen.getByRole('region', { name: /recommendations/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the recommendation body and author name', () => {
    render(<Recommendations recommendations={sample} />);
    expect(screen.getByText(/most rigorous accessibility engineers/i)).toBeInTheDocument();
    expect(screen.getByText('Jordan Avery')).toBeInTheDocument();
    expect(screen.getByText('Sofia Almeida')).toBeInTheDocument();
  });

  it('renders the author headline', () => {
    render(<Recommendations recommendations={sample} />);
    expect(screen.getByText('Engineering Manager at Stellar UX')).toBeInTheDocument();
  });

  it('links the author name when author.url is present', () => {
    render(<Recommendations recommendations={sample} />);
    const link = screen.getByRole('link', { name: 'Jordan Avery' });
    expect(link).toHaveAttribute('href', 'https://example.org/in/jordan-avery');
  });

  it('renders the author name as plain text when author.url is absent', () => {
    render(<Recommendations recommendations={sample} />);
    expect(screen.queryByRole('link', { name: 'Sofia Almeida' })).not.toBeInTheDocument();
    expect(screen.getByText('Sofia Almeida')).toBeInTheDocument();
  });

  it('renders the relationship when present', () => {
    render(<Recommendations recommendations={sample} />);
    expect(screen.getByText('Managed Pat directly')).toBeInTheDocument();
  });

  it('renders date as <time dateTime>', () => {
    const single: LocalizedRecommendation[] = [
      { id: 'only', body: 'Great collaborator.', author: { name: 'Alex Kim' }, date: '2022-04' },
    ];
    const { container } = render(<Recommendations recommendations={single} />);
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2022-04');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Recommendations recommendations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then date DESC, with undated entries last within their order', () => {
    // order and date intentionally disagree, and 'd' has no date to exercise the
    // optional-date tiebreak. Expected (order ASC, date DESC): c (o1, 2022),
    // b (o1, 2020), d (o1, no date sinks last within the order), a (o2, 2024).
    const unordered: LocalizedRecommendation[] = [
      { id: 'a', body: 'A', author: { name: 'A' }, date: '2024-01', order: 2 },
      { id: 'b', body: 'B', author: { name: 'B' }, date: '2020-01', order: 1 },
      { id: 'c', body: 'C', author: { name: 'C' }, date: '2022-01', order: 1 },
      { id: 'd', body: 'D', author: { name: 'D' }, order: 1 },
    ];
    render(<Recommendations recommendations={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('C');
    expect(items[1]).toHaveTextContent('B');
    expect(items[2]).toHaveTextContent('D');
    expect(items[3]).toHaveTextContent('A');
  });
});
