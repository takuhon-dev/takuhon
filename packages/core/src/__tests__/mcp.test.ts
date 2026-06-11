import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import {
  applyPublicPrivacyFilter,
  executeMcpTool,
  generateJsonLd,
  MCP_PROFILE_SECTIONS,
  MCP_RESOURCES,
  MCP_TOOLS,
  McpRequestError,
  normalize,
  readMcpResource,
  resolveLocale,
  schema,
  validate,
} from '../index.js';
import type { Takuhon } from '../index.js';

/** The validated example fixture, the raw `Takuhon` the executors take. */
function fixture(): Takuhon {
  const result = validate(exampleJson);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return result.data;
}

/** A minimal profile that hides its email and exposes one credential id. */
function privacyFixture(): Takuhon {
  const result = validate({
    schemaVersion: '0.5.0',
    profile: { displayName: { en: 'Solo Dev' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    certifications: [
      {
        id: 'c1',
        title: { en: 'Cert' },
        issuingOrganization: { en: 'Org' },
        issueDate: '2020-01',
        credentialId: 'SECRET-123',
      },
    ],
    contact: { email: 'hide@example.com' },
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  });
  if (!result.ok) throw new Error(`privacy fixture invalid: ${JSON.stringify(result.errors)}`);
  return result.data;
}

describe('MCP catalog', () => {
  it('exposes the four read-only tools', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'get_profile',
      'get_section',
      'get_jsonld',
      'list_locales',
    ]);
  });

  it('exposes the profile and schema resources', () => {
    expect(MCP_RESOURCES.map((r) => r.uri)).toEqual(['takuhon://profile', 'takuhon://schema']);
    for (const r of MCP_RESOURCES) expect(r.mimeType).toBe('application/json');
  });

  it('every tool declares an object input schema', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });

  it('get_section enumerates exactly the supported sections', () => {
    const getSection = MCP_TOOLS.find((t) => t.name === 'get_section');
    const props = getSection?.inputSchema.properties as { section: { enum: string[] } };
    expect(props.section.enum).toEqual([...MCP_PROFILE_SECTIONS]);
  });
});

describe('executeMcpTool()', () => {
  it('get_profile returns the locale-resolved, privacy-filtered profile', () => {
    const profile = fixture();
    const result = executeMcpTool('get_profile', { lang: 'en' }, profile);
    const expected = applyPublicPrivacyFilter(resolveLocale(normalize(profile), 'en'));
    expect(result.resolvedLocale).toBe('en');
    expect(result.data).toEqual(expected);
  });

  it('get_profile falls back to the default locale when lang is omitted', () => {
    const result = executeMcpTool('get_profile', {}, fixture());
    expect(typeof result.resolvedLocale).toBe('string');
    expect(result.resolvedLocale).not.toBe('');
  });

  it('get_section returns a single section matching get_profile', () => {
    const profile = fixture();
    const whole = executeMcpTool('get_profile', { lang: 'en' }, profile).data as Record<
      string,
      unknown
    >;
    for (const section of MCP_PROFILE_SECTIONS) {
      const result = executeMcpTool('get_section', { section, lang: 'en' }, profile);
      expect(result.data).toEqual(whole[section]);
      expect(result.resolvedLocale).toBe('en');
    }
  });

  it('get_jsonld matches generateJsonLd on the public view', () => {
    const profile = fixture();
    const result = executeMcpTool('get_jsonld', { lang: 'en' }, profile);
    const expected = generateJsonLd(
      applyPublicPrivacyFilter(resolveLocale(normalize(profile), 'en')),
    );
    expect(result.data).toEqual(expected);
  });

  it('list_locales reports the default and available locales', () => {
    const result = executeMcpTool('list_locales', {}, fixture());
    expect(result.data).toMatchObject({
      defaultLocale: expect.any(String),
      availableLocales: expect.any(Array),
    });
    expect(result.resolvedLocale).toBeUndefined();
  });

  it('applies the public privacy filter (hides email, strips credential ids)', () => {
    const result = executeMcpTool('get_profile', { lang: 'en' }, privacyFixture()).data as {
      contact: { email?: string };
      certifications: { credentialId?: string }[];
    };
    expect(result.contact.email).toBeUndefined();
    expect(result.certifications[0]?.credentialId).toBeUndefined();
  });

  it('throws McpRequestError for an unknown tool', () => {
    expect(() => executeMcpTool('delete_profile', {}, fixture())).toThrow(McpRequestError);
  });

  it('throws McpRequestError for an invalid section', () => {
    expect(() => executeMcpTool('get_section', { section: 'settings' }, fixture())).toThrow(
      McpRequestError,
    );
  });

  it('throws McpRequestError for a non-string lang', () => {
    expect(() => executeMcpTool('get_profile', { lang: 42 }, fixture())).toThrow(McpRequestError);
  });

  it('is read-only: the input document is never mutated', () => {
    const profile = fixture();
    const before = JSON.stringify(profile);
    executeMcpTool('get_profile', { lang: 'ja' }, profile);
    executeMcpTool('get_jsonld', {}, profile);
    expect(JSON.stringify(profile)).toBe(before);
  });
});

describe('readMcpResource()', () => {
  it('takuhon://profile returns the privacy-filtered canonical document', () => {
    const profile = privacyFixture();
    const result = readMcpResource('takuhon://profile', profile);
    expect(result.uri).toBe('takuhon://profile');
    expect(result.mimeType).toBe('application/json');
    expect(result.data).toEqual(applyPublicPrivacyFilter(profile));
    expect((result.data as { contact: { email?: string } }).contact.email).toBeUndefined();
  });

  it('takuhon://schema returns the JSON Schema contract', () => {
    const result = readMcpResource('takuhon://schema', fixture());
    expect(result.mimeType).toBe('application/json');
    expect(result.data).toBe(schema);
  });

  it('throws McpRequestError for an unknown resource', () => {
    expect(() => readMcpResource('takuhon://secrets', fixture())).toThrow(McpRequestError);
  });
});
