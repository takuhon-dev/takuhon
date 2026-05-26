import type { LocalizedEducation } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EducationTimeline } from '../EducationTimeline.js';

const sample: LocalizedEducation[] = [
  {
    id: 'todai',
    institution: 'The University of Tokyo',
    degree: 'Bachelor of Engineering',
    fieldOfStudy: 'Computer Science',
    startDate: '2014-04',
    endDate: '2018-03',
    grade: 'GPA 3.9',
  },
];

describe('EducationTimeline', () => {
  it('renders a labelled Education section with one entry per education record', () => {
    render(<EducationTimeline education={sample} />);
    const section = screen.getByRole('region', { name: /education/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
  });

  it('composes degree and fieldOfStudy on a single line when both are present', () => {
    render(<EducationTimeline education={sample} />);
    expect(screen.getByText(/Bachelor of Engineering · Computer Science/)).toBeInTheDocument();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<EducationTimeline education={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
