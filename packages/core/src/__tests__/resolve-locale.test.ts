import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { resolveLocale } from '../index.js';
import type { Takuhon } from '../index.js';

function cloneExample(): Takuhon {
  return JSON.parse(JSON.stringify(exampleJson)) as Takuhon;
}

describe('resolveLocale() argument-driven chain', () => {
  it('uses the locale argument when it matches a populated entry', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to the fallbackLocale argument when locale has no match', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'fr', 'en');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('ignores invalid locale tags and continues the chain', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'zz_invalid', 'en');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });
});

describe('resolveLocale() settings-driven fallback', () => {
  it('falls through to settings.defaultLocale when arguments are absent', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'ja';
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to settings.fallbackLocale when defaultLocale has no match', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'fr';
    data.settings.fallbackLocale = 'ja';
    data.settings.availableLocales = ['en', 'ja'];
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to availableLocales[0] as the final settings step', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'fr';
    data.settings.fallbackLocale = 'de';
    data.settings.availableLocales = ['ja', 'en'];
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });
});

describe('resolveLocale() regional and case rules', () => {
  it('expands regional tags: en-US falls back to en when en-US is absent', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'en-US');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('compares locale tags case-insensitively (EN-us matches en)', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'EN-us');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
  });
});

describe('resolveLocale() per-field fallback', () => {
  it('resolves each localized field independently when entries are sparse', () => {
    const data = cloneExample();
    data.profile.displayName = { ja: 'パット' };
    data.profile.tagline = { en: 'Engineer' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.displayName).toBe('パット');
    expect(resolved.profile.tagline).toBe('Engineer');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('skips empty-string entries and continues to the next candidate', () => {
    const data = cloneExample();
    data.profile.displayName = { ja: '   ', en: 'Pat' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.displayName).toBe('Pat');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('drops optional localized fields entirely when no candidate matches', () => {
    const data = cloneExample();
    data.profile.tagline = { fr: 'Ingénieur' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.tagline).toBeUndefined();
  });
});

describe('resolveLocale() non-localized passthrough', () => {
  it('passes skills, contact, and meta through unchanged; localizes settings.skillCategories', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.skills).toEqual(data.skills);
    expect(resolved.contact).toEqual(data.contact);
    expect(resolved.meta).toEqual(data.meta);
    // Every settings field except the localized ones passes through unchanged
    // (this includes sectionOrder, which is not localized).
    const {
      skillCategories: resolvedCats,
      sectionLabels: resolvedLabels,
      highlightsIntro: resolvedIntro,
      ...resolvedRest
    } = resolved.settings;
    const {
      skillCategories: rawCats,
      sectionLabels: rawLabels,
      highlightsIntro: rawIntro,
      ...rawRest
    } = data.settings;
    expect(resolvedRest).toEqual(rawRest);
    // skillCategories labels are collapsed to the resolved locale's string.
    expect(resolvedCats).toEqual((rawCats ?? []).map((c) => ({ id: c.id, label: c.label.ja })));
    // sectionLabels values are collapsed to the resolved locale's string.
    expect(resolvedLabels).toEqual(
      Object.fromEntries(Object.entries(rawLabels ?? {}).map(([k, v]) => [k, v.ja])),
    );
    // highlightsIntro collapses to the resolved locale's string.
    expect(resolvedIntro).toEqual(rawIntro?.ja);
  });

  it('preserves Career endDate:null and Project tags arrays verbatim', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    const current = resolved.careers.find((c) => c.isCurrent === true);
    expect(current?.endDate).toBeNull();
    const firstProject = resolved.projects[0];
    expect(firstProject?.tags).toBeDefined();
    expect(Array.isArray(firstProject?.tags)).toBe(true);
  });
});

describe('resolveLocale() does not mutate input', () => {
  it('leaves the original document untouched after resolution', () => {
    const data = cloneExample();
    const snapshot = JSON.stringify(data);
    resolveLocale(data, 'ja');
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('resolveLocale() 0.2.0 / 0.3.0 entity helpers', () => {
  it('resolves Localized fields on certifications and preserves scalar fields', () => {
    const data = cloneExample();
    data.certifications = [
      {
        id: 'aws',
        title: { en: 'AWS SAA', ja: 'AWS 認定' },
        issuingOrganization: { en: 'Amazon', ja: 'アマゾン' },
        issueDate: '2024-06',
        expirationDate: '2027-06',
        credentialId: 'X-1',
        url: 'https://aws.example/x',
      },
    ];
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.certifications[0]?.title).toBe('AWS 認定');
    expect(resolved.certifications[0]?.issuingOrganization).toBe('アマゾン');
    expect(resolved.certifications[0]?.issueDate).toBe('2024-06');
    expect(resolved.certifications[0]?.credentialId).toBe('X-1');
    expect(resolved.certifications[0]?.expirationDate).toBe('2027-06');
  });

  it('resolves Localized fields on education with isCurrent passthrough', () => {
    const data = cloneExample();
    data.education = [
      {
        id: 'todai',
        institution: { en: 'UTokyo', ja: '東京大学' },
        degree: { en: 'BEng', ja: '学士' },
        startDate: '2014-04',
        endDate: null,
        isCurrent: true,
      },
    ];
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.education[0]?.institution).toBe('東京大学');
    expect(resolved.education[0]?.degree).toBe('学士');
    expect(resolved.education[0]?.isCurrent).toBe(true);
    expect(resolved.education[0]?.endDate).toBeNull();
  });

  it('resolves displayName on languages while keeping language tag as-is', () => {
    const data = cloneExample();
    data.languages = [
      {
        id: 'fr',
        language: 'fr',
        displayName: { en: 'French', ja: 'フランス語' },
        proficiency: 'professional',
      },
    ];
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.languages[0]?.language).toBe('fr');
    expect(resolved.languages[0]?.displayName).toBe('フランス語');
    expect(resolved.languages[0]?.proficiency).toBe('professional');
  });

  it('preserves coAuthors / coInventors arrays verbatim (not localized)', () => {
    const data = cloneExample();
    data.publications = [
      {
        id: 'p',
        title: { en: 'Paper' },
        date: '2023-08',
        coAuthors: ['Jane Smith', '山田 太郎'],
      },
    ];
    data.patents = [
      {
        id: 'pat',
        title: { en: 'Patent X' },
        patentNumber: 'US-1',
        status: 'issued',
        coInventors: ['Carlos Ruiz'],
      },
    ];
    const resolved = resolveLocale(data, 'en');
    expect(resolved.publications[0]?.coAuthors).toEqual(['Jane Smith', '山田 太郎']);
    expect(resolved.patents[0]?.coInventors).toEqual(['Carlos Ruiz']);
  });

  it('resolves Localized fields on testScores and passes through score / date / ref', () => {
    const data = cloneExample();
    data.testScores = [
      {
        id: 'gre',
        title: { en: 'GRE General Test', ja: 'GRE 一般試験' },
        score: '332 / 340',
        date: '2013-10',
        relatedEducationId: 'todai',
        description: { en: 'Combined score', ja: '合計スコア' },
        url: 'https://example.org/scores/gre',
      },
    ];
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.testScores[0]?.title).toBe('GRE 一般試験');
    expect(resolved.testScores[0]?.description).toBe('合計スコア');
    expect(resolved.testScores[0]?.score).toBe('332 / 340');
    expect(resolved.testScores[0]?.date).toBe('2013-10');
    expect(resolved.testScores[0]?.relatedEducationId).toBe('todai');
    expect(resolved.testScores[0]?.url).toBe('https://example.org/scores/gre');
  });

  it('resolves Localized fields on recommendations including the nested author.headline', () => {
    const data = cloneExample();
    data.recommendations = [
      {
        id: 'rec-1',
        body: { en: 'Great engineer.', ja: '素晴らしいエンジニアです。' },
        author: {
          name: 'Jordan Avery',
          headline: { en: 'Engineering Manager', ja: 'エンジニアリングマネージャー' },
          url: 'https://example.org/in/jordan',
        },
        relationship: { en: 'Managed directly', ja: '直属の上司' },
        date: '2023-09',
        relatedCareerId: 'acme',
      },
    ];
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.recommendations[0]?.body).toBe('素晴らしいエンジニアです。');
    expect(resolved.recommendations[0]?.author.name).toBe('Jordan Avery');
    expect(resolved.recommendations[0]?.author.headline).toBe('エンジニアリングマネージャー');
    expect(resolved.recommendations[0]?.author.url).toBe('https://example.org/in/jordan');
    expect(resolved.recommendations[0]?.relationship).toBe('直属の上司');
    expect(resolved.recommendations[0]?.date).toBe('2023-09');
    expect(resolved.recommendations[0]?.relatedCareerId).toBe('acme');
  });
});

describe('resolveLocale() carries per-item visibility', () => {
  it('preserves <item>.visibility from the raw document onto the localized items', () => {
    const data = cloneExample();
    data.links[0]!.visibility = 'private';
    data.careers[0]!.visibility = 'private';
    data.projects[0]!.visibility = 'public';
    // `skills` pass through unchanged, so visibility rides along with the item.
    data.skills[0]!.visibility = 'private';
    const resolved = resolveLocale(data, 'en');
    expect(resolved.links[0]?.visibility).toBe('private');
    expect(resolved.careers[0]?.visibility).toBe('private');
    expect(resolved.projects[0]?.visibility).toBe('public');
    expect(resolved.skills[0]?.visibility).toBe('private');
  });

  it('leaves visibility undefined on items that do not set it', () => {
    const resolved = resolveLocale(cloneExample(), 'en');
    expect(resolved.links[0]?.visibility).toBeUndefined();
  });
});
