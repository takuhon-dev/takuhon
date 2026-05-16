import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '../index.js';

describe('@ownport/core smoke', () => {
  it('exports SCHEMA_VERSION', () => {
    expect(SCHEMA_VERSION).toBe('0.1.0');
  });
});
