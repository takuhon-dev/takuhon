# @takuhon/vercel

Read-only [Vercel](https://vercel.com/) adapter for [takuhon](https://github.com/takuhon-dev/takuhon).

It publishes a profile on Vercel by mounting the framework-agnostic public app
from [`@takuhon/api`](https://www.npmjs.com/package/@takuhon/api) on the Vercel
runtime: the server-rendered profile page (with embedded Schema.org JSON-LD),
the public read API, and the canonical `takuhon.json`. There is **no database,
admin UI, or auth** — you edit `takuhon.json` in Git, push, and Vercel
redeploys.

## What it serves

- `GET /` and `GET /<locale>/` — the server-rendered profile page with JSON-LD
- `GET /api/profile` · `GET /api/jsonld` · `GET /api/schema`
- `GET /takuhon.json` · `GET /.well-known/takuhon.json`
- `GET /health`

The same public privacy filter as every other surface is applied, so
`settings.publicVisibility` and the field-level controls behave identically to a
Cloudflare deployment.

### Not included (use the Cloudflare adapter for these)

Image uploads (`/assets/*`), the MCP endpoint (`/mcp`), and the activity badge /
sync (`/activity.svg`, cron) are Cloudflare-only. On Vercel, `GET /api/activity`
answers `404` and the discovery document omits `mcp`.

## Install

```bash
npm install @takuhon/vercel
```

## Quick start (Next.js App Router)

Add a catch-all route that mounts the app, and bundle your `takuhon.json`:

```ts
// app/[[...route]]/route.ts
import { createTakuhonVercelApp, BundledTakuhonStorage } from '@takuhon/vercel';
import { handle } from 'hono/vercel';
import profile from '../../takuhon.json';

const app = createTakuhonVercelApp({ storage: new BundledTakuhonStorage(profile) });

export const GET = handle(app);
```

```json
// vercel.json
{ "framework": "nextjs" }
```

That's it — `vercel deploy` publishes the profile. To change it, edit
`takuhon.json`, commit, and push.

## Data source

The canonical `takuhon.json` can come from two places:

- **Bundled (default).** Import the file and pass it to `BundledTakuhonStorage`,
  as above. The document is validated once at startup, so an invalid profile
  fails fast.
- **Fetched from a URL.** Set `TAKUHON_DATA_URL` and use `UrlTakuhonStorage`; the
  profile is fetched once per serverless instance and cached.

```ts
import { createTakuhonVercelApp, UrlTakuhonStorage } from '@takuhon/vercel';
import { handle } from 'hono/vercel';

const app = createTakuhonVercelApp({
  storage: new UrlTakuhonStorage(process.env.TAKUHON_DATA_URL!),
});

export const GET = handle(app);
```

## API

- `createTakuhonVercelApp({ storage, fallback? })` — returns a [Hono](https://hono.dev/)
  app to mount with `hono/vercel`'s `handle`.
- `BundledTakuhonStorage(profile)` — read-only storage over an in-memory profile.
- `UrlTakuhonStorage(url, { fetch? })` — read-only storage fetched once from `url`.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
