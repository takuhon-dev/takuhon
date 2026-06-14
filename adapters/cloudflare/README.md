# @takuhon/cloudflare

Cloudflare Workers adapter for Takuhon. Wires the framework-agnostic Hono
handlers from `@takuhon/api` to a Workers KV-backed profile store, the colo-
local edge cache, and `console.log`-based audit logging.

## Routes

| Method   | Path                        | Source                                       |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/`                         | `@takuhon/api` `createPublicApp`             |
| `GET`    | `/api/profile`              | `@takuhon/api` `createPublicApp` (KV-backed) |
| `GET`    | `/api/schema`               | `@takuhon/api` `createPublicApp`             |
| `GET`    | `/api/jsonld`               | `@takuhon/api` `createPublicApp`             |
| `GET`    | `/takuhon.json`             | `@takuhon/api` `createPublicApp`             |
| `GET`    | `/.well-known/takuhon.json` | `@takuhon/api` `createPublicApp`             |
| `POST`   | `/mcp`                      | `@takuhon/mcp` (read-only, stateless)        |
| `GET`    | `/admin`                    | `@takuhon/api` `createAdminUiApp` (HTML)     |
| `PUT`    | `/api/admin/profile`        | `@takuhon/api` `createAdminApiApp`           |
| `DELETE` | `/api/admin/profile`        | `@takuhon/api` `createAdminApiApp`           |
| `POST`   | `/api/admin/assets`         | `@takuhon/api` `createAdminApiApp` (R2)\*    |
| `GET`    | `/assets/*`                 | R2 delivery proxy (this package)\*           |

\* Registered only when an R2 bucket is bound (see [Image uploads](#image-uploads-r2)).

`GET /` (and each available `/<locale>/`) returns the **server-rendered mobile profile page** — the same HTML `takuhon build` emits, with Schema.org JSON-LD embedded for crawlers — so a deployment serves a human-facing page and machine-readable structured data from the root, not just the JSON API. It is `Cache-Control: public, max-age=300` and is purged from the edge cache on every admin write.

`POST` / `PATCH` on admin paths returns `405 Method Not Allowed`. Schema
validation failures return `422 Unprocessable Entity` with an `errors[]`
list of JSON-Schema-style fragment pointers.

## Local development

```sh
pnpm install
pnpm --filter @takuhon/cloudflare dev   # wrangler dev
```

Visit `http://127.0.0.1:8787/`. The first request returns the bundled
onboarding fixture; the admin UI at `/admin` lets you replace it once you
provision an admin token (next section).

## Production deploy

### 1. Create the KV namespace

```sh
wrangler kv namespace create TAKUHON_KV
wrangler kv namespace create TAKUHON_KV --preview
```

Copy the printed ids into `wrangler.toml` (replace the
`REPLACE_WITH_*_NAMESPACE_ID` placeholders).

### 2. Provision the admin token

The admin bearer token must never live in `wrangler.toml` or source
control. Set it as a Wrangler secret:

```sh
# 32 bytes of entropy, base64-encoded (43 chars).
TOKEN=$(openssl rand -base64 32)
echo "$TOKEN" | wrangler secret put TAKUHON_ADMIN_TOKEN
```

Store `$TOKEN` securely (1Password, vault, etc.). Without it, every
`PUT/DELETE /api/admin/profile` returns `401 Unauthorized`.

#### Token rotation

```sh
# Generate a new token, push it as the new secret, then update any clients
# that hold the old one. There is no grace period — once the secret
# changes, requests bearing the old token are rejected.
echo "$NEW_TOKEN" | wrangler secret put TAKUHON_ADMIN_TOKEN
```

### 3. Pin the admin Origin allowlist (optional but recommended)

Edit `wrangler.toml` to set the origins that may issue browser-borne admin
writes:

```toml
[vars]
TAKUHON_ADMIN_ORIGIN = "https://admin.example.com,https://localhost:3000"
```

Empty value disables the check — acceptable when `/admin` is the only
admin UI surface and you trust same-origin requests. Requests without an
`Origin` header (curl, native clients) are always allowed; the bearer
token is the primary auth boundary.

### 4. Configure Rate Limiting Rules

`/api/admin/*` is **not** rate-limited in code. Apply a Cloudflare WAF rule
in the dashboard:

1. Open **Security → WAF → Rate limiting Rules**.
2. Add a rule matching `URI Path` starts with `/api/admin/`.
3. Set the characteristic to the `Authorization` header (so each token
   gets its own budget).
4. Limit: `10 requests per 1 minute`.
5. Action: `Block` with a custom JSON response body that mirrors RFC 7807
   `application/problem+json` (or simply `Block` with default 429).

### 5. Deploy

```sh
pnpm --filter @takuhon/cloudflare typecheck   # local TS check
wrangler deploy
```

## Operational notes

### Audit log retrieval

All admin auth attempts and profile mutations emit one line of JSON to
`console.log`. Tail them in real time:

```sh
wrangler tail
```

For long-term retention, configure **Workers → Logpush** to ship to R2,
S3, or a SIEM. Recommended retention: 90 days.

The actor identity in every event is `sha256:<hex>` over the presented
bearer token. The raw token never leaves the request boundary.

### Edge cache invalidation

After a successful admin write, the Worker calls `caches.default.delete`
for `/`, `/api/profile`, `/api/profile?lang=en|ja`, `/api/jsonld`,
`/api/jsonld?lang=en|ja`, and `/takuhon.json`. **This clears the current
colo's cache only**; other colos honour the response's `Cache-Control`
`s-maxage=300` (5 minutes) before refreshing.

If you need immediate global invalidation, hit the Cloudflare REST API
manually after a write (`POST /zones/{zone_id}/purge_cache`). Doing it
in-Worker requires a zone-scoped API token that we don't bundle by
default; expanding to multi-lang or a configurable lang list happens as
part of a later phase.

### Admin UI security

The `/admin` HTML editor runs under a tight CSP:

- `script-src 'self' 'nonce-<n>'` — no inline scripts without the
  per-request nonce; no `unsafe-inline`.
- `style-src 'self' 'nonce-<n>'` — same for styles.
- `require-trusted-types-for 'script'` — DOM-XSS sinks are blocked even
  if the nonce is leaked.
- `img-src 'self' blob:` — only same-origin or client-side previews.

The HTML is single-page, no build step: load `/admin`, paste the token,
edit JSON, save. The token never appears in the URL or cookies.

### Disabling admin entirely

Leave `TAKUHON_ADMIN_TOKEN` unset. Every admin write returns `401`. The
`/admin` UI is still served but its Save / Delete actions will fail
identically; treat that as a feature-flag for read-only deployments.

### Image uploads (R2)

Image uploads are **optional** and off until an R2 bucket is bound as
`TAKUHON_R2`. Without it, `POST /api/admin/assets` is unregistered (404) and
avatars stay URL-only.

Create a bucket and uncomment the `[[r2_buckets]]` block in `wrangler.toml`:

```sh
wrangler r2 bucket create takuhon-assets
```

```toml
[[r2_buckets]]
binding = "TAKUHON_R2"
bucket_name = "takuhon-assets"
```

Once bound:

- `POST /api/admin/assets` (admin-authenticated, `multipart/form-data`, field
  `file`) accepts JPEG / PNG / WebP / GIF up to 5 MB and 4096×4096px. The type
  is authenticated from the magic bytes (not the declared `Content-Type`), and
  EXIF / IPTC / XMP / color-profile metadata is stripped before storage
  (`security.md` §4). It returns `201` with the asset record (`publicUrl`).
- Objects are stored under `assets/{timestamp}-{shortHash}.{ext}` and **served
  by the Worker**, not a public R2 bucket: `GET /assets/*` proxies the bytes
  with `X-Content-Type-Options: nosniff` and a long-lived immutable cache. The
  bucket stays private, which keeps the door open for signed-URL delivery in a
  later phase.

Asset delivery is intentionally locale-agnostic: only the literal `/assets/*`
prefix is served, so `/{locale}/assets/...` 404s.

### MCP endpoint (`/mcp`)

The deployed profile is readable over the [Model Context Protocol](https://modelcontextprotocol.io) at `POST /mcp` — the remote counterpart of the CLI's `takuhon mcp`. It reuses `@takuhon/mcp`'s server (the same core catalog) over the SDK's Web Standard Streamable HTTP transport.

- **Stateless**: no Durable Object, no session, no extra binding. Each request builds a fresh server + transport, reads the profile from the same KV (bundled fallback before the first write), and returns a single JSON response (`enableJsonResponse`). It is enabled automatically — nothing to configure.
- **Read-only and unauthenticated**, at parity with `GET /api/profile`: every answer is privacy-filtered and no admin/write surface is exposed. Responses carry `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Exposes the tools `get_profile`, `get_section`, `get_jsonld`, `list_locales` and the resources `takuhon://profile`, `takuhon://schema`. The endpoint is advertised as `mcp` in `/.well-known/takuhon.json`.

Like `/assets/*` and `/health`, `/mcp` is locale-agnostic — `/{locale}/mcp` 404s.

## Limitations & deferred work

| Concern                            | Status                                | Tracked phase |
| ---------------------------------- | ------------------------------------- | ------------- |
| `PATCH /api/admin/profile`         | 405 (intentionally not implemented)   | Phase 5+      |
| AVIF uploads                       | Rejected (415); other formats only    | Phase 5+      |
| Signed-URL / private asset reads   | Public proxy via `GET /assets/*`      | Phase 5+      |
| Global cache purge (REST API)      | Colo-local only via `Cache.delete`    | Phase 5+      |
| CORS preflight for cross-origin    | Not handled (admin UI is same-origin) | Phase 5+      |
| CLI scaffolding (`create-takuhon`) | Minimal Wrangler bootstrap            | Phase 3.6     |
