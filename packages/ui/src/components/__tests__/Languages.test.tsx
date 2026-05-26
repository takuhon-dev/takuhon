import type { LocalizedLanguage } from '@takuhon/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Languages } from '../Languages.js';

const sample: LocalizedLanguage[] = [
  { id: 'ja', language: 'ja', displayName: 'Japanese', proficiency: 'native' },
  { id: 'en', language: 'en', displayName: 'English', proficiency: 'fluent' },
];

describe('Languages', () => {
  it('renders a labelled Languages section with one entry per language', () => {
    render(<Languages languages={sample} />);
    const section = screen.getByRole('region', { name: /languages/i });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the human-readable proficiency label', () => {
    render(<Languages languages={sample} />);
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Fluent')).toBeInTheDocument();
  });

  it('sets lang attribute on the language name element', () => {
    render(<Languages languages={sample} />);
    const ja = screen.getByText('Japanese');
    expect(ja).toHaveAttribute('lang', 'ja');
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<Languages languages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
