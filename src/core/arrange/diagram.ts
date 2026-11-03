import {
  detectEol,
  type Eol,
  findLastEnduml,
  findStartuml,
  splitLines,
} from '../plantuml/source.ts';
import { fail, ok, type Result } from '../result.ts';

const DECLARATION =
  /^\s*(package|namespace|abstract\s+class|class|abstract|interface|enum|entity|annotation|object|component|node|rectangle|frame|folder|cloud|database|card|artifact|storage|queue|stack|file|hexagon)\b/i;
const DIRECTION = /^\s*(left to right|top to bottom) direction\s*$/i;
const SAFE_PREPROCESSOR = /^\s*!(pragma|theme)\b/i;
const COMMENT = /^\s*'/;
const LR_DIRECTION = 'left to right direction';

export type Direction = 'tb' | 'lr';

/** A movable block: one top-level declaration with its body and the comments above it. */
export interface Unit {
  readonly first: number;
  readonly last: number;
}

export interface ParsedDiagram {
  readonly eol: Eol;
  readonly lines: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly units: readonly Unit[];
  readonly directionLines: ReadonlySet<number>;
}

function braceDelta(line: string): number {
  // Braces inside quotes do not count; "{static}" style modifiers balance on the same line
  const unquoted = line.replace(/"[^"]*"/g, '');
  return (unquoted.match(/\{/g) ?? []).length - (unquoted.match(/\}/g) ?? []).length;
}

/** Splits a diagram into movable units and fixed lines, or explains why it cannot. */
export function parseDiagram(text: string): Result<ParsedDiagram> {
  const lines = splitLines(text);
  const start = findStartuml(lines);
  const end = findLastEnduml(lines);
  if (start === -1 || end <= start) {
    return fail('The file needs @startuml and @enduml.');
  }
  const units: Unit[] = [];
  const directionLines = new Set<number>();
  let depth = 0;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (depth === 0) {
      if (/^\s*!/.test(line) && !SAFE_PREPROCESSOR.test(line)) {
        return fail(`Preprocessor directives (line ${i + 1}) are not supported by Arrange.`);
      }
      if (DIRECTION.test(line)) {
        directionLines.add(i);
        continue;
      }
      if (DECLARATION.test(line)) {
        let first = i;
        while (
          first - 1 > start &&
          COMMENT.test(lines[first - 1]) &&
          !units.some((unit) => unit.last === first - 1)
        ) {
          first--;
        }
        let last = i;
        let balance = braceDelta(line);
        while (balance > 0 && last + 1 < end) {
          last++;
          balance += braceDelta(lines[last]);
        }
        if (balance !== 0) {
          return fail(`Unbalanced braces in the declaration at line ${i + 1}.`);
        }
        units.push({ first, last });
        i = last;
        continue;
      }
    }
    depth = Math.max(0, depth + braceDelta(line));
  }
  if (units.length < 3) {
    return fail('There are not enough top-level declarations to rearrange.');
  }
  return ok({ eol: detectEol(text), lines, start, end, units, directionLines });
}

/** Rebuilds the text with the units in the given order and the given direction. */
export function buildCandidate(
  parsed: ParsedDiagram,
  order: readonly number[],
  direction: Direction,
): string {
  const { eol, lines, end, units, directionLines } = parsed;
  const slotByFirstLine = new Map(units.map((unit, slot) => [unit.first, slot]));
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const slot = slotByFirstLine.get(i);
    if (slot !== undefined) {
      const unit = units[order[slot]];
      out.push(...lines.slice(unit.first, unit.last + 1));
      i = units[slot].last;
      continue;
    }
    if (directionLines.has(i)) {
      continue;
    }
    // In the header it lays out differently (and worse) than right before @enduml
    if (i === end && direction === 'lr') {
      out.push(LR_DIRECTION);
    }
    out.push(lines[i]);
  }
  return out.join(eol);
}

/** True when both texts have the same lines in any order, ignoring direction lines. */
export function sameContent(a: string, b: string): boolean {
  const normalize = (text: string) =>
    splitLines(text)
      .map((line) => line.trim())
      .filter((line) => line && !DIRECTION.test(line))
      .sort()
      .join('\n');
  return normalize(a) === normalize(b);
}
