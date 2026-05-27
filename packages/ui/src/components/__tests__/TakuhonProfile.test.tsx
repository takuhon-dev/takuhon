import { resolveLocale, validate } from '@takuhon/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { TakuhonProfile } from '../TakuhonProfile.js';

const validated = validate(exampleJson);
if (!validated.ok) {
  throw new Error('Example fixture failed validation; UI tests cannot run.');
}
const example = resolveLocale(validated.data, 'en');

describe('TakuhonProfile', () => {
  it('renders the profile through validate → resolveLocale without crashing', () => {
    const { container } = render(<TakuhonProfile data={example} />);
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('exposes the displayName as the top-level h1', () => {
    render(<TakuhonProfile data={example} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pat Rivera' })).toBeInTheDocument();
  });

  it('renders Career, Projects, Skills sections as labelled regions', () => {
    render(<TakuhonProfile data={example} />);
    expect(screen.getByRole('region', { name: /career/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /skills/i })).toBeInTheDocument();
  });

  it('renders Tier 2 sections (Memberships, Volunteering, Publications, Courses, Patents) as labelled regions when the fixture populates them', () => {
    render(<TakuhonProfile data={example} />);
    expect(screen.getByRole('region', { name: /memberships/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /volunteering/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /publications/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /courses/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /patents/i })).toBeInTheDocument();
  });

  it('omits the Footer when settings.showPoweredBy is false', () => {
    render(
      <TakuhonProfile
        data={{ ...example, settings: { ...example.settings, showPoweredBy: false } }}
      />,
    );
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('renders the Footer when settings.showPoweredBy is true', () => {
    render(<TakuhonProfile data={example} />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
