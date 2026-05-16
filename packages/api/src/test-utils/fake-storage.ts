import { ConflictError, NotFoundError, type Meport, type MeportStorage } from '@meport/core';

/**
 * In-memory MeportStorage for tests that need a runtime-agnostic backing
 * store. Mirrors the contract of @meport/cloudflare's FakeKV-backed adapter
 * but lives inside @meport/api so unit tests stay free of adapter imports.
 */
export class FakeStorage implements MeportStorage {
  private state: { data: Meport; version: string } | null = null;
  private counter = 0;

  getProfile(): Promise<{ data: Meport; version: string }> {
    if (!this.state) return Promise.reject(new NotFoundError('no profile stored'));
    return Promise.resolve(this.state);
  }

  saveProfile(data: Meport, ifMatch?: string): Promise<{ version: string }> {
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
