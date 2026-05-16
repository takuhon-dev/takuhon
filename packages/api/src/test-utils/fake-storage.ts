import { ConflictError, NotFoundError, type Ownport, type OwnportStorage } from '@ownport/core';

/**
 * In-memory OwnportStorage for tests that need a runtime-agnostic backing
 * store. Mirrors the contract of @ownport/cloudflare's FakeKV-backed adapter
 * but lives inside @ownport/api so unit tests stay free of adapter imports.
 */
export class FakeStorage implements OwnportStorage {
  private state: { data: Ownport; version: string } | null = null;
  private counter = 0;

  getProfile(): Promise<{ data: Ownport; version: string }> {
    if (!this.state) return Promise.reject(new NotFoundError('no profile stored'));
    return Promise.resolve(this.state);
  }

  saveProfile(data: Ownport, ifMatch?: string): Promise<{ version: string }> {
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
