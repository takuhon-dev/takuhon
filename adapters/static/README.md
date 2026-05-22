# @takuhon/static

Filesystem-backed adapter for Takuhon — implements `TakuhonStorage` on Node.js `fs`.

This adapter targets local development, single-node Node.js servers, and git-driven workflows where the profile document is edited by hand and committed alongside the rest of the repository. For Cloudflare Workers deployments, use [`@takuhon/cloudflare`](../cloudflare) instead.

## Filesystem layout

The adapter stores its state as two separate files under a caller-supplied base directory:

```
<baseDir>/
├── profile.json     # Takuhon document (formatted JSON)
└── version.json     # { "version": "<uuid>", "updatedAt": "<iso-8601>" }
```

The two files are kept separate so a crash in the middle of a save can never leave a fresh `version.json` pointing at a stale `profile.json`; the write order is profile first, version last, with each individual write being an atomic `writeFile(tmp) + rename`.

## Usage

Pass an instance of `StaticTakuhonStorage` to `@takuhon/api`'s factories the same way the Cloudflare adapter does.

### Direct construction

```typescript
import { createPublicApp } from '@takuhon/api';
import { StaticTakuhonStorage } from '@takuhon/static';

const storage = new StaticTakuhonStorage({
  baseDir: '/var/lib/takuhon', // absolute path strongly recommended
});

const app = createPublicApp({ storage });
```

### Factory variant

```typescript
import { createStaticStorage } from '@takuhon/static';

const storage = createStaticStorage({ baseDir: '/var/lib/takuhon' });
```

Both styles return the same object. Pick whichever your DI container prefers.

## Concurrency model

The MVP targets **single-process** access. Multiple concurrent `saveProfile()` calls from the same process serialise correctly thanks to JavaScript's run-to-completion semantics, but two separate processes writing the same base directory simultaneously can interleave their renames and produce a mixed state. If you need cross-process coordination, gate writes externally (e.g. via a queue or advisory lock) for now; built-in support is tracked under "Limitations" below.

The `version` token returned by `saveProfile()` is a fresh `crypto.randomUUID()` on every successful write, matching `@takuhon/cloudflare`. Callers compare it verbatim against `If-Match` preconditions; mismatches surface as `ConflictError` with `currentVersion` attached.

## Error mapping

| Situation                                              | Thrown                                            |
| ------------------------------------------------------ | ------------------------------------------------- |
| `getProfile()` when either file is missing             | `NotFoundError`                                   |
| `getProfile()` when `version.json` parses but is empty | `StorageError` (`"Corrupt version metadata"`)     |
| `saveProfile()` with a mismatched `ifMatch`            | `ConflictError({ currentVersion })`               |
| Any other fs failure (permissions, disk full, …)       | `StorageError` with the original error in `cause` |
| `deleteProfile()` against a missing profile            | resolves silently (idempotent)                    |

All error classes are re-exported from `@takuhon/core`; instances pass `instanceof` checks against both `StorageError` and the specific subclass.

## Limitations & deferred work

| Concern                                            | Status                                                | Tracked phase |
| -------------------------------------------------- | ----------------------------------------------------- | ------------- |
| Build CLI (static export of API endpoints to JSON) | Not implemented                                       | Phase 5       |
| `TakuhonAssetStorage` (image / asset upload)       | Not implemented                                       | Phase 3.5+    |
| Cross-process write coordination                   | Single-process only                                   | Phase 5+      |
| Tested on Windows                                  | Best-effort only (path semantics are POSIX-validated) | Phase 5+      |
