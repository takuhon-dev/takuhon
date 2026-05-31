import { describe, expect, it } from 'vitest';

import { getUILabel } from '../ui-labels.js';

describe('getUILabel', () => {
  it('resolves English fixed labels', () => {
    expect(getUILabel('timeline.present', 'en')).toBe('Present');
    expect(getUILabel('certification.noExpiration', 'en')).toBe('No expiration');
    expect(getUILabel('patent.filed', 'en')).toBe('Filed');
    expect(getUILabel('patent.granted', 'en')).toBe('Granted');
    expect(getUILabel('patent.coInventorsPrefix', 'en')).toBe('with ');
    expect(getUILabel('publication.coAuthorsPrefix', 'en')).toBe('with ');
  });

  it('resolves Japanese fixed labels', () => {
    expect(getUILabel('timeline.present', 'ja')).toBe('現在');
    expect(getUILabel('certification.noExpiration', 'ja')).toBe('無期限');
    expect(getUILabel('patent.filed', 'ja')).toBe('出願');
    expect(getUILabel('patent.granted', 'ja')).toBe('登録');
    expect(getUILabel('patent.coInventorsPrefix', 'ja')).toBe('共同発明者：');
    expect(getUILabel('publication.coAuthorsPrefix', 'ja')).toBe('共著者：');
  });

  it('resolves enum-derived proficiency labels per locale', () => {
    expect(getUILabel('proficiency.native', 'en')).toBe('Native');
    expect(getUILabel('proficiency.professional', 'en')).toBe('Professional working');
    expect(getUILabel('proficiency.native', 'ja')).toBe('ネイティブ');
    expect(getUILabel('proficiency.professional', 'ja')).toBe('実務レベル');
  });

  it('resolves enum-derived patent-status labels per locale', () => {
    expect(getUILabel('patentStatus.issued', 'en')).toBe('Issued');
    expect(getUILabel('patentStatus.abandoned', 'en')).toBe('Abandoned');
    expect(getUILabel('patentStatus.issued', 'ja')).toBe('登録済');
    expect(getUILabel('patentStatus.abandoned', 'ja')).toBe('放棄');
  });

  it('resolves a base-language match for a regional tag', () => {
    expect(getUILabel('timeline.present', 'ja-JP')).toBe('現在');
    expect(getUILabel('timeline.present', 'en-US')).toBe('Present');
  });

  it('falls back to English for a locale without a shipped dictionary', () => {
    expect(getUILabel('timeline.present', 'fr')).toBe('Present');
    expect(getUILabel('proficiency.fluent', 'zh-Hant')).toBe('Fluent');
  });

  it('resolves section headings per locale', () => {
    expect(getUILabel('section.career', 'en')).toBe('Career');
    expect(getUILabel('section.career', 'ja')).toBe('職歴');
    expect(getUILabel('section.honors', 'en')).toBe('Honors & Awards');
    expect(getUILabel('section.contact', 'ja')).toBe('連絡先');
  });

  it('resolves a11y / chrome labels per locale', () => {
    expect(getUILabel('a11y.statusPrefix', 'en')).toBe('Status: ');
    expect(getUILabel('a11y.causePrefix', 'ja')).toBe('分野：');
    expect(getUILabel('a11y.profileLinks', 'ja')).toBe('プロフィールリンク');
    expect(getUILabel('a11y.selectLanguage', 'ja')).toBe('言語を選択');
    expect(getUILabel('contact.formLink', 'en')).toBe('Contact form');
  });
});
