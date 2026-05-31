# Publishing to npm

The `@takuhon/*` packages, the bare-name `takuhon` redirect, and the bundled GitHub Release are produced by `.github/workflows/release.yml` on a `vX.Y.Z` tag push. Publishing uses npm **OIDC trusted publishing** (no long-lived `NPM_TOKEN` secret), emits **SLSA provenance v1 attestation** for every package, and attaches **cosign sign-blob bundles** to the GitHub Release for downstream verification.

## One-time setup (org owner)

This is a per-package step on npmjs.com. Run it once per package, before the first OIDC-published release.

1. Open the package's access page on the npm web UI, one per publishable package:
   - https://www.npmjs.com/package/@takuhon/core/access
   - https://www.npmjs.com/package/@takuhon/api/access
   - https://www.npmjs.com/package/@takuhon/ui/access
   - https://www.npmjs.com/package/@takuhon/cli/access
   - https://www.npmjs.com/package/@takuhon/cloudflare/access
   - https://www.npmjs.com/package/takuhon/access (bare-name)

2. In the **Trusted Publishers** section, click **Add a trusted publisher** and fill in:

   | Field                     | Value                                                |
   | ------------------------- | ---------------------------------------------------- |
   | Publisher                 | `GitHub Actions`                                     |
   | Organization or user      | `takuhon-dev` (case-sensitive)                       |
   | Repository                | `takuhon` (repository name only, not `<org>/<repo>`) |
   | Workflow filename         | `release.yml` (extension included, no path prefix)   |
   | Environment name          | _(leave blank)_                                      |
   | Allow `npm publish`       | ✅ (required)                                        |
   | Allow `npm stage publish` | ☐ (leave unchecked)                                  |

3. **Click `Save changes`** at the bottom of the form. The web UI does not always autosave; the most common cause of a 404 from `npm publish` post-setup is a trusted publisher form that was filled out but never persisted.

Once all six packages are configured, the workflow can authenticate via the GitHub Actions OIDC token without any classic `NPM_TOKEN` secret.

### Removing the legacy NPM_TOKEN secret

After at least one end-to-end OIDC publish succeeds, delete the classic-auth secret:

```bash
gh secret delete NPM_TOKEN -R takuhon-dev/takuhon
```

The workflow no longer references it.

## Per-release flow

For each release:

1. Bump versions for every workspace package and update the `CHANGELOG.md`:

   ```bash
   pnpm -r exec -- npm version <new-version> --no-git-tag-version
   pnpm install
   pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
   ```

2. Commit the version bump on a topic branch, open a PR, get CI green, and merge to `main`. Direct push to `main` is not allowed.

3. Tag the release on `main` after merge:

   ```bash
   git checkout main
   git pull --ff-only
   git tag v<new-version>
   git push origin v<new-version>
   ```

4. The `Release` workflow runs automatically on the tag push and proceeds in four jobs:
   - **`verify`** — re-runs `pnpm typecheck / lint / format:check / test / build` on the tagged tree. Catches a tag pushed at a commit that turned out broken since the last CI run.
   - **`publish-scoped`** (matrix) — publishes `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, and `@takuhon/cloudflare` to npm via OIDC trusted publishing with provenance attestation. `fail-fast: true` so a dep-graph mismatch never leaks a partial release set.
   - **`publish-bare`** — publishes the bare-name `takuhon` redirect package after the scoped packages, so consumers running `npm i -g takuhon` always find `@takuhon/cli@<same-version>` already on the registry.
   - **`github-release`** — creates a GitHub Release with auto-generated release notes, six tarballs, and six cosign sign-blob bundles attached as assets.

5. **Optional dry-run**: trigger the workflow manually via the Actions tab with `Run workflow` and `dry_run: true`. The dry-run packs the tarballs and runs `pnpm publish --dry-run` for each package but **does not** exercise the OIDC auth handshake, does not produce provenance attestation, and does not create a GitHub Release. Use it as a packaging smoke test only; the full OIDC trusted-publishing path is validated solely by an actual `vX.Y.Z` tag push.

## Verification after publish

```bash
VER=0.6.0

# 1. Confirm version + provenance attestation for every package
for PKG in @takuhon/core @takuhon/api @takuhon/ui @takuhon/cli @takuhon/cloudflare takuhon; do
  echo "=== $PKG@$VER ==="
  npm view "${PKG}@${VER}" version
  npm view "${PKG}@${VER}" --json | jq '{
    repository: .repository,
    attestations: .dist.attestations,
    signatures: .dist.signatures
  }'
done

# 2. Confirm the GitHub Release exists with 12 assets (6 tarballs + 6 bundles)
gh release view "v${VER}" -R takuhon-dev/takuhon \
  --json name,tagName,publishedAt,url,assets \
  | jq '{name, tagName, publishedAt, url, assetCount: (.assets | length), assets: [.assets[].name]}'

# 3. Verify a tarball against its cosign sign-blob bundle (independent of npm)
brew install cosign  # if not already installed
# Download the tarball and its matching .bundle file from the GitHub Release page, then:
cosign verify-blob \
  --bundle "takuhon-core-${VER}.tgz.bundle" \
  --certificate-identity-regexp "^https://github\.com/takuhon-dev/takuhon/" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "takuhon-core-${VER}.tgz"
# Expected output:
#   "Verified OK"
# with the certificate Subject claim showing release.yml@refs/tags/v<VER>.
```

## Recovery from a partial release

If the workflow fails partway through (for example, the scoped matrix succeeds but `publish-bare` fails before the GitHub Release is created), the npm publishes that already happened are permanent and cannot be redone at the same version. The safe recovery is:

1. Diagnose the failure cause from the workflow logs.
2. Fix it on `main` via a PR.
3. Delete the tag locally and on the remote, then re-tag at the new fix commit:

   ```bash
   git push origin :v<new-version>
   git tag -d v<new-version>
   git tag v<new-version> <fix-commit-sha>
   git push origin v<new-version>
   ```

The publish workflow re-runs from scratch. Packages that already published at this version on npm are unaffected; only the missing packages and the GitHub Release will be re-attempted.

## Troubleshooting

| Symptom                                                                                                                    | Likely cause                                                                                                                       | Fix                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `404 PUT https://registry.npmjs.org/<pkg>` with the verbose log showing `npm verbose npm v10.x.x`                          | Node 20 + npm v10 lacks OIDC trusted publisher support                                                                             | Bump `.nvmrc` to `24` or later (Node 24 bundles npm 11.x).                                                                                                                                            |
| `404 PUT` with the verbose log showing the Sigstore "Signed provenance statement" but the registry still rejecting         | `actions/setup-node`'s `registry-url` injected an empty `_authToken` into `~/.npmrc`; npm CLI bypassed OIDC and tried classic auth | The workflow omits `registry-url` and overwrites `~/.npmrc` with only the registry line in a dedicated step. Do not reintroduce `registry-url`.                                                       |
| `422 Unprocessable Entity` from provenance validation with the message `Failed to validate repository information`         | The package's `package.json` is missing `repository.url`, or the URL does not match `https://github.com/takuhon-dev/takuhon`       | Every publishable `package.json` must set both `repository.url` and `repository.directory`.                                                                                                           |
| `pnpm publish` (or `npm publish <tgz>`) succeeds but the published tarball still contains `"@takuhon/core": "workspace:*"` | `npm pack` was used to produce the tarball, which does not rewrite workspace:\* deps                                               | The workflow uses `pnpm pack` + `npm publish <tgz>` so the workspace:\* deps are rewritten to actual semver before publish. Do not switch to plain `npm pack`.                                        |
| `Error: This command requires you to be logged in to https://registry.npmjs.org/`                                          | Same root cause as the first row (Node 20 + npm v10)                                                                               | Same fix: confirm `.nvmrc` is `24` or later.                                                                                                                                                          |
| A manual `workflow_dispatch` run with `dry_run: false` is leaking a real publish                                           | The real-publish branch is single-gated on `inputs.dry_run`                                                                        | The workflow double-gates on `event_name == push` AND `(inputs.dry_run \|\| 'false') != 'true'`, so manual dispatch always falls through to the dry-run branch. Do not remove the `event_name` check. |
| A `403 Forbidden` after the trusted publisher form was filled out and apparently saved                                     | The web UI did not persist the form (a common edit-without-save case)                                                              | Reopen the package's `/access` page, scroll to the **Trusted Publishers** section, verify the row exists at the bottom of the form, and click **Save changes** if anything is in a pending state.     |
| The workflow run sits at `queued` for more than several minutes and `gh run cancel` rejects it                             | GitHub Actions outage placed the run in a stuck state                                                                              | Delete and re-push the tag — the new tag triggers a fresh workflow run; the stuck run is effectively a zombie and can be ignored.                                                                     |

## Pre-publish tarball sanity check

Before each publish (real or dry-run), both `publish-scoped` and `publish-bare` unpack the tarball they are about to ship and fail the workflow if it contains either of these patterns:

- **Stale brand identifiers** — `meport`, `ownport-dev`, or `ownport` left over in any file inside the package. This catches the case where a developer-side `dist/` cache pre-dates the project rename. CI always builds from a clean checkout, so the check should normally be a no-op; if it fires, the local cache is leaking into the build somehow and the publish should be retried from CI.
- **Host-machine absolute paths** — `/Users/...` or non-runner `/home/...` paths that source maps may inadvertently embed. The check excludes `/home/runner/...`, which is by definition the expected runner build location and reveals no maintainer information.

If you need to reproduce the check locally before pushing a tag:

```bash
pnpm install --frozen-lockfile
pnpm build
for pkg in packages/core packages/api packages/ui packages/cli adapters/cloudflare packages/takuhon; do
  ( cd "$pkg" && pnpm pack --pack-destination /tmp )
done
# Inspect the resulting *.tgz files in /tmp.
```

## Notes

- Do not publish from a local machine; always go through the workflow. Local publishing bypasses the OIDC trusted publishing path entirely.
- Do not run `npm publish` directly — use `pnpm pack` to produce the tarball (it rewrites workspace:\* deps to semver), then `npm publish <tgz>`.
- The pre-publish tarball sanity check is mandatory; do not skip it by editing the workflow.
- All third-party GitHub Actions in the workflow are SHA-pinned. Dependabot updates the pins on the weekly cycle; the `github-actions` ecosystem only renews existing SHA pins (it does not convert tag pins to SHA pins), so new actions must be SHA-pinned from the first commit that introduces them.
