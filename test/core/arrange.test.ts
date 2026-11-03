import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { arrange, type BatchRenderer } from '../../src/core/arrange/arrange.ts';
import { fixture } from '../helpers.ts';

const shop = fixture('shop.puml');

/** Fake renderer: crossings depend on the position of "class Order" and the direction. */
function fakeRenderer(): { render: BatchRenderer; calls: number[] } {
  const calls: number[] = [];
  const render: BatchRenderer = async (sources) => {
    calls.push(sources.length);
    return sources.map((source) => {
      const position = source.indexOf('class Order {');
      const crossings = Math.round(position / 100) + (source.includes('left to right') ? 0 : 1);
      const links = Array.from(
        { length: crossings },
        (_, i) =>
          `<g class="link" data-entity-1="a${i}" data-entity-2="b${i}"><path d="M0,${i} L10,${i + 10}"/></g>` +
          `<g class="link" data-entity-1="c${i}" data-entity-2="d${i}"><path d="M0,${i + 10} L10,${i}"/></g>`,
      );
      return `<svg viewBox="0 0 100 100">${links.join('')}<g class="entity"/></svg>`;
    });
  };
  return { render, calls };
}

describe('arrange', () => {
  it('returns better options, best first, without duplicates', async () => {
    const { render } = fakeRenderer();
    const outcome = await arrange({ text: shop, renderBatch: render, seed: 1 });
    assert.equal(outcome.kind, 'done');
    if (outcome.kind !== 'done') {
      return;
    }
    assert.ok(outcome.options.length > 0 && outcome.options.length <= 3);
    const scores = outcome.options.map((option) => option.score);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => a - b),
    );
    for (const option of outcome.options) {
      assert.ok(option.score < outcome.baseline.score);
    }
  });

  it('offers the other direction among the options', async () => {
    const { render } = fakeRenderer();
    const outcome = await arrange({ text: shop, renderBatch: render, seed: 1 });
    assert.equal(outcome.kind, 'done');
    if (outcome.kind === 'done' && outcome.options.length > 1) {
      const directions = new Set(outcome.options.map((option) => option.direction));
      assert.equal(directions.size, 2);
    }
  });

  it('is reproducible with the same seed', async () => {
    const first = await arrange({ text: shop, renderBatch: fakeRenderer().render, seed: 7 });
    const second = await arrange({ text: shop, renderBatch: fakeRenderer().render, seed: 7 });
    assert.deepEqual(first, second);
  });

  it('renders the candidates in batches', async () => {
    const { render, calls } = fakeRenderer();
    await arrange({ text: shop, renderBatch: render, seed: 1, trials: 5, batchSize: 4 });
    // Baseline alone, then 12 candidates (6 orders x 2 directions) in batches of 4
    assert.deepEqual(calls, [1, 4, 4, 4]);
  });

  it('rejects candidates that lose elements', async () => {
    const render: BatchRenderer = async (sources) =>
      sources.map((_, i) =>
        i === 0 && sources.length === 1
          ? '<svg viewBox="0 0 10 10"><g class="link" data-entity-1="a" data-entity-2="b"><path d="M0,0 L10,10"/></g><g class="link" data-entity-1="c" data-entity-2="d"><path d="M0,10 L10,0"/></g><g class="entity"/><g class="entity"/></svg>'
          : '<svg viewBox="0 0 10 10"><g class="entity"/></svg>',
      );
    const outcome = await arrange({ text: shop, renderBatch: render, seed: 1 });
    assert.deepEqual(outcome.kind === 'done' && outcome.options, []);
  });

  it('explains why a diagram cannot be arranged', async () => {
    const outcome = await arrange({ text: 'class A', renderBatch: fakeRenderer().render });
    assert.deepEqual(outcome, { kind: 'error', error: 'The file needs @startuml and @enduml.' });
  });

  it('asks to fix the diagram when the current render fails', async () => {
    const outcome = await arrange({ text: shop, renderBatch: async (s) => s.map(() => '') });
    assert.deepEqual(outcome, {
      kind: 'error',
      error: 'Fix the diagram errors before arranging it.',
    });
  });

  it('stops when cancelled', async () => {
    let cancelled = false;
    const { render } = fakeRenderer();
    const outcome = await arrange({
      text: shop,
      renderBatch: async (sources) => {
        cancelled = true;
        return render(sources);
      },
      isCancelled: () => cancelled,
    });
    assert.deepEqual(outcome, { kind: 'cancelled' });
  });

  it('reports progress up to the total', async () => {
    const progress: [number, number][] = [];
    await arrange({
      text: shop,
      renderBatch: fakeRenderer().render,
      seed: 1,
      trials: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    assert.deepEqual(progress.at(-1), [6, 6]);
  });
});
