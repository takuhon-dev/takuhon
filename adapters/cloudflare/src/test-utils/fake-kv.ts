interface Entry {
  value: string;
  metadata?: unknown;
}

/**
 * Minimal in-memory KVNamespace double — supports the subset used by
 * KvMeportStorage (get / getWithMetadata / put / delete). Tests cast the
 * instance to KVNamespace via `as unknown as KVNamespace`; if a future
 * sub-phase needs list / bulkPut, extend this class and remove the cast
 * detour at the same time.
 */
export class FakeKV {
  private readonly store = new Map<string, Entry>();

  get(key: string): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  get(key: string, type: 'text' | 'json' = 'text'): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve(type === 'json' ? (JSON.parse(entry.value) as unknown) : entry.value);
  }

  getWithMetadata<M>(
    key: string,
    type: 'text' | 'json' = 'text',
  ): Promise<{ value: unknown; metadata: M | null }> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve({ value: null, metadata: null });
    const value = type === 'json' ? (JSON.parse(entry.value) as unknown) : entry.value;
    return Promise.resolve({ value, metadata: (entry.metadata as M | undefined) ?? null });
  }

  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void> {
    this.store.set(key, { value, metadata: options?.metadata });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  /** Test helper — not part of KVNamespace. */
  has(key: string): boolean {
    return this.store.has(key);
  }
}
