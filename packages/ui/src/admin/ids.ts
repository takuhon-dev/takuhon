/**
 * Build a unique slug like `link-1` that is not already in `taken`. The prefix
 * is lowercased and stripped to `[a-z0-9-]` (falling back to `item`) so the
 * result always matches the `Slug` pattern `^[a-z0-9][a-z0-9-]*$`.
 * Deterministic given the existing ids, so it needs no random source.
 */
export function makeId(prefix: string, taken: Iterable<string>): string {
  const safe = prefix.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'item';
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${safe}-${String(n)}`)) n += 1;
  return `${safe}-${String(n)}`;
}
