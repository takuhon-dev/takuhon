# Publishing to npm

This guide describes how to publish the `@takuhon/*` packages to npm via the GitHub Actions workflow defined in `.github/workflows/publish.yml`.

## One-time setup (org owner)

1. Create an npm Granular Access Token:
   - Visit https://www.npmjs.com/settings/<your-username>/tokens
   - Permissions: **Read and write** packages
   - Scope: `@takuhon/*`
   - Expiration: 90 days (rotate periodically)

2. Add the token as a GitHub Secret:
   - Visit https://github.com/takuhon-dev/takuhon/settings/secrets/actions
   - Name: `NPM_TOKEN`
   - Value: the token issued in step 1

This token-based setup is required only until the org switches to npm Trusted Publishing (see below). Once Trusted Publishing is configured, the `NPM_TOKEN` secret can be removed.

## Per-release flow

1. Bump versions for all workspace packages:

   ```bash
   pnpm -r exec -- npm version <new-version> --no-git-tag-version
   pnpm install
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
   ```

2. Commit and merge to `main` via a normal PR.

3. Tag the release on `main` after merge:

   ```bash
   git checkout main
   git pull --ff-only
   git tag v<new-version>
   git push origin v<new-version>
   ```

   The `Publish to npm` workflow runs automatically on the tag push.

4. (Alternative) Trigger the workflow manually via the Actions tab:
   - Workflow: `Publish to npm`
   - Set `dry_run: true` to verify without publishing, or `false` for a real publish.

5. Verify the published packages:

   ```bash
   npm view @takuhon/core version
   npm view @takuhon/api version
   npm view @takuhon/ui version
   npm view @takuhon/cli version
   npm view @takuhon/cloudflare version
   ```

## Switch to Trusted Publishing (after first publish)

After v0.1.0 is published, configure a Trusted Publisher for each `@takuhon/*` package on npm:

1. Visit https://www.npmjs.com/package/@takuhon/core/access (repeat for `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`).
2. Configure Trusted Publisher:
   - Repository: `takuhon-dev/takuhon`
   - Workflow filename: `publish.yml`
   - Environment: (leave blank)
3. Once all packages are linked, remove the legacy access token:
   - Delete the `NPM_TOKEN` GitHub Secret.
   - Remove the `env.NODE_AUTH_TOKEN` block from `.github/workflows/publish.yml`.

Future publishes then use the OIDC handshake automatically. The `permissions.id-token: write` block in `publish.yml` is what enables this.

## Troubleshooting

| Error                                                            | Cause                                              | Fix                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `403 Forbidden - PUT https://registry.npmjs.org/@takuhon%2fcore` | `NPM_TOKEN` scope insufficient or expired          | Re-issue the token with `@takuhon/*` scope and `Read and write` permission |
| `409 Conflict - Package already exists`                          | Version already published (re-publish disallowed)  | Bump to a new version and retry                                            |
| `E402 Payment Required`                                          | Tried to publish a private package on a free org   | Ensure `--access=public` flag is present (workflow already sets this)      |
| `provenance flag requires id-token`                              | OIDC permission missing                            | Verify `permissions.id-token: write` is set on the publish job             |
| `npm ERR! 404 Not Found - @takuhon`                              | npm org `takuhon` not configured for the publisher | Confirm org settings on npmjs.com; ensure members have publish rights      |

## Notes

- Do not publish from a local machine; always go through the workflow.
- Do not run `npm publish` directly — use `pnpm -r publish` so workspace dependencies resolve correctly.
- The workflow runs the same checks as CI before publish, so a failure here also indicates a regression.
