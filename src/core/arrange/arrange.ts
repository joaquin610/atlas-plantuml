import { buildCandidate, type Direction, parseDiagram, sameContent } from './diagram.ts';
import { seededRandom, shuffled } from './random.ts';
import { readability, type SvgScore, scoreSvg } from './score.ts';

/** Renders several PlantUML texts; resolves to one SVG per text, '' for any that failed. */
export type BatchRenderer = (sources: readonly string[]) => Promise<readonly string[]>;

export interface ScoredLayout extends SvgScore {
  readonly score: number;
}

export interface ArrangeCandidate extends ScoredLayout {
  readonly source: string;
  readonly svg: string;
  readonly direction: Direction;
}

export type ArrangeOutcome =
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'done';
      readonly baseline: ScoredLayout;
      readonly options: readonly ArrangeCandidate[];
    };

export interface ArrangeRequest {
  readonly text: string;
  readonly renderBatch: BatchRenderer;
  readonly trials?: number;
  readonly keep?: number;
  readonly concurrency?: number;
  readonly batchSize?: number;
  readonly seed?: number;
  readonly onProgress?: (done: number, total: number) => void;
  readonly isCancelled?: () => boolean;
}

const DIRECTIONS: readonly Direction[] = ['tb', 'lr'];

interface Job {
  readonly source: string;
  readonly direction: Direction;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Up to `keep` distinct options: best overall, best in the other direction, then the rest. */
function pickOptions(better: readonly ArrangeCandidate[], keep: number): ArrangeCandidate[] {
  const options: ArrangeCandidate[] = [];
  const add = (candidate: ArrangeCandidate | undefined) => {
    if (!candidate || options.length >= keep) {
      return;
    }
    const duplicate = options.some(
      (o) =>
        o.crossings === candidate.crossings &&
        o.width === candidate.width &&
        o.height === candidate.height,
    );
    if (!duplicate) {
      options.push(candidate);
    }
  };
  if (better.length > 0) {
    add(better[0]);
    add(better.find((candidate) => candidate.direction !== better[0].direction));
    better.forEach(add);
  }
  return options;
}

/**
 * Searches declaration orders and directions with fewer arrow crossings. Only whole top-level
 * declarations move, and every candidate keeps the same lines and the same elements.
 */
export async function arrange(request: ArrangeRequest): Promise<ArrangeOutcome> {
  const {
    text,
    renderBatch,
    trials = 24,
    keep = 3,
    concurrency = 4,
    batchSize = 6,
    seed = Date.now(),
    onProgress,
    isCancelled = () => false,
  } = request;
  const parsed = parseDiagram(text);
  if (!parsed.ok) {
    return { kind: 'error', error: parsed.error };
  }
  const baselineScore = scoreSvg((await renderBatch([text]))[0]);
  if (!baselineScore) {
    return { kind: 'error', error: 'Fix the diagram errors before arranging it.' };
  }
  const baseline: ScoredLayout = { ...baselineScore, score: readability(baselineScore) };

  const random = seededRandom(seed);
  const identity = parsed.value.units.map((_, i) => i);
  const orders = [identity, ...Array.from({ length: trials }, () => shuffled(identity, random))];
  const jobs: Job[] = orders
    .flatMap((order) =>
      DIRECTIONS.map((direction) => ({
        source: buildCandidate(parsed.value, order, direction),
        direction,
      })),
    )
    .filter((job) => sameContent(text, job.source));

  // Several candidates per PlantUML process: JVM startup dominates single renders
  const batches = chunk(jobs, batchSize);
  const results: ArrangeCandidate[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < batches.length && !isCancelled()) {
      const batch = batches[next++];
      const svgs = await renderBatch(batch.map((job) => job.source));
      batch.forEach((job, k) => {
        const score = scoreSvg(svgs[k]);
        // A render that lost elements (e.g. a note moved above its target) is not equivalent
        if (score && score.entities === baseline.entities) {
          results.push({ ...job, ...score, svg: svgs[k], score: readability(score) });
        }
      });
      done += batch.length;
      onProgress?.(done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (isCancelled()) {
    return { kind: 'cancelled' };
  }
  const better = results
    .filter((candidate) => candidate.score < baseline.score)
    .sort((a, b) => a.score - b.score || a.width * a.height - b.width * b.height);
  return { kind: 'done', baseline, options: pickOptions(better, keep) };
}
