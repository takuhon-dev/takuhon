/**
 * Generator for the `takuhon.json` file written into a freshly scaffolded
 * project.
 *
 * The template is a copy of `examples/minimal-profile/takuhon.json` from the
 * monorepo. It is inlined here as a TypeScript constant rather than imported
 * from `examples/` so the published `@takuhon/cli` npm package does not need
 * to ship the examples directory.
 *
 * Only `meta.contentLicense` is rewritten per the user's choice; everything
 * else is the canonical minimal profile (one career, one project, three
 * skills, `en` locale only) that downstream `@takuhon/core` validation
 * already accepts (see `packages/core/src/__tests__/examples-fixtures.test.ts`).
 */

import type { ContentLicenseFragment } from '../licenses.js';

/**
 * Build the `takuhon.json` payload as a deterministic, schema-valid object.
 * `meta.contentLicense` is filled from the supplied fragment so each
 * generated project carries the user's chosen SPDX identifier (and `url` /
 * `rights` where applicable).
 */
export function buildTakuhonJson(license: ContentLicenseFragment): unknown {
  return {
    schemaVersion: '1.1.0',
    profile: {
      displayName: {
        en: 'Sam Lee',
      },
    },
    links: [
      {
        id: 'github',
        type: 'github',
        url: 'https://example.com/github/sam-lee',
        featured: true,
      },
    ],
    careers: [
      {
        id: 'first-job',
        organization: {
          en: 'Example Co.',
        },
        role: {
          en: 'Junior Software Engineer',
        },
        startDate: '2026-04',
        endDate: null,
        isCurrent: true,
      },
    ],
    projects: [
      {
        id: 'personal-homepage',
        title: {
          en: 'Personal homepage',
        },
      },
    ],
    skills: [
      { id: 'html', label: 'HTML' },
      { id: 'css', label: 'CSS' },
      { id: 'javascript', label: 'JavaScript' },
    ],
    contact: {},
    settings: {
      defaultLocale: 'en',
      availableLocales: ['en'],
    },
    meta: {
      contentLicense: { ...license },
    },
  };
}

/** Serialise to a UTF-8 string with trailing newline (POSIX-friendly). */
export function renderTakuhonJson(license: ContentLicenseFragment): string {
  return `${JSON.stringify(buildTakuhonJson(license), null, 2)}\n`;
}
