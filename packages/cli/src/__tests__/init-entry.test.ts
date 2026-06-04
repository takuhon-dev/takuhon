import { describe, expect, it } from 'vitest';

/**
 * Importing the create-takuhon entry module must be side-effect-free:
 * `process.exit` (and the scaffolder) is confined to `run()` behind an
 * entry-point guard. If the guard regressed, importing this module would run
 * the scaffolder and exit the process, taking the whole test run down. The
 * `create-takuhon` redirect package depends on this exported `run`.
 */
describe('@takuhon/cli init entry', () => {
  it('is import-safe and exposes run()', async () => {
    const mod = await import('../init.js');
    expect(typeof mod.run).toBe('function');
  });
});
