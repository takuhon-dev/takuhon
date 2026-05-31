import type { LocalizedPatent, PatentStatus } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Patents } from '../Patents.js';

const sample: LocalizedPatent[] = [
  {
    id: 'p1',
    title: 'Method for X',
    patentNumber: 'US 11,987,654 B2',
    office: 'USPTO',
    status: 'issued',
    filingDate: '2022-04',
    grantDate: '2024-03',
    url: 'https://example.org/p1',
    coInventors: ['Jamie Chen'],
  },
  {
    id: 'p2',
    title: 'System for Y',
    patentNumber: 'US 18/123,456',
    office: 'USPTO',
    status: 'pending',
    filingDate: '2024-08',
  },
];

describe('Patents', () => {
  it('renders a labelled Patents section with one entry per patent', () => {
    render(<Patents patents={sample} />);
    const section = screen.getByRole('region', { name: /patents/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders a status badge with a data-status attribute per entry', () => {
    const { container } = render(<Patents patents={sample} />);
    const badges = container.querySelectorAll('[data-status]');
    expect(badges).toHaveLength(2);
    expect(container.querySelector('[data-status="issued"]')).not.toBeNull();
    expect(container.querySelector('[data-status="pending"]')).not.toBeNull();
  });

  it('renders status badge labels for all enum values', () => {
    const statuses: PatentStatus[] = ['issued', 'pending', 'expired', 'abandoned'];
    const all: LocalizedPatent[] = statuses.map((status, i) => ({
      id: `p${i}`,
      title: `Patent ${status}`,
      patentNumber: `N-${i}`,
      status,
    }));
    render(<Patents patents={all} />);
    expect(screen.getByText(/Issued/)).toBeInTheDocument();
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    expect(screen.getByText(/Abandoned/)).toBeInTheDocument();
  });

  it('prefixes the status badge with a screen-reader-only "Status:" label', () => {
    const { container } = render(<Patents patents={sample} />);
    const issuedBadge = container.querySelector('[data-status="issued"]');
    const pendingBadge = container.querySelector('[data-status="pending"]');
    expect(issuedBadge?.textContent).toMatch(/Status:\s*Issued/);
    expect(pendingBadge?.textContent).toMatch(/Status:\s*Pending/);
  });

  it('renders patentNumber prominently for each entry', () => {
    render(<Patents patents={sample} />);
    expect(screen.getByText('US 11,987,654 B2')).toBeInTheDocument();
    expect(screen.getByText('US 18/123,456')).toBeInTheDocument();
  });

  it('renders coInventors joined by commas with a leading "with"', () => {
    render(<Patents patents={sample} />);
    expect(screen.getByText('with Jamie Chen')).toBeInTheDocument();
  });

  it('localizes status, date prefixes, and co-inventors via the locale prop', () => {
    render(<Patents patents={sample} locale="ja" />);
    expect(screen.getByText('共同発明者：Jamie Chen')).toBeInTheDocument();
    // Region named by its <h2>: finding it by the Japanese heading confirms
    // the heading is localized too.
    const section = screen.getByRole('region', { name: '特許' });
    // Pin each label to its date so the date-prefix path is verified distinctly
    // from the status badge (出願 vs 出願中, 登録 vs 登録済 would otherwise overlap).
    expect(section.textContent).toMatch(/出願 2022年4月/); // filed date prefix
    expect(section.textContent).toMatch(/登録 2024年3月/); // granted date prefix
    expect(section.textContent).toMatch(/登録済/); // issued status badge
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Patents patents={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then grantDate (falling back to filingDate) DESC', () => {
    const unordered: LocalizedPatent[] = [
      {
        id: 'a',
        title: 'A',
        patentNumber: 'A',
        status: 'issued',
        grantDate: '2020-01',
        order: 1,
      },
      {
        id: 'b',
        title: 'B',
        patentNumber: 'B',
        status: 'issued',
        grantDate: '2023-01',
        order: 1,
      },
      {
        id: 'c',
        title: 'C',
        patentNumber: 'C',
        status: 'pending',
        filingDate: '2024-01',
        order: 1,
      },
    ];
    render(<Patents patents={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('C');
    expect(items[1]).toHaveTextContent('B');
    expect(items[2]).toHaveTextContent('A');
  });
});
