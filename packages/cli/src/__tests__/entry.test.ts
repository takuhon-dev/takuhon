import { describe, expect, it } from 'vitest';

/**
 * Importing the entry module must be side-effect-free: `process.exit` is
 * confined to `run()` behind an entry-point guard. If the guard regressed and
 * the module exited on import, this test file (and the whole run) would die.
 */
describe('@takuhon/cli entry', () => {
  it('is import-safe and exposes run()', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.run).toBe('function');
  });
});
