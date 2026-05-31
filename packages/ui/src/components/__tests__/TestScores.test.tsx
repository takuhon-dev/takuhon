import type { LocalizedTestScore } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TestScores } from '../TestScores.js';

const sample: LocalizedTestScore[] = [
  {
    id: 'toefl',
    title: 'TOEFL iBT',
    score: '112 / 120',
    date: '2023-08',
    url: 'https://example.org/scores/toefl',
    description: 'Internet-based English proficiency test.',
  },
  {
    id: 'gre',
    title: 'GRE General Test',
    score: '332 / 340',
    date: '2013-10',
    relatedEducationId: 'westbrook-bsc',
  },
];

describe('TestScores', () => {
  it('renders a labelled Test Scores section with one entry per score', () => {
    render(<TestScores testScores={sample} />);
    const section = screen.getByRole('region', { name: /test scores/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the score for each entry', () => {
    render(<TestScores testScores={sample} />);
    expect(screen.getByText('112 / 120')).toBeInTheDocument();
    expect(screen.getByText('332 / 340')).toBeInTheDocument();
  });

  it('renders the title as a link when a url is present', () => {
    render(<TestScores testScores={sample} />);
    const link = screen.getByRole('link', { name: 'TOEFL iBT' });
    expect(link).toHaveAttribute('href', 'https://example.org/scores/toefl');
  });

  it('renders the title as plain text when no url is present', () => {
    render(<TestScores testScores={sample} />);
    expect(screen.queryByRole('link', { name: 'GRE General Test' })).not.toBeInTheDocument();
    expect(screen.getByText('GRE General Test')).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(<TestScores testScores={sample} />);
    expect(screen.getByText('Internet-based English proficiency test.')).toBeInTheDocument();
  });

  it('renders date as <time dateTime>', () => {
    const minimal: LocalizedTestScore[] = [
      { id: 'gre', title: 'GRE General Test', score: '332 / 340', date: '2013-10' },
    ];
    const { container } = render(<TestScores testScores={minimal} />);
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2013-10');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<TestScores testScores={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then date DESC, with missing order last', () => {
    // order and date intentionally disagree so neither axis alone yields this
    // result. Expected (order ASC, date DESC): c (o1, 2022), b (o1, 2020),
    // a (o2, 2024), then d (no order -> +Infinity) despite its newest date.
    const unordered: LocalizedTestScore[] = [
      { id: 'a', title: 'A', score: '1', date: '2024-01', order: 2 },
      { id: 'b', title: 'B', score: '2', date: '2020-01', order: 1 },
      { id: 'c', title: 'C', score: '3', date: '2022-01', order: 1 },
      { id: 'd', title: 'D', score: '4', date: '2099-01' },
    ];
    render(<TestScores testScores={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('C');
    expect(items[1]).toHaveTextContent('B');
    expect(items[2]).toHaveTextContent('A');
    expect(items[3]).toHaveTextContent('D');
  });
});
