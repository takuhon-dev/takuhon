import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import { SUPPORTED_SCHEMA_VERSIONS, validate } from '../index.js';
import type { ValidationError, ValidationResult } from '../index.js';

type DeepWritable<T> = T extends object ? { -readonly [K in keyof T]: DeepWritable<T[K]> } : T;
type ExampleMutable = DeepWritable<typeof exampleJson>;

function cloneExample(): ExampleMutable {
  return JSON.parse(JSON.stringify(exampleJson)) as ExampleMutable;
}

function expectError(
  result: ValidationResult,
  match: (error: ValidationError) => boolean,
): ValidationError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected validate() to fail');
  const found = result.errors.find(match);
  expect(
    found,
    `no error matched\nactual errors: ${JSON.stringify(result.errors, null, 2)}`,
  ).toBeDefined();
  return found!;
}

describe('validate() positive cases', () => {
  it('accepts the bundled example profile', () => {
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.schemaVersion).toBe('0.1.0');
    }
  });

  it('treats Career.endDate: null as valid (current position)', () => {
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const current = result.data.careers.find((c) => c.isCurrent === true);
      expect(current?.endDate).toBeNull();
    }
  });

  it('exposes the supported schema version window', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain('0.1.0');
  });
});

describe('validate() top-level guards', () => {
  it('rejects array input with keyword=type and pointer=""', () => {
    const result = validate([]);
    const err = expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
    expect(err.message).toMatch(/JSON object/);
  });

  it('rejects null with keyword=type', () => {
    const result = validate(null);
    expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
  });

  it('rejects a primitive with keyword=type', () => {
    const result = validate('hello');
    expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
  });

  it('rejects schemaVersion outside the supported window', () => {
    const broken = { ...exampleJson, schemaVersion: '99.0.0' };
    const result = validate(broken);
    const err = expectError(
      result,
      (e) => e.keyword === 'schemaVersion' && e.pointer === '/schemaVersion',
    );
    expect(err.message).toMatch(/99\.0\.0/);
  });
});

describe('validate() schema-level failures', () => {
  it('flags missing schemaVersion via Ajv required', () => {
    const broken = cloneExample() as Partial<ExampleMutable>;
    delete broken.schemaVersion;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'required' && e.pointer === '/schemaVersion');
  });

  it('flags unknown root-level key (closed root)', () => {
    const broken = { ...exampleJson, extra: 'nope' };
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'additionalProperties' && e.pointer === '/extra');
  });

  it('flags unknown key on ContentLicense (closed)', () => {
    const broken = cloneExample();
    (broken.meta.contentLicense as Record<string, unknown>).unexpected = 'x';
    const result = validate(broken);
    expectError(
      result,
      (e) =>
        e.keyword === 'additionalProperties' && e.pointer === '/meta/contentLicense/unexpected',
    );
  });

  it('flags unknown key on a Link entry (closed)', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).hint = 'no';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/links/0/hint',
    );
  });

  it('rejects unknown LinkType values', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).type = 'not-a-real-type';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'enum' && e.pointer === '/links/0/type');
  });

  it('requires iconUrl on a custom-type link', () => {
    const broken = cloneExample();
    const customIdx = broken.links.findIndex((l) => l.type === 'custom');
    expect(customIdx).toBeGreaterThanOrEqual(0);
    const customLink = broken.links[customIdx];
    if (!customLink) throw new Error('expected example to contain a custom link');
    delete (customLink as { iconUrl?: string }).iconUrl;
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'required' && e.pointer === `/links/${customIdx}/iconUrl`,
    );
  });

  it('rejects malformed Career.startDate (YearMonth pattern)', () => {
    const broken = cloneExample();
    const firstCareer = broken.careers[0];
    if (!firstCareer) throw new Error('expected example to contain at least one career');
    firstCareer.startDate = '2023-13';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'pattern' && e.pointer === '/careers/0/startDate');
  });

  it('rejects a LocalizedTitle key that violates the BCP-47 locale pattern', () => {
    const broken = cloneExample();
    (broken.profile.displayName as Record<string, string>)._ = 'underscore-tag';
    const result = validate(broken);
    // Ajv reports propertyNames violations on the parent object's path.
    expectError(result, (e) => e.keyword === 'pattern' && e.pointer === '/profile/displayName');
  });

  it('rejects links arrays beyond maxItems', () => {
    const broken = cloneExample();
    const overflow = Array.from({ length: 101 }, (_, i) => ({
      id: `link-${i}`,
      type: 'website',
      url: 'https://example.com',
    }));
    (broken as { links: unknown }).links = overflow;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'maxItems' && e.pointer === '/links');
  });

  it('rejects Skill.label longer than 100 chars (maxLength)', () => {
    const broken = cloneExample();
    const firstSkill = broken.skills[0];
    if (!firstSkill) throw new Error('expected example to contain at least one skill');
    firstSkill.label = 'a'.repeat(101);
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'maxLength' && e.pointer === '/skills/0/label');
  });

  it('rejects empty availableLocales (minItems)', () => {
    const broken = cloneExample();
    broken.settings.availableLocales = [];
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'minItems' && e.pointer === '/settings/availableLocales',
    );
  });

  it('rejects duplicate locales in availableLocales (uniqueItems)', () => {
    const broken = cloneExample();
    broken.settings.availableLocales = ['en', 'en'];
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'uniqueItems' && e.pointer === '/settings/availableLocales',
    );
  });

  it('rejects negative Link.order (minimum)', () => {
    const broken = cloneExample();
    const firstLink = broken.links[0];
    if (!firstLink) throw new Error('expected example to contain at least one link');
    firstLink.order = -1;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'minimum' && e.pointer === '/links/0/order');
  });

  it('rejects malformed Iso3166Alpha2 country code (pattern)', () => {
    const broken = cloneExample();
    if (!broken.profile.location) {
      throw new Error('expected example to include profile.location');
    }
    broken.profile.location.country = 'xyz';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'pattern' && e.pointer === '/profile/location/country',
    );
  });
});

describe('validate() format failures (ajv-formats)', () => {
  it('rejects a malformed Contact.email', () => {
    const broken = cloneExample();
    broken.contact.email = 'not-an-email';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/contact/email');
  });

  it('rejects a relative Link.url against format: uri', () => {
    const broken = cloneExample();
    const firstLink = broken.links[0];
    if (!firstLink) throw new Error('expected example to contain at least one link');
    firstLink.url = '/relative-not-uri';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/links/0/url');
  });

  it('accepts a relative Avatar.url against format: uri-reference', () => {
    // The bundled example uses "/assets/avatar.webp"; ensure that stays valid.
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed Meta.createdAt (date-time format)', () => {
    const broken = cloneExample();
    broken.meta.createdAt = 'not-a-date';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/meta/createdAt');
  });
});

describe('validate() error envelope details', () => {
  it('reports allErrors when multiple invariants fail simultaneously', () => {
    const broken = { ...exampleJson, extra1: 1, extra2: 2 };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const extras = result.errors.filter((e) => e.keyword === 'additionalProperties');
      expect(extras.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes a schemaPointer for Ajv-sourced errors', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).type = 'not-a-real-type';
    const result = validate(broken);
    const err = expectError(result, (e) => e.keyword === 'enum');
    expect(err.schemaPointer).toMatch(/Link/);
  });

  it('escapes RFC 6901 reserved characters (~, /) when building pointers', () => {
    // Root has additionalProperties: false, so an unknown property at the root
    // produces an `additionalProperties` error whose pointer is built by
    // appending `/<escaped property name>`. `/` must escape to `~1` and `~`
    // must escape to `~0` per RFC 6901.
    const broken = { ...exampleJson, 'foo/bar': 1, 'tilde~name': 2 };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validate() to fail');
    const slashErr = result.errors.find(
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/foo~1bar',
    );
    const tildeErr = result.errors.find(
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/tilde~0name',
    );
    expect(slashErr, `expected escaped pointer /foo~1bar`).toBeDefined();
    expect(tildeErr, `expected escaped pointer /tilde~0name`).toBeDefined();
  });
});
