# @takuhon/ui

React mobile-first profile UI components for Takuhon.

## Installation

```sh
pnpm add @takuhon/ui @takuhon/core react react-dom
# or
npm install @takuhon/ui @takuhon/core react react-dom
```

`@takuhon/ui` is an ESM-only package targeting React 19+. It treats `react` and `react-dom` as `peerDependencies`, so the consumer installs them.

## Usage

The components are pure — they read a single `LocalizedTakuhon` (or one of its sub-types) and render. State, persistence, and locale switching are out of scope for the components themselves; resolve the input first with `@takuhon/core`.

```tsx
import { resolveLocale, validate } from '@takuhon/core';
import { TakuhonProfile } from '@takuhon/ui';

const result = validate(rawJson);
if (!result.ok) throw new Error('invalid takuhon.json');

const data = resolveLocale(result.data, 'en');

export function App() {
  return <TakuhonProfile data={data} />;
}
```

## Exported components

| Component        | Input                              | Notes                                                                                                                                              |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TakuhonProfile` | `{ data: LocalizedTakuhon }`       | Root container; renders all sub-sections; hides `<Footer />` when `settings.showPoweredBy === false`                                               |
| `ProfileHeader`  | `{ profile: LocalizedProfile }`    | Avatar + displayName + tagline + location + bio                                                                                                    |
| `LinksList`      | `{ links: LocalizedLink[] }`       | Vertical card list; featured entries first, then by `order`                                                                                        |
| `CareerTimeline` | `{ careers: LocalizedCareer[] }`   | Timeline with `YYYY-MM – Present` for current positions                                                                                            |
| `ProjectsList`   | `{ projects: LocalizedProject[] }` | Highlighted entries first; project tags shown as a labelled sub-list                                                                               |
| `SkillsList`     | `{ skills: Skill[] }`              | Grouped by `category` (falls back to `other`)                                                                                                      |
| `ContactInfo`    | `{ contact: Contact }`             | `email` is shown as `mailto:` only when `showEmail === true`; section is omitted when both `email` (gated by `showEmail`) and `formUrl` are absent |
| `Footer`         | —                                  | "Powered by Takuhon" attribution                                                                                                                   |

## Styling

Each component ships a co-located `*.module.css` file. The build emits these files into `dist/` as plain CSS (no hashing) — your bundler is expected to apply the CSS Modules transform and produce final class names. Vite, Next.js, and Remix do this out of the box. A baseline design-token sheet (`src/styles/tokens.css`) ships alongside; it is automatically pulled in by `TakuhonProfile` and sets the `--takuhon-color-*`, `--takuhon-space-*`, and `--takuhon-tap-target` custom properties, with `prefers-color-scheme: dark` and `prefers-reduced-motion: reduce` media queries built in.

## What this package does **not** do (yet)

- Locale switching UI and persistence (cookie / LocalStorage) — call `resolveLocale()` again with the new tag and re-render
- HTML `<head>` control (JSON-LD, `hreflang`, `<html lang>`, OpenGraph, canonical) — produced from `generateJsonLd()` in `@takuhon/core`
- Theme overrides driven from `settings.theme` — currently the design tokens are static
- Built-in a11y audits (axe-core) and end-to-end accessibility tests

These land in subsequent Phase 2 sub-phases.

## License

[Apache-2.0](./LICENSE).
