import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenPath, segmentsCross } from '../../src/core/arrange/geometry.ts';
import { readability, scoreSvg } from '../../src/core/arrange/score.ts';
import { fixture, golden } from '../helpers.ts';

function link(from: string, to: string, d: string): string {
  return `<g class="link" data-entity-1="${from}" data-entity-2="${to}"><path d="${d}"/></g>`;
}

function svg(...links: string[]): string {
  return `<svg viewBox="0 0 100 50">${links.join('')}<g class="entity"/><g class="entity"/></svg>`;
}

describe('scoreSvg', () => {
  it('matches the 0.0.19 score of a real render', () => {
    assert.deepEqual(scoreSvg(fixture('shop.svg')), golden.shopScore);
  });

  it('returns null for error renders and empty output', () => {
    assert.equal(scoreSvg(fixture('broken.svg')), golden.brokenScore);
    assert.equal(scoreSvg(''), null);
    assert.equal(scoreSvg(undefined), null);
  });

  it('counts a crossing between unrelated arrows', () => {
    const result = scoreSvg(svg(link('A', 'B', 'M0,0 L10,10'), link('C', 'D', 'M0,10 L10,0')));
    assert.deepEqual(result, { crossings: 1, width: 100, height: 50, entities: 2 });
  });

  it('ignores arrows that share an endpoint', () => {
    const result = scoreSvg(svg(link('A', 'B', 'M0,0 L10,10'), link('A', 'D', 'M0,10 L10,0')));
    assert.equal(result?.crossings, 0);
  });
});

describe('geometry', () => {
  it('samples cubic curves into 8 points', () => {
    const points = flattenPath('M0,0 C0,10 10,10 10,0');
    assert.equal(points.length, 9);
    assert.deepEqual(points.at(-1), [10, 0]);
  });

  it('does not count touching at the ends as crossing', () => {
    assert.equal(
      segmentsCross(
        [
          [0, 0],
          [10, 0],
        ],
        [
          [10, 0],
          [10, 10],
        ],
      ),
      false,
    );
    assert.equal(
      segmentsCross(
        [
          [0, 0],
          [10, 10],
        ],
        [
          [0, 10],
          [10, 0],
        ],
      ),
      true,
    );
  });
});

describe('readability', () => {
  it('is the crossing count for shapes up to 2:1', () => {
    assert.equal(readability({ crossings: 10, width: 200, height: 100, entities: 0 }), 10);
  });

  it('penalizes wide strips', () => {
    assert.equal(readability({ crossings: 10, width: 400, height: 100, entities: 0 }), 16);
  });
});
