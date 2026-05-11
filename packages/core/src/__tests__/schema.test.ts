import { describe, expect, it } from 'vitest';

import { schema, SCHEMA_VERSION } from '../index.js';

const expectedTopLevelKeys = [
  'schemaVersion',
  'profile',
  'links',
  'careers',
  'projects',
  'skills',
  'contact',
  'settings',
  'meta',
] as const;

const expectedDefs = [
  'Address',
  'Avatar',
  'Career',
  'Contact',
  'ContentLicense',
  'Email',
  'Iso3166Alpha2',
  'IsoDateTime',
  'Link',
  'LinkType',
  'LocaleTag',
  'LocalizedBody',
  'LocalizedTitle',
  'Meta',
  'Profile',
  'Project',
  'Settings',
  'Skill',
  'Slug',
  'Url',
  'YearMonth',
] as const;

describe('meport.schema.json structural shape', () => {
  it('declares JSON Schema 2020-12', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('embeds SCHEMA_VERSION in its $id', () => {
    expect(schema.$id).toContain(`/schemas/${SCHEMA_VERSION}/`);
  });

  it('requires every top-level field', () => {
    expect(schema.required).toEqual([...expectedTopLevelKeys]);
  });

  it('declares all expected top-level properties', () => {
    expect(Object.keys(schema.properties).sort()).toEqual([...expectedTopLevelKeys].sort());
  });

  it('locks down the root object (additionalProperties: false)', () => {
    expect(schema.additionalProperties).toBe(false);
  });

  it('declares the canonical $defs entries', () => {
    const defs = Object.keys(schema.$defs).sort();
    expect(defs).toEqual(expect.arrayContaining([...expectedDefs]));
  });

  it('enforces Spec §6.13 array size limits', () => {
    expect(schema.properties.links.maxItems).toBe(100);
    expect(schema.properties.careers.maxItems).toBe(50);
    expect(schema.properties.projects.maxItems).toBe(100);
    expect(schema.properties.skills.maxItems).toBe(200);
  });

  it('enumerates every known link type', () => {
    expect(schema.$defs.LinkType.enum).toEqual([
      'website',
      'blog',
      'github',
      'gitlab',
      'linkedin',
      'x',
      'mastodon',
      'bluesky',
      'instagram',
      'youtube',
      'threads',
      'facebook',
      'email',
      'rss',
      'custom',
    ]);
  });

  it('keeps ContentLicense closed (no default, explicit choice required)', () => {
    expect(schema.$defs.ContentLicense.additionalProperties).toBe(false);
    expect(schema.$defs.ContentLicense.required).toContain('spdxId');
    // Spec §19.1: contentLicense has no implicit default — the profile owner
    // must choose one. JSON Schema `default` keyword must therefore be absent.
    expect(schema.$defs.ContentLicense).not.toHaveProperty('default');
  });

  it('keeps Link variants closed and requires iconUrl on type=custom', () => {
    expect(schema.$defs.Link.additionalProperties).toBe(false);
    const customRule = schema.$defs.Link.allOf[0];
    if (!customRule) throw new Error('Link.allOf[0] is missing');
    expect(customRule.if.properties.type.const).toBe('custom');
    expect(customRule.then.required).toContain('iconUrl');
  });

  it('keeps structural object types open for forward-compatible extensions', () => {
    expect(schema.$defs.Profile.additionalProperties).toBe(true);
    expect(schema.$defs.Settings.additionalProperties).toBe(true);
    expect(schema.$defs.Meta.additionalProperties).toBe(true);
    expect(schema.$defs.Career.additionalProperties).toBe(true);
    expect(schema.$defs.Project.additionalProperties).toBe(true);
  });
});
