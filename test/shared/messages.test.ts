import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWebviewMessage } from '../../src/shared/messages.ts';

describe('parseWebviewMessage', () => {
  it('accepts well-formed messages', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'reload', extra: 1 }), { type: 'reload' });
    assert.deepEqual(parseWebviewMessage({ type: 'setLayout', index: 2 }), {
      type: 'setLayout',
      index: 2,
    });
    assert.deepEqual(parseWebviewMessage({ type: 'exportImage', format: 'png', data: 'AA==' }), {
      type: 'exportImage',
      format: 'png',
      data: 'AA==',
    });
    assert.deepEqual(parseWebviewMessage({ type: 'revealSource', line: 4 }), {
      type: 'revealSource',
      line: 4,
      name: '',
    });
  });

  it('normalizes loose values', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'cycleLayout', step: 5 }), {
      type: 'cycleLayout',
      step: 1,
    });
    assert.deepEqual(parseWebviewMessage({ type: 'setDark', dark: 'yes' }), {
      type: 'setDark',
      dark: false,
    });
  });

  it('rejects malformed messages', () => {
    for (const raw of [
      null,
      'reload',
      {},
      { type: 'unknown' },
      { type: 'setLayout', index: '1' },
      { type: 'arrangeSelect', index: 1.5 },
      { type: 'exportImage', format: 'png' },
      { type: 'exportImage', format: 'gif' },
      { type: 'revealSource', line: 'x' },
      { type: 'copyJourneysToClipboard' },
    ]) {
      assert.equal(parseWebviewMessage(raw), null, JSON.stringify(raw));
    }
  });
});
