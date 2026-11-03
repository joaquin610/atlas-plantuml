import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { hasIncludes } from '../../core/plantuml/source.ts';
import { fail, ok, type Result } from '../../core/result.ts';
import type { DiskCache } from '../cache/diskCache.ts';
import { LruCache } from '../cache/lruCache.ts';
import { runProcess } from '../process.ts';

export const JAR_FILENAME = 'plantuml-1.2025.10.jar';

const BATCH_DELIMITER = '@@ATLAS-PLANTUML-SPLIT@@';
const MEMORY_CACHE_ENTRIES = 30;

export interface PlantUmlRendererOptions {
  /** Folders searched for the PlantUML jar, in order. */
  readonly jarDirs: readonly string[];
  readonly diskCache?: DiskCache;
  readonly java?: string;
  readonly timeoutMs?: number;
}

/** Renders PlantUML text to SVG with the bundled jar, reading from stdin (-pipe). */
export class PlantUmlRenderer {
  private readonly memoryCache = new LruCache<string>(MEMORY_CACHE_ENTRIES);
  private readonly java: string;
  private readonly timeoutMs: number;
  private jarPath: Promise<string | null> | undefined;
  private javaChecked = false;

  private readonly options: PlantUmlRendererOptions;

  constructor(options: PlantUmlRendererOptions) {
    this.options = options;
    this.java = options.java ?? 'java';
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /**
   * Renders one diagram. `cwd` is the diagram's folder, so relative includes resolve.
   * PlantUML returns an SVG that shows the error for invalid diagrams: that is a success here.
   */
  async render(source: string, cwd: string): Promise<Result<string>> {
    const key = hasIncludes(source) ? undefined : cacheKey(cwd, source);
    const cached = key ? await this.cached(key) : undefined;
    if (cached) {
      return ok(cached);
    }
    const setup = await this.prepare();
    if (!setup.ok) {
      return setup;
    }
    const result = await runProcess(this.java, this.args(setup.value), {
      cwd,
      input: source,
      timeoutMs: this.timeoutMs,
    });
    const svg = result.stdout.toString('utf-8');
    if (!svg.includes('<svg')) {
      return fail(result.failure ?? (result.stderr.trim() || 'PlantUML produced no SVG'));
    }
    if (key) {
      this.memoryCache.set(key, svg);
      await this.options.diskCache?.set(key, svg);
    }
    return ok(svg);
  }

  /** Renders several diagrams in one Java process. Not cached: used for one-off candidates. */
  async renderBatch(sources: readonly string[], cwd: string): Promise<string[]> {
    const setup = await this.prepare();
    if (!setup.ok || sources.length === 0) {
      return sources.map(() => '');
    }
    const result = await runProcess(
      this.java,
      [...this.args(setup.value), '-pipedelimitor', BATCH_DELIMITER],
      { cwd, input: sources.join('\n'), timeoutMs: this.timeoutMs },
    );
    const parts = result.stdout.toString('utf-8').split(BATCH_DELIMITER);
    return sources.map((_, i) => (parts[i]?.includes('<svg') ? parts[i].trim() : ''));
  }

  private args(jarPath: string): string[] {
    return ['-Djava.awt.headless=true', '-jar', jarPath, '-pipe', '-tsvg', '-charset', 'UTF-8'];
  }

  private async cached(key: string): Promise<string | undefined> {
    const inMemory = this.memoryCache.get(key);
    if (inMemory) {
      return inMemory;
    }
    const onDisk = await this.options.diskCache?.get(key);
    if (onDisk) {
      this.memoryCache.set(key, onDisk);
    }
    return onDisk;
  }

  private async prepare(): Promise<Result<string>> {
    if (!this.javaChecked) {
      const check = await runProcess(this.java, ['-version'], { timeoutMs: 30_000 });
      if (check.failure || check.exitCode !== 0) {
        return fail('Java is not available. Please install Java to use PlantUML.');
      }
      // Only a successful check is remembered, so installing Java later works without reload
      this.javaChecked = true;
    }
    this.jarPath ??= findFirst(this.options.jarDirs.map((dir) => join(dir, JAR_FILENAME)));
    const jarPath = await this.jarPath;
    if (!jarPath) {
      this.jarPath = undefined;
      return fail(`PlantUML jar (${JAR_FILENAME}) not found. Reinstall the extension.`);
    }
    return ok(jarPath);
  }
}

function cacheKey(cwd: string, source: string): string {
  return createHash('sha256').update(cwd).update('\0').update(source).digest('hex').slice(0, 32);
}

async function findFirst(paths: readonly string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next location
    }
  }
  return null;
}
