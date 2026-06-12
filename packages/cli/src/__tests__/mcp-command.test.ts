import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { applyPublicPrivacyFilter, normalize, resolveLocale, validate } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadMcpProfile, runMcp } from '../mcp-command.js';

/** A valid multi-locale (en + ja) 0.5.0 profile. */
function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '0.5.0',
    profile: {
      displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' },
      tagline: { en: 'Maintainer', ja: 'メンテナ' },
    },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
}

/** Capture stdout/stderr so `runMcp` can be exercised without a real TTY. */
function capture(): {
  out: string[];
  err: string[];
  deps: { stdout: (s: string) => void; stderr: (s: string) => void };
} {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

let dir: string;
let profilePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'takuhon-mcp-'));
  profilePath = join(dir, 'takuhon.json');
  writeFileSync(profilePath, JSON.stringify(fixture()), 'utf8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadMcpProfile()', () => {
  it('reads and validates a profile', () => {
    expect(loadMcpProfile(profilePath).profile.displayName.en).toBe('Pat Rivera');
  });

  it('throws "cannot read" for a missing file', () => {
    expect(() => loadMcpProfile(join(dir, 'nope.json'))).toThrow(/cannot read/);
  });

  it('throws "not valid JSON" for malformed JSON', () => {
    writeFileSync(profilePath, '{ not json', 'utf8');
    expect(() => loadMcpProfile(profilePath)).toThrow(/not valid JSON/);
  });

  it('throws "not a valid takuhon profile" for a schema-invalid document', () => {
    writeFileSync(profilePath, JSON.stringify({ schemaVersion: '0.5.0' }), 'utf8');
    expect(() => loadMcpProfile(profilePath)).toThrow(/not a valid takuhon profile/);
  });
});

describe('runMcp() startup', () => {
  it('prints usage for --help and exits 0', async () => {
    const { out } = capture();
    const code = await runMcp(['--help'], { stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out.join('')).toContain('Usage: takuhon mcp');
  });

  it('rejects an unknown option', async () => {
    const { err, deps } = capture();
    const code = await runMcp(['--bogus'], deps);
    expect(code).toBe(2);
    expect(err.join('')).toContain('unknown option');
  });

  it('rejects more than one path argument', async () => {
    const { err, deps } = capture();
    const code = await runMcp(['a.json', 'b.json'], deps);
    expect(code).toBe(2);
    expect(err.join('')).toContain('at most one path');
  });

  it('fails fast when the file is missing', async () => {
    const { err, deps } = capture();
    const code = await runMcp([join(dir, 'missing.json')], deps);
    expect(code).toBe(2);
    expect(err.join('')).toContain('cannot read');
  });

  it('fails fast when the file is invalid', async () => {
    writeFileSync(profilePath, JSON.stringify({ schemaVersion: '0.5.0' }), 'utf8');
    const { err, deps } = capture();
    const code = await runMcp([profilePath], deps);
    expect(code).toBe(2);
    expect(err.join('')).toContain('not a valid takuhon profile');
  });
});

describe('runMcp() serving', () => {
  it('serves the local profile to an MCP client and ends on disconnect', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const { err } = capture();
    const run = runMcp([profilePath], {
      stderr: (s) => err.push(s),
      createTransport: () => serverTransport,
    });

    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_jsonld',
      'get_profile',
      'get_section',
      'list_locales',
    ]);

    const result = await client.callTool({ name: 'get_profile', arguments: { lang: 'ja' } });
    const content = result.content as { text: string }[];
    const loaded = validate(fixture());
    if (!loaded.ok) throw new Error('fixture invalid');
    const expected = applyPublicPrivacyFilter(resolveLocale(normalize(loaded.data), 'ja'));
    expect(JSON.parse(content[0]!.text)).toEqual(expected);

    // Disconnecting the client closes the transport, which ends the server run.
    await client.close();
    expect(await run).toBe(0);
  });

  it('reflects edits to the file between requests', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const run = runMcp([profilePath], {
      stderr: () => undefined,
      createTransport: () => serverTransport,
    });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);

    const before = await client.callTool({ name: 'get_profile', arguments: { lang: 'en' } });
    expect(JSON.parse((before.content as { text: string }[])[0]!.text).profile.displayName).toBe(
      'Pat Rivera',
    );

    writeFileSync(
      profilePath,
      JSON.stringify(fixture({ profile: { displayName: { en: 'New Name' } } })),
      'utf8',
    );

    const after = await client.callTool({ name: 'get_profile', arguments: { lang: 'en' } });
    expect(JSON.parse((after.content as { text: string }[])[0]!.text).profile.displayName).toBe(
      'New Name',
    );

    await client.close();
    expect(await run).toBe(0);
  });
});
