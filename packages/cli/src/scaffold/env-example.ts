/**
 * Generator for the `.env.example` file in a freshly scaffolded project.
 *
 * The Wrangler-managed secrets (admin bearer token) are *not* read from `.env`
 * at deploy time — `wrangler secret put` is the source of truth. The
 * `.env.example` is therefore documentation: it lists the variables a developer
 * may want locally (e.g. for scripting or for the wrangler CLI itself) and
 * links each to its production provisioning path.
 */

export function renderEnvExample(): string {
  return `# ----------------------------------------------------------------
# Local development variables for this Takuhon deployment.
#
# Production secrets (admin token) are provisioned via:
#   wrangler secret put TAKUHON_ADMIN_TOKEN
# This file is a hint for local tooling, not a runtime source.
# ----------------------------------------------------------------

# Admin bearer token for /api/admin/* endpoints.
# Generate with: openssl rand -base64 32
# Then provision with:
#   echo "$TAKUHON_ADMIN_TOKEN" | wrangler secret put TAKUHON_ADMIN_TOKEN
TAKUHON_ADMIN_TOKEN=

# Comma-separated Origin allowlist for browser-originating admin requests.
# Set in wrangler.toml [vars] for production. Local example:
#   TAKUHON_ADMIN_ORIGIN=https://admin.example.com,https://localhost:8787
TAKUHON_ADMIN_ORIGIN=

# Developer-activity sync secrets (only needed when settings.activity is
# enabled in takuhon.json). Used by \`takuhon activity sync\` locally; for a
# deployed Worker provision them as Wrangler secrets instead:
#   wrangler secret put TAKUHON_GITHUB_TOKEN
#   wrangler secret put TAKUHON_WAKATIME_KEY
# Never commit the real values.
#
# Optional GitHub token: languages work without it; the contribution calendar
# requires it (minimal read-only scope is enough).
TAKUHON_GITHUB_TOKEN=
# WakaTime API key (https://wakatime.com/settings/api-key); required to read
# coding time.
TAKUHON_WAKATIME_KEY=

# Contact form (optional; only when settings.contact is enabled in takuhon.json
# with a public turnstileSiteKey). The recipient and From are plain vars — set
# them in wrangler.toml [vars] for a deployed Worker — while the Turnstile secret
# is a Wrangler secret:
#   wrangler secret put TAKUHON_TURNSTILE_SECRET
# The recipient MUST be a verified Cloudflare Email Routing destination, and the
# send_email binding (TAKUHON_CONTACT_EMAIL) is declared in wrangler.toml.
TAKUHON_CONTACT_TO=
TAKUHON_CONTACT_FROM=
TAKUHON_TURNSTILE_SECRET=

# Cloudflare account id (look up via \`wrangler whoami\`). Only needed if you
# script Cloudflare API calls outside Wrangler itself.
CLOUDFLARE_ACCOUNT_ID=
`;
}
