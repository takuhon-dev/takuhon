import { describe, expect, it } from 'vitest';

import { getPresentLabel } from '../ui-labels.js';

describe('getPresentLabel', () => {
  it('resolves the exact locale', () => {
    expect(getPresentLabel('en')).toBe('Present');
    expect(getPresentLabel('ja')).toBe('現在');
  });

  it('falls back to the base language subtag (ja-JP -> ja)', () => {
    expect(getPresentLabel('ja-JP')).toBe('現在');
    expect(getPresentLabel('en-US')).toBe('Present');
  });

  it('falls back to English for any unknown locale', () => {
    expect(getPresentLabel('fr')).toBe('Present');
    expect(getPresentLabel('zz')).toBe('Present');
    expect(getPresentLabel('')).toBe('Present');
  });
});
