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
