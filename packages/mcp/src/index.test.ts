import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  applyPublicPrivacyFilter,
  generateJsonLd,
  MCP_PROFILE_SECTIONS,
  normalize,
  resolveLocale,
  schema,
  validate,
  type Takuhon,
} from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import exampleJson from '../../../examples/personal-profile/takuhon.json' with { type: 'json' };

import { createTakuhonMcpServer } from './index.js';

/** The validated example fixture used as the loaded profile. */
function fixture(): Takuhon {
  const result = validate(exampleJson);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return result.data;
}

/** Parse the single text content block of a tool/resource result as JSON. */
function jsonOf(text: string): unknown {
  return JSON.parse(text);
}

describe('createTakuhonMcpServer()', () => {
  let client: Client;
  let loaded: Takuhon;

  beforeEach(async () => {
    loaded = fixture();
    const server = createTakuhonMcpServer({
      loadProfile: () => loaded,
      name: 'takuhon-test',
      version: '1.2.3',
    });
    client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it('lists the four read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_jsonld',
      'get_profile',
      'get_section',
      'list_locales',
    ]);
  });

  it('lists the two resources', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(['takuhon://profile', 'takuhon://schema']);
  });

  it('get_profile returns the locale-resolved, privacy-filtered profile', async () => {
    const result = await client.callTool({ name: 'get_profile', arguments: { lang: 'en' } });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const expected = applyPublicPrivacyFilter(resolveLocale(normalize(loaded), 'en'));
    expect(jsonOf(content[0]!.text)).toEqual(expected);
  });

  it('get_section returns a single section', async () => {
    const result = await client.callTool({
      name: 'get_section',
      arguments: { section: 'careers', lang: 'en' },
    });
    const content = result.content as { text: string }[];
    const expected = applyPublicPrivacyFilter(resolveLocale(normalize(loaded), 'en')).careers;
    expect(jsonOf(content[0]!.text)).toEqual(expected);
  });

  it('get_jsonld matches generateJsonLd on the public view', async () => {
    const result = await client.callTool({ name: 'get_jsonld', arguments: { lang: 'en' } });
    const content = result.content as { text: string }[];
    const expected = generateJsonLd(
      applyPublicPrivacyFilter(resolveLocale(normalize(loaded), 'en')),
    );
    expect(jsonOf(content[0]!.text)).toEqual(expected);
  });

  it('list_locales reports the available locales', async () => {
    const result = await client.callTool({ name: 'list_locales', arguments: {} });
    const content = result.content as { text: string }[];
    expect(jsonOf(content[0]!.text)).toMatchObject({
      defaultLocale: loaded.settings.defaultLocale,
      availableLocales: loaded.settings.availableLocales,
    });
  });

  it('rejects an out-of-enum section via the input schema', async () => {
    const result = await client.callTool({
      name: 'get_section',
      arguments: { section: 'settings' },
    });
    // Schema validation fails → the SDK returns an error tool result, so the
    // pure executor's own guard is never reached for malformed input.
    expect(result.isError).toBe(true);
  });

  it('reads the canonical profile resource (privacy-filtered)', async () => {
    const result = await client.readResource({ uri: 'takuhon://profile' });
    const content = result.contents[0] as { mimeType: string; text: string };
    expect(content.mimeType).toBe('application/json');
    expect(jsonOf(content.text)).toEqual(applyPublicPrivacyFilter(loaded));
  });

  it('reads the JSON Schema resource', async () => {
    const result = await client.readResource({ uri: 'takuhon://schema' });
    const content = result.contents[0] as { text: string };
    expect(jsonOf(content.text)).toEqual(schema);
  });

  it('surfaces a profile-load failure as a tool error result', async () => {
    const server = createTakuhonMcpServer({
      loadProfile: () => {
        throw new Error('storage offline');
      },
    });
    const failing = new Client({ name: 'test-client', version: '0.0.0' });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(s), failing.connect(c)]);
    const result = await failing.callTool({ name: 'get_profile', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as { text: string }[];
    expect(content[0]!.text).toContain('storage offline');
    await failing.close();
  });

  it('every catalog section is reachable via get_section', async () => {
    for (const section of MCP_PROFILE_SECTIONS) {
      const result = await client.callTool({ name: 'get_section', arguments: { section } });
      expect(result.isError).toBeFalsy();
    }
  });
});
