/**
 * MCP (Model Context Protocol) projection of a profile.
 *
 * This module describes how a takuhon profile is exposed to an AI agent as a
 * set of read-only MCP tools and resources, and how each one is answered from a
 * profile document — *without* committing to a transport (stdio / HTTP) or to
 * any MCP SDK.
 *
 * The split mirrors the rest of core: deciding *what* to expose and *what it
 * returns* is a pure, deterministic projection over the canonical document
 * (exactly like {@link generateJsonLd}), so it lives here in `@takuhon/core` and
 * stays runtime-free (spec §2.3). The transport, JSON-RPC framing, and server
 * lifecycle are runtime-aware; they live in `@takuhon/mcp` and the CLI /
 * Cloudflare adapters, which call the pure executors below.
 *
 * Everything here is read-only. No tool or resource touches the admin surface,
 * and every answer passes through {@link applyPublicPrivacyFilter}, so an MCP
 * client sees exactly what `GET /api/profile`, `GET /api/jsonld`, `GET
 * /api/schema`, and `GET /takuhon.json` already expose — no more.
 *
 * The catalog ({@link MCP_TOOLS} / {@link MCP_RESOURCES}) is plain data with no
 * SDK dependency, so the `@takuhon/mcp` wiring can register it against the
 * official `@modelcontextprotocol/sdk` and later be swapped to a hand-rolled
 * dispatcher without touching this file.
 */

import { generateJsonLd } from './jsonld.js';
import { normalize } from './normalize.js';
import { applyPublicPrivacyFilter } from './privacy-filter.js';
import { resolveLocale } from './resolve-locale.js';
import { schema } from './schema.js';
import type { LocalizedTakuhon, Takuhon } from './types.js';

/**
 * Profile sections a `get_section` call may request: the content-bearing keys
 * of a locale-resolved profile (the spec §6 data sections). `settings`,
 * `meta`, `schemaVersion`, and `resolvedLocale` are intentionally excluded —
 * they are configuration / bookkeeping, not profile content an agent reads.
 */
export const MCP_PROFILE_SECTIONS = [
  'profile',
  'links',
  'careers',
  'projects',
  'skills',
  'certifications',
  'memberships',
  'volunteering',
  'honors',
  'education',
  'publications',
  'languages',
  'courses',
  'patents',
  'testScores',
  'recommendations',
  'contact',
] as const;

/** One of the {@link MCP_PROFILE_SECTIONS} a `get_section` call accepts. */
export type McpProfileSection = (typeof MCP_PROFILE_SECTIONS)[number];

/** A JSON Schema (draft 2020-12) object describing a tool's input arguments. */
export type McpInputSchema = Readonly<Record<string, unknown>>;

/** A read-only MCP tool definition — plain data, no SDK dependency. */
export interface McpToolDefinition {
  /** Stable tool id used in `tools/call`. */
  name: string;
  /** Human-readable title for display. */
  title: string;
  /** What the tool returns; shown to the agent when it chooses a tool. */
  description: string;
  /** JSON Schema for the tool's `arguments` object. */
  inputSchema: McpInputSchema;
}

/** A read-only MCP resource definition — plain data, no SDK dependency. */
export interface McpResourceDefinition {
  /** Stable resource URI used in `resources/read`. */
  uri: string;
  name: string;
  title: string;
  description: string;
  /** MIME type of the resource contents. */
  mimeType: string;
}

/** Result of {@link executeMcpTool}: the structured value the tool produced. */
export interface McpToolResult {
  /**
   * The JSON value the tool produced — already normalized, locale-resolved, and
   * privacy-filtered. The transport layer serializes this to MCP wire content.
   */
  data: unknown;
  /** Locale the result was resolved at, when the tool resolved one. */
  resolvedLocale?: string;
}

/** Result of {@link readMcpResource}: one resource's contents. */
export interface McpResourceResult {
  uri: string;
  mimeType: string;
  /** The JSON value of the resource. The transport layer serializes it. */
  data: unknown;
}

/**
 * Thrown by {@link executeMcpTool} / {@link readMcpResource} for an unknown
 * tool/resource name or invalid arguments. The transport layer maps it to the
 * appropriate MCP error (a JSON-RPC error for a malformed request, or an
 * `isError` tool result for a bad argument) — core stays transport-agnostic.
 */
export class McpRequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'McpRequestError';
  }
}

/** Shared `lang` argument schema — every locale-aware tool accepts it. */
const LANG_PROPERTY: McpInputSchema = {
  type: 'string',
  description:
    'BCP-47 locale tag (e.g. "ja", "en"). Resolves to the requested locale, ' +
    'falling back to the profile default when omitted or unavailable.',
};

/** The read-only tools an MCP client may call against the profile. */
export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'get_profile',
    title: 'Get profile',
    description:
      "Return the owner's full public profile, resolved to one locale and " +
      'privacy-filtered (identical to the public `GET /api/profile`).',
    inputSchema: {
      type: 'object',
      properties: { lang: LANG_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    name: 'get_section',
    title: 'Get profile section',
    description:
      'Return a single section of the public profile (e.g. careers, education, ' +
      'skills), resolved to one locale and privacy-filtered.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: [...MCP_PROFILE_SECTIONS],
          description: 'Which profile section to return.',
        },
        lang: LANG_PROPERTY,
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_jsonld',
    title: 'Get JSON-LD',
    description:
      'Return the Schema.org JSON-LD (a `ProfilePage` wrapping a `Person`) for ' +
      'the profile, resolved to one locale (identical to `GET /api/jsonld`).',
    inputSchema: {
      type: 'object',
      properties: { lang: LANG_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    name: 'list_locales',
    title: 'List locales',
    description:
      'List the locales this profile is available in, plus the default — useful ' +
      'before calling another tool with a `lang` argument.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/** The read-only resources an MCP client may read. */
export const MCP_RESOURCES: readonly McpResourceDefinition[] = [
  {
    uri: 'takuhon://profile',
    name: 'profile',
    title: 'Canonical profile (takuhon.json)',
    description:
      'The full canonical takuhon.json, privacy-filtered, with every locale ' +
      'retained (identical to `GET /takuhon.json`).',
    mimeType: 'application/json',
  },
  {
    uri: 'takuhon://schema',
    name: 'schema',
    title: 'Takuhon JSON Schema',
    description:
      'The public JSON Schema contract the profile conforms to (identical to ' +
      '`GET /api/schema`). Lets an agent understand the document shape.',
    mimeType: 'application/json',
  },
];

/**
 * Execute a read-only MCP tool against a profile document.
 *
 * `profile` is the raw validated {@link Takuhon} (the transport layer loaded it
 * from KV / a file). Locale-aware tools normalize, locale-resolve, and
 * privacy-filter it exactly as `GET /api/profile` does, then project the
 * requested view. Pure and deterministic — no clock, no randomness, no I/O.
 *
 * @throws {McpRequestError} for an unknown tool name or invalid arguments.
 */
export function executeMcpTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  profile: Takuhon,
): McpToolResult {
  switch (name) {
    case 'get_profile': {
      const localized = publicView(profile, readLang(args));
      return { data: localized, resolvedLocale: localized.resolvedLocale };
    }
    case 'get_section': {
      const section = readSection(args);
      const localized = publicView(profile, readLang(args));
      return { data: localized[section], resolvedLocale: localized.resolvedLocale };
    }
    case 'get_jsonld': {
      const localized = publicView(profile, readLang(args));
      return { data: generateJsonLd(localized), resolvedLocale: localized.resolvedLocale };
    }
    case 'list_locales':
      return {
        data: {
          defaultLocale: profile.settings.defaultLocale,
          availableLocales: profile.settings.availableLocales,
          ...(profile.settings.fallbackLocale !== undefined
            ? { fallbackLocale: profile.settings.fallbackLocale }
            : {}),
        },
      };
    default:
      throw new McpRequestError(`Unknown MCP tool: ${name}`);
  }
}

/**
 * Read a read-only MCP resource from a profile document. Pure and
 * deterministic.
 *
 * @throws {McpRequestError} for an unknown resource URI.
 */
export function readMcpResource(uri: string, profile: Takuhon): McpResourceResult {
  switch (uri) {
    case 'takuhon://profile':
      // Canonical document, privacy-filtered, every locale retained — the
      // `GET /takuhon.json` projection (no locale resolution, matching that
      // route, which filters the stored document as-is).
      return {
        uri,
        mimeType: 'application/json',
        data: applyPublicPrivacyFilter(profile),
      };
    case 'takuhon://schema':
      // The public contract; independent of the profile contents.
      return { uri, mimeType: 'application/json', data: schema };
    default:
      throw new McpRequestError(`Unknown MCP resource: ${uri}`);
  }
}

/** Normalize → resolve a locale → privacy-filter, exactly as `GET /api/profile`. */
function publicView(profile: Takuhon, lang: string | undefined): LocalizedTakuhon {
  return applyPublicPrivacyFilter(resolveLocale(normalize(profile), lang));
}

/** Read and validate the optional `lang` argument shared by locale-aware tools. */
function readLang(args: Readonly<Record<string, unknown>>): string | undefined {
  const lang = args.lang;
  if (lang === undefined) return undefined;
  if (typeof lang !== 'string') {
    throw new McpRequestError('`lang` must be a string (a BCP-47 locale tag).');
  }
  return lang;
}

/** Read and validate the required `section` argument of `get_section`. */
function readSection(args: Readonly<Record<string, unknown>>): McpProfileSection {
  const section = args.section;
  if (typeof section !== 'string' || !isProfileSection(section)) {
    throw new McpRequestError(`\`section\` must be one of: ${MCP_PROFILE_SECTIONS.join(', ')}.`);
  }
  return section;
}

function isProfileSection(value: string): value is McpProfileSection {
  return (MCP_PROFILE_SECTIONS as readonly string[]).includes(value);
}
