import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import creatorJson from '../../../../examples/creator-profile/takuhon.json' with { type: 'json' };
import freelancerJson from '../../../../examples/freelancer-profile/takuhon.json' with { type: 'json' };
import minimalJson from '../../../../examples/minimal-profile/takuhon.json' with { type: 'json' };
import { SCHEMA_VERSION } from '../index.js';
import { schema } from '../schema.js';

// Compile the canonical schema once for all fixtures. We use Ajv2020 (matching
// validate.ts) because the schema declares draft 2020-12. `strict: false`
// mirrors the production validator so unknown keywords don't reject otherwise
// valid data.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateAgainstSchema = ajv.compile(schema);

describe.each([
  { name: 'creator-profile', data: creatorJson },
  { name: 'freelancer-profile', data: freelancerJson },
  { name: 'minimal-profile', data: minimalJson },
])('examples/$name/takuhon.json', ({ data }) => {
  it('matches the bundled SCHEMA_VERSION', () => {
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('passes Ajv schema validation', () => {
    const ok = validateAgainstSchema(data);
    if (!ok) {
      // Surface the validation errors so the failing assertion message is
      // useful for diagnosing schema drift in CI.
      throw new Error(JSON.stringify(validateAgainstSchema.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  it('declares a non-empty contentLicense.spdxId', () => {
    const license = data.meta.contentLicense.spdxId;
    expect(license).toBeTypeOf('string');
    expect(license.length).toBeGreaterThan(0);
  });
});
