/**
 * Content-license metadata and helpers for the `create-takuhon` scaffolding
 * flow.
 *
 * Authoritative spec lives in the planning repo at `docs/license.md`:
 *   - §2.2 lists the accepted `spdxId` values for `meta.contentLicense`.
 *   - §2.3 defines the interactive prompt offered by `create-takuhon`.
 *
 * `LICENSE_OPTIONS` mirrors §2.3 (four prompt rows; "Custom" is handled
 * separately by the prompt flow). `buildContentLicense` shapes the chosen
 * identifier into the `meta.contentLicense` fragment that lands in the
 * generated `takuhon.json`.
 */

/** A single row in the interactive license selector. */
export interface LicenseOption {
  /** Short label shown as the selectable label in the prompt. */
  readonly label: string;
  /** Longer hint shown next to the label (parenthesized in §2.3). */
  readonly hint: string;
  /** SPDX identifier written to `takuhon.json` `meta.contentLicense.spdxId`. */
  readonly spdxId: string;
  /** Canonical license URL. Omitted for `Proprietary`. */
  readonly url?: string;
}

/**
 * The four selectable options from planning doc §2.3. "Custom" is not in this
 * list because it triggers a free-form text prompt rather than mapping to a
 * fixed SPDX identifier here.
 */
export const LICENSE_OPTIONS: readonly LicenseOption[] = [
  {
    label: 'CC BY 4.0',
    hint: 'Allow reuse with attribution',
    spdxId: 'CC-BY-4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    label: 'CC BY-NC 4.0',
    hint: 'Non-commercial reuse with attribution',
    spdxId: 'CC-BY-NC-4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
  },
  {
    label: 'CC0',
    hint: 'Public domain',
    spdxId: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    label: 'Proprietary',
    hint: 'All rights reserved',
    spdxId: 'Proprietary',
  },
];

/**
 * Canonical URL lookup for SPDX identifiers we recognise but don't list in the
 * prompt (planning doc §2.2 table). Used by `buildContentLicense` so that a
 * user who passes `--license CC-BY-SA-4.0` (or selects it via `Custom`) still
 * gets a usable `url` field in the generated `takuhon.json`.
 */
const KNOWN_URL_BY_SPDX: Readonly<Record<string, string>> = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-ND-4.0': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC-BY-NC-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC-BY-NC-SA-4.0': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC-BY-NC-ND-4.0': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  MIT: 'https://opensource.org/licenses/MIT',
};

/** Shape written to `takuhon.json` under `meta.contentLicense`. */
export interface ContentLicenseFragment {
  readonly spdxId: string;
  readonly url?: string;
  readonly rights?: string;
}

/**
 * Translate a chosen SPDX identifier into the `meta.contentLicense` fragment
 * for `takuhon.json`.
 *
 * - `Proprietary` is given a `rights` sentinel and no `url` (planning doc §2.2).
 * - Known SPDX identifiers get a canonical `url`.
 * - Anything else is written as `{ spdxId }` only — the schema accepts
 *   arbitrary SPDX expressions, and UI rendering is best-effort (§2.2).
 */
export function buildContentLicense(spdxId: string): ContentLicenseFragment {
  if (spdxId === 'Proprietary') {
    return {
      spdxId: 'Proprietary',
      rights: 'All rights reserved. Contact owner for usage permission.',
    };
  }
  const url = KNOWN_URL_BY_SPDX[spdxId];
  if (url !== undefined) {
    return { spdxId, url };
  }
  return { spdxId };
}

/**
 * Light syntactic validation for a user-entered SPDX expression (the
 * `Custom` prompt branch and the `--license` flag).
 *
 * We accept any non-empty string composed of the characters that appear in
 * canonical SPDX identifiers and boolean expressions (alphanumerics, `.`,
 * `-`, `+`, parentheses, and literal spaces). Tabs and newlines are rejected
 * because real SPDX expressions never contain them. Full SPDX expression
 * parsing (`MIT OR (Apache-2.0 AND CC-BY-4.0)`) is intentionally out of
 * scope — we trust the user and let the JSON Schema's downstream validation
 * flag obvious problems.
 */
export function isValidSpdxInput(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return false;
  return /^[A-Za-z0-9.\-+() ]+$/.test(trimmed);
}
