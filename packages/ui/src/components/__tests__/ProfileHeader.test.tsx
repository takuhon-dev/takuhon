import { resolveLocale } from '@meport/core';
import type { Meport } from '@meport/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/meport.json' with { type: 'json' };
import { ProfileHeader } from '../ProfileHeader.js';

const example = resolveLocale(exampleJson as unknown as Meport, 'en');

describe('ProfileHeader', () => {
  it('renders displayName as level-1 heading', () => {
    render(<ProfileHeader profile={example.profile} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pat Rivera' })).toBeInTheDocument();
  });

  it('renders avatar with accessible alt text', () => {
    render(<ProfileHeader profile={example.profile} />);
    const img = screen.getByRole('img', { name: /Pat Rivera smiling/i });
    expect(img).toHaveAttribute('src', '/assets/avatar.webp');
  });

  it('omits optional sections when profile lacks them', () => {
    render(<ProfileHeader profile={{ displayName: 'Solo' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Solo' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders location display string when present', () => {
    render(<ProfileHeader profile={example.profile} />);
    expect(screen.getByText('Lisbon, Portugal')).toBeInTheDocument();
  });
});
