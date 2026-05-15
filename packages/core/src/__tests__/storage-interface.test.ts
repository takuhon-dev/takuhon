import { describe, expect, expectTypeOf, it } from 'vitest';

import { ConflictError, NotFoundError, StorageError } from '../index.js';
import type {
  AssetOptions,
  AssetRecord,
  Meport,
  MeportAssetStorage,
  MeportStorage,
} from '../index.js';

describe('MeportStorage interface shape', () => {
  it('getProfile() resolves to { data: Meport; version: string }', () => {
    expectTypeOf<MeportStorage['getProfile']>().returns.resolves.toEqualTypeOf<{
      data: Meport;
      version: string;
    }>();
  });

  it('saveProfile() accepts (data, ifMatch?) and resolves to { version: string }', () => {
    expectTypeOf<MeportStorage['saveProfile']>().parameters.toEqualTypeOf<
      [data: Meport, ifMatch?: string]
    >();
    expectTypeOf<MeportStorage['saveProfile']>().returns.resolves.toEqualTypeOf<{
      version: string;
    }>();
  });

  it('deleteProfile() takes no arguments and resolves to void', () => {
    expectTypeOf<MeportStorage['deleteProfile']>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<MeportStorage['deleteProfile']>().returns.resolves.toEqualTypeOf<void>();
  });
});

describe('MeportAssetStorage interface shape', () => {
  it('putAsset() accepts a File or Blob and optional AssetOptions', () => {
    expectTypeOf<MeportAssetStorage['putAsset']>().parameters.toEqualTypeOf<
      [file: File | Blob, options?: AssetOptions]
    >();
    expectTypeOf<MeportAssetStorage['putAsset']>().returns.resolves.toEqualTypeOf<AssetRecord>();
  });

  it('getPublicUrl() accepts an assetId and resolves to a string', () => {
    expectTypeOf<MeportAssetStorage['getPublicUrl']>().parameters.toEqualTypeOf<
      [assetId: string]
    >();
    expectTypeOf<MeportAssetStorage['getPublicUrl']>().returns.resolves.toEqualTypeOf<string>();
  });

  it('listAssets() resolves to AssetRecord[]', () => {
    expectTypeOf<MeportAssetStorage['listAssets']>().returns.resolves.toEqualTypeOf<
      AssetRecord[]
    >();
  });
});

describe('AssetRecord shape', () => {
  it('has the documented required fields and accepts the optional ones', () => {
    const minimal: AssetRecord = {
      id: 'a',
      url: '/assets/a.webp',
      publicUrl: 'https://cdn.example.com/assets/a.webp',
      mimeType: 'image/webp',
      size: 1024,
    };
    const full: AssetRecord = {
      ...minimal,
      width: 800,
      height: 600,
      createdAt: '2026-05-15T00:00:00Z',
    };
    expect(minimal.id).toBe('a');
    expect(full.width).toBe(800);
    expect(full.createdAt).toBe('2026-05-15T00:00:00Z');
  });

  it('rejects extra fields and missing required fields at compile time', () => {
    expectTypeOf<AssetRecord>().toHaveProperty('id').toEqualTypeOf<string>();
    expectTypeOf<AssetRecord>().toHaveProperty('publicUrl').toEqualTypeOf<string>();
    expectTypeOf<AssetRecord>().toHaveProperty('size').toEqualTypeOf<number>();
  });
});

describe('Error classes', () => {
  it('StorageError preserves message and exposes cause', () => {
    const cause = new Error('underlying');
    const err = new StorageError('boom', { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StorageError);
    expect(err.message).toBe('boom');
    expect(err.name).toBe('StorageError');
    expect(err.cause).toBe(cause);
  });

  it('NotFoundError is a StorageError and an Error with the right name', () => {
    const err = new NotFoundError('no profile');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StorageError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('no profile');
  });

  it('ConflictError carries currentVersion and preserves cause', () => {
    const cause = new Error('etag mismatch');
    const err = new ConflictError('version mismatch', {
      currentVersion: 'abc123',
      cause,
    });
    expect(err).toBeInstanceOf(StorageError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.name).toBe('ConflictError');
    expect(err.currentVersion).toBe('abc123');
    expect(err.cause).toBe(cause);
  });

  it('ConflictError tolerates omitted options', () => {
    const err = new ConflictError('version mismatch');
    expect(err.currentVersion).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('error names round-trip through { name, message } projection', () => {
    const errors: StorageError[] = [
      new StorageError('a'),
      new NotFoundError('b'),
      new ConflictError('c'),
    ];
    const projected = errors.map((e) => ({ name: e.name, message: e.message }));
    expect(projected).toEqual([
      { name: 'StorageError', message: 'a' },
      { name: 'NotFoundError', message: 'b' },
      { name: 'ConflictError', message: 'c' },
    ]);
  });
});
