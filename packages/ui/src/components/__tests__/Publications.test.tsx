import type { LocalizedPublication } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Publications } from '../Publications.js';

const sample: LocalizedPublication[] = [
  {
    id: 'paper-1',
    title: 'Auditing Design Tokens for WCAG Conformance',
    publisher: 'ACM SIGACCESS',
    date: '2024-03',
    url: 'https://example.org/paper',
    doi: '10.1145/3678901.3678910',
    coAuthors: ['Jamie Chen', 'Sofia Almeida'],
  },
];

describe('Publications', () => {
  it('renders a labelled Publications section with one entry per publication', () => {
    render(<Publications publications={sample} />);
    const section = screen.getByRole('region', { name: /publications/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders doi as an https://doi.org/<id> link', () => {
    render(<Publications publications={sample} />);
    const doiLink = screen.getByRole('link', { name: /^doi:10\.1145/i });
    expect(doiLink).toHaveAttribute('href', 'https://doi.org/10.1145/3678901.3678910');
  });

  it('strips an accidental https://doi.org/ prefix from the doi value', () => {
    const withUrl: LocalizedPublication[] = [
      {
        id: 'url-doi',
        title: 'URL-shaped DOI',
        date: '2024-01',
        doi: 'https://doi.org/10.1000/xyz999',
      },
    ];
    render(<Publications publications={withUrl} />);
    const doiLink = screen.getByRole('link', { name: /^doi:10\.1000/i });
    expect(doiLink).toHaveAttribute('href', 'https://doi.org/10.1000/xyz999');
  });

  it('strips a leading https://dx.doi.org/ prefix from the doi value', () => {
    const withDx: LocalizedPublication[] = [
      {
        id: 'dx-doi',
        title: 'dx-shaped DOI',
        date: '2024-01',
        doi: 'https://dx.doi.org/10.2000/abc111',
      },
    ];
    render(<Publications publications={withDx} />);
    const doiLink = screen.getByRole('link', { name: /^doi:10\.2000/i });
    expect(doiLink).toHaveAttribute('href', 'https://doi.org/10.2000/abc111');
  });

  it('renders coAuthors joined by commas with a leading "with"', () => {
    render(<Publications publications={sample} />);
    expect(screen.getByText('with Jamie Chen, Sofia Almeida')).toBeInTheDocument();
  });

  it('renders date as <time dateTime>', () => {
    const { container } = render(<Publications publications={sample} />);
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2024-03');
  });

  it('omits coAuthors line when coAuthors is absent or empty', () => {
    const minimal: LocalizedPublication[] = [
      { id: 'm', title: 'Minimal', date: '2024-01' },
    ];
    render(<Publications publications={minimal} />);
    expect(screen.queryByText(/^with /)).not.toBeInTheDocument();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Publications publications={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then date DESC', () => {
    const unordered: LocalizedPublication[] = [
      { id: 'a', title: 'A', date: '2018-01', order: 2 },
      { id: 'b', title: 'B', date: '2022-01', order: 1 },
      { id: 'c', title: 'C', date: '2020-01', order: 1 },
    ];
    render(<Publications publications={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('B');
    expect(items[1]).toHaveTextContent('C');
    expect(items[2]).toHaveTextContent('A');
  });
});
