import { describe, expect, it } from 'vitest';

import { MCP_PROFILE_SECTIONS } from '../mcp.js';
import { SECTION_KEYS, type SectionKey } from '../sections.js';
import type { PublicVisibility } from '../types.js';

/**
 * Every visibility-controlled data section (except `links`, which the renderer
 * places specially and does not treat as a reorderable section) must have a
 * canonical section key, so the section flow, `settings.sectionOrder`, and the
 * privacy controls stay in lock-step. `contact` is a `PublicVisibility` key too
 * and is included.
 */
const PUBLIC_VISIBILITY_KEYS: readonly (keyof PublicVisibility)[] = [
  'links',
  'careers',
  'projects',
  'skills',
  'certifications',
  'memberships',
  'volunteering',
  'honors',
  'education',
  'publications',
  'languages',
  'courses',
  'patents',
  'testScores',
  'recommendations',
  'contact',
];

describe('SECTION_KEYS', () => {
  it('covers every visibility-controlled data section except links', () => {
    const keys = new Set<string>(SECTION_KEYS);
    for (const key of PUBLIC_VISIBILITY_KEYS) {
      if (key === 'links') continue;
      expect(keys.has(key)).toBe(true);
    }
  });

  it('adds only the page-only sections beyond the data sections', () => {
    const dataSections = new Set<string>(PUBLIC_VISIBILITY_KEYS.filter((k) => k !== 'links'));
    const pageOnly = SECTION_KEYS.filter((k) => !dataSections.has(k));
    expect([...pageOnly].sort()).toEqual(['about', 'activity', 'highlights']);
  });

  it('has no duplicate keys', () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length);
  });

  it('places sections in the ratified default order', () => {
    expect(SECTION_KEYS).toEqual([
      'about',
      'careers',
      'projects',
      'volunteering',
      'skills',
      'activity',
      'education',
      'certifications',
      'publications',
      'honors',
      'memberships',
      'courses',
      'patents',
      'testScores',
      'languages',
      'recommendations',
      'highlights',
      'contact',
    ] satisfies SectionKey[]);
  });

  it('keeps every renderable data section reachable over MCP', () => {
    // Sanity: the MCP catalog and the renderer agree on the data sections
    // (about/activity/highlights are page-only and not MCP get_section targets).
    const mcp = new Set<string>(MCP_PROFILE_SECTIONS);
    for (const key of SECTION_KEYS) {
      if (key === 'about' || key === 'activity' || key === 'highlights') continue;
      expect(mcp.has(key)).toBe(true);
    }
  });
});
