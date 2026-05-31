import type { LocalizedCertification } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Certifications } from '../Certifications.js';

const sample: LocalizedCertification[] = [
  {
    id: 'aws-saa',
    title: 'AWS Certified Solutions Architect – Associate',
    issuingOrganization: 'Amazon Web Services',
    issueDate: '2024-06',
    expirationDate: '2027-06',
    url: 'https://aws.amazon.com/verification',
  },
  {
    id: 'permanent',
    title: 'Permanent Credential',
    issuingOrganization: 'Issuer',
    issueDate: '2020-01',
    expirationDate: null,
  },
];

describe('Certifications', () => {
  it('renders a labelled Certifications section with one entry per certificate', () => {
    render(<Certifications certifications={sample} />);
    const section = screen.getByRole('region', { name: /certifications/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders an explicit "No expiration" hint when expirationDate is null', () => {
    render(<Certifications certifications={sample} />);
    expect(screen.getByText(/No expiration/)).toBeInTheDocument();
  });

  it('localizes the "No expiration" hint via the locale prop', () => {
    render(<Certifications certifications={sample} locale="ja" />);
    expect(screen.getByText(/無期限/)).toBeInTheDocument();
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Certifications certifications={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
