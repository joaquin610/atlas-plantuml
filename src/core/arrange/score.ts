import { isErrorRender } from '../plantuml/renderError.ts';
import { flattenPath, type Segment, segmentsCross, toSegments } from './geometry.ts';

export interface SvgScore {
  readonly crossings: number;
  readonly width: number;
  readonly height: number;
  readonly entities: number;
}

const WIDE_RATIO = 2;
const WIDE_PENALTY = 0.3;

interface Edge {
  readonly ends: readonly string[];
  readonly segments: readonly Segment[];
}

function parseEdges(svg: string): Edge[] {
  return svg
    .split(/<g class="link"/)
    .slice(1)
    .map((group) => {
      const ends = (/data-entity-1="([^"]*)"[^>]*data-entity-2="([^"]*)"/.exec(group) ?? []).slice(
        1,
      );
      const path = /<path[^>]*\sd="([^"]+)"/.exec(group.split('</g>')[0]);
      return { ends, segments: path ? toSegments(flattenPath(path[1])) : [] };
    });
}

/** Counts crossings between arrows that share no endpoint. Null for error or empty renders. */
export function scoreSvg(svg: string | undefined): SvgScore | null {
  if (!svg?.includes('<svg') || isErrorRender(svg)) {
    return null;
  }
  const size = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const edges = parseEdges(svg);
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].ends.some((end) => edges[j].ends.includes(end))) {
        continue;
      }
      for (const a of edges[i].segments) {
        for (const b of edges[j].segments) {
          if (segmentsCross(a, b)) {
            crossings++;
          }
        }
      }
    }
  }
  return {
    crossings,
    width: size ? Number(size[1]) : 0,
    height: size ? Number(size[2]) : 0,
    entities: (svg.match(/<g class="entity"/g) ?? []).length,
  };
}

/** Lower is better: crossings, penalized for shapes much wider or taller than 2:1. */
export function readability(score: SvgScore): number {
  const ratio = Math.max(score.width / score.height, score.height / score.width) || 1;
  return score.crossings * (1 + WIDE_PENALTY * Math.max(0, ratio - WIDE_RATIO));
}
