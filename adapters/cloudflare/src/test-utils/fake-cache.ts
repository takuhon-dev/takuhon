/**
 * Minimal in-memory `Cache` double for testing `CloudflareCachePurger`
 * without booting a Workers runtime. Records every `delete` call so tests
 * can assert which URLs were targeted by an admin write.
 */
export class FakeCache {
  readonly deletes: string[] = [];

  delete(request: Request | string, _options?: CacheQueryOptions): Promise<boolean> {
    const url = typeof request === 'string' ? request : request.url;
    this.deletes.push(url);
    return Promise.resolve(true);
  }
}
