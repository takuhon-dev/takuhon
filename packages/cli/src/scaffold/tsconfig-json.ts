/**
 * Generator for the scaffolded project's `tsconfig.json`.
 *
 * Minimal configuration that makes the generated `src/index.ts` typecheck
 * with `tsc --noEmit` in a freshly scaffolded directory. The settings
 * mirror the upstream takuhon monorepo defaults (ES2022 target, ESNext
 * modules, strict mode, `noUncheckedIndexedAccess`) and explicitly enable
 * the two flags the Worker entry depends on:
 *
 * - `resolveJsonModule` — so `import takuhonJson from '../takuhon.json'`
 *   resolves at type-check time.
 * - `moduleResolution: "Bundler"` — so the Wrangler / esbuild-style
 *   resolution (no need for explicit file extensions) is the source of
 *   truth that matches what `wrangler dev` actually runs.
 *
 * `noEmit: true` keeps `tsc` purely a type-checker; Wrangler's bundler
 * produces the deployable artifact.
 */

export function renderTsconfigJson(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules'],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
