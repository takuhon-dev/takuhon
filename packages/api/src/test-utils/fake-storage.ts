import { ConflictError, NotFoundError, type Takuhon, type TakuhonStorage } from '@takuhon/core';

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
