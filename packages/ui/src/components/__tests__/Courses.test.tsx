import type { LocalizedCourse } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Courses } from '../Courses.js';

const sample: LocalizedCourse[] = [
  {
    id: 'coursera',
    title: 'Advanced Web Accessibility',
    provider: 'Coursera',
    courseNumber: 'UMICH-A11Y-301',
    completionDate: '2023-11',
    certificateUrl: 'https://example.org/cert',
  },
];

describe('Courses', () => {
  it('renders a labelled Courses section with one entry per course', () => {
    render(<Courses courses={sample} />);
    const section = screen.getByRole('region', { name: /courses/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders the title as a link to certificateUrl when present', () => {
    render(<Courses courses={sample} />);
    const link = screen.getByRole('link', { name: /Advanced Web Accessibility/ });
    expect(link).toHaveAttribute('href', 'https://example.org/cert');
  });

  it('renders the title as plain text when certificateUrl is absent', () => {
    const noUrl: LocalizedCourse[] = [{ id: 'no-url', title: 'Plain Course' }];
    render(<Courses courses={noUrl} />);
    expect(screen.queryByRole('link', { name: /Plain Course/ })).not.toBeInTheDocument();
    expect(screen.getByText('Plain Course')).toBeInTheDocument();
  });

  it('omits <time> when completionDate is absent', () => {
    const noDate: LocalizedCourse[] = [{ id: 'no-date', title: 'Undated Course' }];
    const { container } = render(<Courses courses={noDate} />);
    expect(container.querySelector('time')).toBeNull();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Courses courses={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders entries by order ASC then completionDate DESC with undefined trailing', () => {
    const unordered: LocalizedCourse[] = [
      { id: 'a', title: 'A', completionDate: '2020-01', order: 1 },
      { id: 'b', title: 'B', completionDate: '2023-01', order: 1 },
      { id: 'c', title: 'C', order: 1 },
    ];
    render(<Courses courses={unordered} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('B');
    expect(items[1]).toHaveTextContent('A');
    expect(items[2]).toHaveTextContent('C');
  });
});
