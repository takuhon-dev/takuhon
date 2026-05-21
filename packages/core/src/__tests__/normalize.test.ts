import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { normalize, validate } from '../index.js';
import type { Ownport } from '../index.js';

function cloneExample(): Ownport {
  return JSON.parse(JSON.stringify(exampleJson)) as Ownport;
}

describe('normalize() shape invariants', () => {
  it('keeps the bundled example deep-equal when nothing needs cleaning or reordering', () => {
    const fresh = cloneExample();
    const normalized = normalize(fresh);
    expect(normalized).toEqual(cloneExample());
  });

  it('is idempotent: normalize(normalize(x)) deep-equals normalize(x)', () => {
    const once = normalize(cloneExample());
    const twice = normalize(once);
    expect(twice).toEqual(once);
  });

  it('does not mutate the input document', () => {
    const input = cloneExample();
    const snapshot = JSON.stringify(input);
    normalize(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('produces output that re-validates successfully', () => {
    const normalized = normalize(cloneExample());
    const result = validate(normalized);
    expect(result.ok).toBe(true);
  });
});

describe('normalize() localized field cleanup', () => {
  it('drops whitespace-only entries from required LocalizedTitle maps', () => {
    const draft = cloneExample();
    draft.profile.displayName = { en: 'Pat Rivera', ja: '   ' };
    const normalized = normalize(draft);
    expect(normalized.profile.displayName).toEqual({ en: 'Pat Rivera' });
  });

  it('removes optional localized maps when every entry is blank', () => {
    const draft = cloneExample();
    draft.profile.tagline = { en: '   ', ja: '\t\n' };
    const normalized = normalize(draft);
    expect(normalized.profile.tagline).toBeUndefined();
  });

  it('cleans nested localized maps under avatar, location, links, careers, and projects', () => {
    const draft = cloneExample();
    if (draft.profile.avatar) draft.profile.avatar.alt = { en: 'photo', ja: '   ' };
    if (draft.profile.location) draft.profile.location.display = { en: '   ' };
    if (draft.links[0]) draft.links[0].label = { en: '   ', ja: 'サイト' };
    if (draft.careers[0]) draft.careers[0].description = { en: '   ' };
    if (draft.projects[0]) draft.projects[0].description = { en: 'Overview', ja: '   ' };

    const normalized = normalize(draft);

    expect(normalized.profile.avatar?.alt).toEqual({ en: 'photo' });
    expect(normalized.profile.location?.display).toBeUndefined();
    expect(normalized.links[0]?.label).toEqual({ ja: 'サイト' });
    expect(normalized.careers[0]?.description).toBeUndefined();
    expect(normalized.projects[0]?.description).toEqual({ en: 'Overview' });
  });
});

describe('normalize() ordering', () => {
  it('sorts links by ascending order; entries without order go last and remain stable', () => {
    const draft = cloneExample();
    const reversed = [...draft.links].reverse();
    const withoutOrderA = { ...reversed[0]! };
    const withoutOrderB = { ...reversed[1]! };
    delete withoutOrderA.order;
    delete withoutOrderB.order;
    const tail = reversed.slice(2);
    draft.links = [withoutOrderA, withoutOrderB, ...tail];

    const normalized = normalize(draft);
    const ids = normalized.links.map((l) => l.id);

    const expectedHead = [...tail].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => l.id);
    expect(ids.slice(0, tail.length)).toEqual(expectedHead);
    expect(ids.slice(-2)).toEqual([withoutOrderA.id, withoutOrderB.id]);
  });

  it('sorts careers, projects, and skills by ascending order', () => {
    const draft = cloneExample();
    draft.careers = [...draft.careers].reverse();
    draft.projects = [...draft.projects].reverse();
    draft.skills = [...draft.skills].reverse();

    const normalized = normalize(draft);

    expectAscendingOrder(normalized.careers);
    expectAscendingOrder(normalized.projects);
    expectAscendingOrder(normalized.skills);
  });
});

function expectAscendingOrder(items: { order?: number }[]): void {
  const orders = items.map((it) => it.order ?? Number.POSITIVE_INFINITY);
  for (let i = 1; i < orders.length; i++) {
    expect(orders[i]).toBeGreaterThanOrEqual(orders[i - 1]!);
  }
}
