export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];

const CURVE_STEP = 0.125;
const ENDPOINT_MARGIN = 0.02;

/** Approximates an SVG path (M, L and C commands) with points; curves are sampled. */
export function flattenPath(d: string): Point[] {
  const tokens = d.match(/[MLCQHVZmlcqhvz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Point[] = [];
  let i = 0;
  let command: string | null = null;
  let x = 0;
  let y = 0;
  const next = () => Number.parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      command = tokens[i++];
    }
    if (command === 'M' || command === 'L') {
      x = next();
      y = next();
      points.push([x, y]);
    } else if (command === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [next(), next(), next(), next(), next(), next()];
      for (let t = CURVE_STEP; t <= 1; t += CURVE_STEP) {
        const u = 1 - t;
        points.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else {
      i++;
    }
  }
  return points;
}

/** Proper crossing: touching near either end does not count. */
export function segmentsCross(
  [[x1, y1], [x2, y2]]: Segment,
  [[x3, y3], [x4, y4]]: Segment,
): boolean {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) {
    return false;
  }
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  const inside = (value: number) => value > ENDPOINT_MARGIN && value < 1 - ENDPOINT_MARGIN;
  return inside(t) && inside(u);
}

export function toSegments(points: readonly Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let k = 1; k < points.length; k++) {
    segments.push([points[k - 1], points[k]]);
  }
  return segments;
}
