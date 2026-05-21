import { resolveLocale } from '@takuhon/core';
import type { Ownport } from '@takuhon/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { LinksList } from '../LinksList.js';

const example = resolveLocale(exampleJson as unknown as Ownport, 'en');

describe('LinksList', () => {
  it('renders one link per entry inside a labelled nav', () => {
    render(<LinksList links={example.links} />);
    const nav = screen.getByRole('navigation', { name: /profile links/i });
    expect(nav).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(example.links.length);
  });

  it('places featured entries before non-featured ones', () => {
    render(<LinksList links={example.links} />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map((el) => el.getAttribute('href'));
    expect(hrefs.slice(0, 2)).toEqual([
      'https://example.com/pat',
      'https://github.com/example-pat',
    ]);
  });

  it('falls back to id label when label and type would be ambiguous', () => {
    render(
      <LinksList
        links={[
          {
            id: 'newsletter',
            type: 'custom',
            url: 'https://example.com/n',
            iconUrl: 'https://example.com/i.svg',
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /newsletter/i })).toBeInTheDocument();
  });

  it('renders decorative icons with empty alt and without aria-hidden', () => {
    render(<LinksList links={example.links} />);
    const decorativeIcons = document.querySelectorAll('img[alt=""]');
    expect(decorativeIcons.length).toBeGreaterThan(0);
    for (const img of decorativeIcons) {
      expect(img.hasAttribute('aria-hidden')).toBe(false);
    }
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<LinksList links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
