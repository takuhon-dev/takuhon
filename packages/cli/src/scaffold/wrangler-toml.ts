/**
 * Generator for `wrangler.toml` in a freshly scaffolded project.
 *
 * The layout mirrors the reference Cloudflare adapter shipped in this
 * monorepo: a single KV namespace `TAKUHON_KV`, placeholder ids the user
 * fills in after running `wrangler kv namespace create`, and the
 * `TAKUHON_ADMIN_ORIGIN` var defaulting to "" (disabled). The admin bearer
 * token is provisioned as a Wrangler secret and is therefore not in this file.
 */

/**
 * Validate a Cloudflare Worker name.
 *
 * Cloudflare itself accepts mixed-case DNS labels (1–63 chars, must not
 * start or end with a hyphen). This validator additionally enforces a
 * lowercase convention chosen for the scaffolder so that the resulting
 * `workers.dev` subdomain is predictable and matches the npm `name` field.
 */
export function isValidWorkerName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name);
}

/**
 * In-project directory the admin SPA bundle is copied into and the scaffolded
 * `wrangler.toml` binds as `ASSETS`. Shared so the copy destination and the
 * `[assets] directory` value cannot drift apart. Defined in this leaf module
 * (which `scaffold/index.ts` already imports) to avoid an import cycle.
 */
export const ADMIN_DIST_DIRNAME = 'admin-dist';

/**
 * Render `wrangler.toml` for the given project name.
 *
 * Throws if `projectName` is not a valid Cloudflare Worker name. Callers are
 * responsible for sanitising/validating earlier in the prompt flow.
 */
export function renderWranglerToml(projectName: string): string {
  if (!isValidWorkerName(projectName)) {
    throw new Error(
      `Invalid Cloudflare Worker name: "${projectName}". Names must be lowercase, ` +
        `start with a letter or digit, and contain only letters, digits, and hyphens (max 63 chars).`,
    );
  }
  return `name = "${projectName}"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

# Admin SPA bundle. The React admin UI is committed in ./${ADMIN_DIST_DIRNAME}
# (copied here when this project was created with create-takuhon) and served at
# /admin.
#
# run_worker_first = true makes the Worker mediate every request: the bundle's
# files sit at the assets root, so without this they would shadow the public "/"
# route. The Worker serves the bundle only for /admin/* (attaching the strict
# admin CSP) and handles everything else itself.
#
# SECURITY-CRITICAL: do not set run_worker_first to false or remove it. The
# Worker is the only thing that attaches the strict admin CSP (plus HSTS /
# no-store) to the admin assets; serving them directly would expose the admin UI
# with no policy. To deploy without the form UI, remove this whole [assets]
# block — the Worker then falls back to a minimal inline editor.
[assets]
directory = "${ADMIN_DIST_DIRNAME}"
binding = "ASSETS"
run_worker_first = true
not_found_handling = "single-page-application"

# Replace the placeholder ids after running:
#   wrangler kv namespace create TAKUHON_KV
#   wrangler kv namespace create TAKUHON_KV --preview
[[kv_namespaces]]
binding = "TAKUHON_KV"
id = "REPLACE_WITH_PRODUCTION_NAMESPACE_ID"
preview_id = "REPLACE_WITH_PREVIEW_NAMESPACE_ID"

# Admin Origin allowlist (comma-separated). Empty value disables the check.
# Example for production: TAKUHON_ADMIN_ORIGIN = "https://admin.example.com"
#
# The admin bearer token MUST be provisioned as a Wrangler secret, never in
# this file:
#   wrangler secret put TAKUHON_ADMIN_TOKEN
# Use 32+ bytes of entropy, e.g. \`openssl rand -base64 32\`.
[vars]
TAKUHON_ADMIN_ORIGIN = ""
`;
}
