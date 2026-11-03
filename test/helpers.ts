import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function fixture(name: string): string {
  return readFileSync(join(ROOT, 'test', 'fixtures', name), 'utf-8');
}

/** Outputs of the 0.0.19 build (plain JS) for the fixtures, kept to catch behavior changes. */
export interface Golden {
  readonly units: readonly { first: number; last: number }[];
  readonly directionLines: readonly number[];
  readonly reversedTb: string;
  readonly identityLr: string;
  readonly crlfLr: string;
  readonly shopScore: { crossings: number; width: number; height: number; entities: number };
  readonly brokenScore: null;
  readonly darkShop: string;
  readonly errors: readonly string[];
}

export const golden = JSON.parse(fixture('golden.json')) as Golden;
