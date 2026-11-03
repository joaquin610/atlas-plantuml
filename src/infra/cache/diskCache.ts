import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = /^[a-f0-9]{16,64}$/;

/**
 * Text cache in a folder, one file per key, so previews open fast after a restart.
 * Keeps the newest `maxEntries` files. Errors are swallowed: a cache miss is always safe.
 */
export class DiskCache {
  private readonly dir: string;
  private readonly extension: string;
  private readonly maxEntries: number;

  constructor(dir: string, extension: string, maxEntries = 50) {
    this.maxEntries = maxEntries;
    this.dir = dir;
    this.extension = extension;
  }

  async get(key: string): Promise<string | undefined> {
    if (!KEY.test(key)) {
      return undefined;
    }
    try {
      const text = await readFile(this.pathFor(key), 'utf-8');
      return text.length > 0 ? text : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, text: string): Promise<void> {
    if (!KEY.test(key)) {
      return;
    }
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.pathFor(key), text, 'utf-8');
      await this.prune();
    } catch {
      // Read-only or full disk: rendering still works without the cache
    }
  }

  private pathFor(key: string): string {
    return join(this.dir, `${key}${this.extension}`);
  }

  private async prune(): Promise<void> {
    const names = (await readdir(this.dir)).filter((name) => name.endsWith(this.extension));
    if (names.length <= this.maxEntries) {
      return;
    }
    const files = await Promise.all(
      names.map(async (name) => ({ name, mtime: (await stat(join(this.dir, name))).mtimeMs })),
    );
    files.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(
      files.slice(this.maxEntries).map((file) => unlink(join(this.dir, file.name)).catch(() => {})),
    );
  }
}
