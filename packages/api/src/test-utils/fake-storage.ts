import {
  ConflictError,
  NotFoundError,
  type ActivitySnapshot,
  type ActivityStorage,
  type AssetOptions,
  type AssetRecord,
  type Takuhon,
  type TakuhonAssetStorage,
  type TakuhonStorage,
} from '@takuhon/core';

/**
 * In-memory TakuhonStorage for tests that need a runtime-agnostic backing
 * store. Mirrors the contract of @takuhon/cloudflare's FakeKV-backed adapter
 * but lives inside @takuhon/api so unit tests stay free of adapter imports.
 */
export class FakeStorage implements TakuhonStorage {
  private state: { data: Takuhon; version: string } | null = null;
  private counter = 0;

  getProfile(): Promise<{ data: Takuhon; version: string }> {
    if (!this.state) return Promise.reject(new NotFoundError('no profile stored'));
    return Promise.resolve(this.state);
  }

  saveProfile(data: Takuhon, ifMatch?: string): Promise<{ version: string }> {
    if (ifMatch !== undefined && this.state?.version !== ifMatch) {
      return Promise.reject(
        new ConflictError(`version mismatch: expected "${ifMatch}"`, {
          currentVersion: this.state?.version,
        }),
      );
    }
    this.counter += 1;
    const version = `v${String(this.counter)}`;
    this.state = { data, version };
    return Promise.resolve({ version });
  }

  deleteProfile(): Promise<void> {
    this.state = null;
    return Promise.resolve();
  }
}

/** In-memory ActivityStorage for tests; seed `snapshot` directly. */
export class FakeActivityStorage implements ActivityStorage {
  snapshot: ActivitySnapshot | null = null;

  getActivitySnapshot(): Promise<ActivitySnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  saveActivitySnapshot(snapshot: ActivitySnapshot): Promise<void> {
    this.snapshot = snapshot;
    return Promise.resolve();
  }
}

/**
 * In-memory TakuhonAssetStorage for tests. Records the (already validated and
 * stripped) bytes the admin app hands to `putAsset`, so a test can assert both
 * the returned `AssetRecord` and that metadata was removed before storage.
 */
export class FakeAssetStorage implements TakuhonAssetStorage {
  readonly stored: { record: AssetRecord; bytes: Uint8Array }[] = [];
  private counter = 0;

  async putAsset(file: File | Blob, options?: AssetOptions): Promise<AssetRecord> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    this.counter += 1;
    const id = `asset-${String(this.counter)}`;
    const record: AssetRecord = {
      id,
      url: `/assets/${id}`,
      publicUrl: `https://cdn.example/${id}`,
      mimeType: options?.contentType ?? file.type,
      size: bytes.length,
    };
    this.stored.push({ record, bytes });
    return record;
  }

  getPublicUrl(assetId: string): Promise<string> {
    const found = this.stored.find((s) => s.record.id === assetId);
    if (!found) return Promise.reject(new NotFoundError(`no asset "${assetId}"`));
    return Promise.resolve(found.record.publicUrl);
  }

  deleteAsset(assetId: string): Promise<void> {
    const i = this.stored.findIndex((s) => s.record.id === assetId);
    if (i >= 0) this.stored.splice(i, 1);
    return Promise.resolve();
  }

  listAssets(): Promise<AssetRecord[]> {
    return Promise.resolve(this.stored.map((s) => s.record));
  }
}
