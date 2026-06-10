interface StoredEntry {
  bytes: Uint8Array;
  httpMetadata?: { contentType?: string };
  uploaded: Date;
}

/** A single readable chunk of the stored bytes, for the `R2ObjectBody.body`. */
function bodyStream(bytes: Uint8Array): ReadableStream {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Minimal in-memory R2Bucket double — supports the subset used by
 * {@link R2TakuhonAssetStorage} and the Worker's `/assets/*` delivery route
 * (put / get / head / delete / list). Tests cast the instance to `R2Bucket`
 * via `as unknown as R2Bucket`; extend this class (and drop the cast) if a
 * later phase needs multipart, conditional reads, or `customMetadata`.
 */
export class FakeR2 {
  private readonly store = new Map<string, StoredEntry>();

  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown> {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.store.set(key, {
      bytes: bytes.slice(),
      httpMetadata: options?.httpMetadata,
      uploaded: new Date('2026-06-10T00:00:00Z'),
    });
    return Promise.resolve({ key });
  }

  get(key: string): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      key,
      size: entry.bytes.length,
      httpMetadata: entry.httpMetadata,
      httpEtag: `"${key}"`,
      uploaded: entry.uploaded,
      body: bodyStream(entry.bytes),
      writeHttpMetadata: () => {
        /* no-op for the fake */
      },
    });
  }

  head(key: string): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      key,
      size: entry.bytes.length,
      httpMetadata: entry.httpMetadata,
      httpEtag: `"${key}"`,
      uploaded: entry.uploaded,
    });
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string }): Promise<unknown> {
    const prefix = options?.prefix ?? '';
    const objects = [...this.store.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, entry]) => ({
        key,
        size: entry.bytes.length,
        httpMetadata: entry.httpMetadata,
        httpEtag: `"${key}"`,
        uploaded: entry.uploaded,
      }));
    return Promise.resolve({ objects, delimitedPrefixes: [], truncated: false });
  }

  /** Test helper — not part of R2Bucket. */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Test helper — bytes stored under `key`, or undefined. */
  bytesAt(key: string): Uint8Array | undefined {
    return this.store.get(key)?.bytes;
  }
}
