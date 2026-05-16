import { resolveLocale, validate } from '@ownport/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import { OwnportProfile } from '../OwnportProfile.js';

const validated = validate(exampleJson);
if (!validated.ok) {
  throw new Error('Example fixture failed validation; UI tests cannot run.');
}
const example = resolveLocale(validated.data, 'en');

describe('OwnportProfile', () => {
  it('renders the profile through validate → resolveLocale without crashing', () => {
    const { container } = render(<OwnportProfile data={example} />);
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('exposes the displayName as the top-level h1', () => {
    render(<OwnportProfile data={example} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pat Rivera' })).toBeInTheDocument();
  });

  it('renders Career, Projects, Skills sections as labelled regions', () => {
    render(<OwnportProfile data={example} />);
    expect(screen.getByRole('region', { name: /career/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /skills/i })).toBeInTheDocument();
  });

  it('omits the Footer when settings.showPoweredBy is false', () => {
    render(
      <OwnportProfile
        data={{ ...example, settings: { ...example.settings, showPoweredBy: false } }}
      />,
    );
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('renders the Footer when settings.showPoweredBy is true', () => {
    render(<OwnportProfile data={example} />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
