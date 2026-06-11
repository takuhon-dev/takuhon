import type { ActivitySnapshot } from '@takuhon/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivitySection } from '../ActivitySection.js';

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
  rank: { tier: 'A', score: 62 },
};

describe('ActivitySection', () => {
  it('renders a labelled region containing the accessible activity card', () => {
    const { container } = render(<ActivitySection snapshot={SNAPSHOT} />);

    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Developer activity');
    expect(svg?.textContent).toContain('TypeScript 80%');
    expect(svg?.textContent).toContain('Last synced 2026-06-11');
  });

  it('renders nothing without a snapshot', () => {
    const { container } = render(<ActivitySection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a snapshot with no metric data', () => {
    const { container } = render(
      <ActivitySection snapshot={{ lastSyncedAt: '2026-06-11T00:00:00.000Z' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('localizes the section heading', () => {
    render(<ActivitySection snapshot={SNAPSHOT} locale="ja" />);
    expect(screen.getByRole('heading', { level: 2, name: 'アクティビティ' })).toBeInTheDocument();
  });
});
