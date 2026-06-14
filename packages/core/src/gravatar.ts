/**
 * Build a Gravatar avatar URL from an email address.
 *
 * Gravatar derives an avatar from the SHA-256 hash of a normalized email
 * (trimmed + lower-cased), served at `https://gravatar.com/avatar/{hash}`. This
 * helper assembles that URL so a non-GitHub owner can set an avatar from just an
 * email — no upload required — alongside the existing "paste a URL" and "upload
 * an image" paths.
 *
 * It is a pure, deterministic transform (no IO, no time, no randomness), the
 * same style as the other core transforms. The email itself is never stored:
 * only the returned URL is meant to be saved into `profile.avatar.url`.
 */

import { sha256hex } from './sha256.js';

/** Options for {@link gravatarUrl}. Each maps to a Gravatar query parameter. */
export interface GravatarOptions {
  /** Pixel size, 1–2048 (`?s=`). */
  size?: number;
  /**
   * Default image when the email has no Gravatar (`?d=`): a keyword
   * (`mp` / `identicon` / `monsterid` / `wavatar` / `retro` / `robohash` /
   * `blank`), the literal `404`, or an image URL.
   */
  defaultImage?: string;
}

const GRAVATAR_AVATAR_BASE = 'https://gravatar.com/avatar/';

/**
 * Build the Gravatar avatar URL for `email`. The email is trimmed + lower-cased,
 * SHA-256 hashed, and assembled into `https://gravatar.com/avatar/{hash}` with
 * any {@link GravatarOptions} appended as query parameters.
 *
 * Pure and total: a blank or whitespace-only email still yields a deterministic
 * URL (callers guard against empty input). The result fits well within the
 * 2048-character limit on `avatar.url`.
 */
export function gravatarUrl(email: string, options?: GravatarOptions): string {
  const hash = sha256hex(new TextEncoder().encode(email.trim().toLowerCase()));

  const params = new URLSearchParams();
  if (options?.size !== undefined) params.set('s', String(options.size));
  if (options?.defaultImage !== undefined) params.set('d', options.defaultImage);

  const query = params.toString();
  return query ? `${GRAVATAR_AVATAR_BASE}${hash}?${query}` : `${GRAVATAR_AVATAR_BASE}${hash}`;
}
