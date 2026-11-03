import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DiskCache } from '../../src/infra/cache/diskCache.ts';
import { LruCache } from '../../src/infra/cache/lruCache.ts';

describe('LruCache', () => {
  it('drops the least recently used entry', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
    assert.equal(cache.size, 2);
  });
});

describe('DiskCache', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-plantuml-cache-'));
  after(() => rm(dir, { recursive: true, force: true }));
  const key = (n: number) => n.toString(16).padStart(32, '0');

  it('stores and reads entries', async () => {
    const cache = new DiskCache(join(dir, 'a'), '.svg');
    await cache.set(key(1), '<svg/>');
    assert.equal(await cache.get(key(1)), '<svg/>');
    assert.equal(await cache.get(key(2)), undefined);
  });

  it('ignores keys that are not hashes', async () => {
    const cache = new DiskCache(join(dir, 'b'), '.svg');
    await cache.set('../../escape', 'x');
    assert.equal(await cache.get('../../escape'), undefined);
  });

  it('keeps only the newest entries', async () => {
    const folder = join(dir, 'c');
    const cache = new DiskCache(folder, '.svg', 2);
    for (let n = 1; n <= 3; n++) {
      await cache.set(key(n), String(n));
      // Distinct modification times, oldest first
      await utimes(join(folder, `${key(n)}.svg`), n, n);
    }
    await cache.set(key(4), '4');
    assert.deepEqual((await readdir(folder)).sort(), [`${key(3)}.svg`, `${key(4)}.svg`]);
  });
});
