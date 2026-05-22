/**
 * Interactive prompt flow for `create-takuhon`, built on `@clack/prompts`.
 *
 * The flow follows planning doc license.md §2.3: a single-choice picker over
 * the four canonical options, with `Custom` opening a free-form SPDX text
 * input. Cancellation (Ctrl+C or pressing Esc on a clack prompt) returns a
 * sentinel result instead of throwing so the caller can exit cleanly with a
 * specific status code.
 */

import { cancel, isCancel, select, text } from '@clack/prompts';

import { LICENSE_OPTIONS, isValidSpdxInput } from './licenses.js';

/** Returned by {@link promptLicense} on successful completion. */
export interface PromptLicenseResult {
  /** SPDX identifier to write into `meta.contentLicense.spdxId`. */
  readonly spdxId: string;
}

/** Returned when the user cancels (Ctrl+C / Esc) instead of completing. */
export interface PromptCancelled {
  readonly cancelled: true;
}

const CUSTOM_SENTINEL = '__custom__';

/**
 * Run the license picker. Resolves to either the selected SPDX identifier or
 * a cancellation sentinel; never throws on user cancel.
 */
export async function promptLicense(): Promise<PromptLicenseResult | PromptCancelled> {
  const choice = await select<string>({
    message: 'Choose a license for your profile content:',
    options: [
      ...LICENSE_OPTIONS.map((opt) => ({
        value: opt.spdxId,
        label: opt.label,
        hint: opt.hint,
      })),
      { value: CUSTOM_SENTINEL, label: 'Custom', hint: 'enter SPDX identifier' },
    ],
  });

  if (isCancel(choice)) {
    cancel('Aborted.');
    return { cancelled: true };
  }

  if (choice !== CUSTOM_SENTINEL) {
    return { spdxId: choice };
  }

  const customRaw = await text({
    message: 'Enter the SPDX identifier:',
    placeholder: 'e.g. MIT, Apache-2.0, CC-BY-SA-4.0',
    validate(value): string | undefined {
      if (!isValidSpdxInput(value)) {
        return 'Must be a non-empty SPDX-like expression (alphanumerics, ., -, +, parentheses, spaces).';
      }
      return undefined;
    },
  });

  if (isCancel(customRaw)) {
    cancel('Aborted.');
    return { cancelled: true };
  }

  return { spdxId: customRaw.trim() };
}
