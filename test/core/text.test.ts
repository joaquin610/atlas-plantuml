import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeHtml, fillTemplate, toScriptJson } from '../../src/core/html.ts';
import { locateDeclarationLine } from '../../src/core/source/locateDeclaration.ts';

describe('locateDeclarationLine', () => {
  const lines = [
    '@startuml', // 0
    'class WorkerId', // 1
    'class Worker {', // 2
    '}', // 3
    'Worker --> WorkerId', // 4
    '@enduml', // 5
  ];

  it('prefers the declaration over a longer name that contains it', () => {
    assert.equal(locateDeclarationLine(lines, 1, 'Worker'), 2);
  });

  it('falls back to a whole-word mention nearby', () => {
    const relation = ['a', 'b', 'x --> Thing', 'c'];
    assert.equal(locateDeclarationLine(relation, 0, 'Thing'), 2);
  });

  it('keeps the given line when the name is not nearby or missing', () => {
    assert.equal(locateDeclarationLine(lines, 5, 'Missing'), 5);
    assert.equal(locateDeclarationLine(lines, 4, ''), 4);
  });

  it('clamps out-of-range and invalid lines', () => {
    assert.equal(locateDeclarationLine(lines, 99), 5);
    assert.equal(locateDeclarationLine(lines, -4), 0);
    assert.equal(locateDeclarationLine(lines, Number.NaN), 0);
  });

  it('treats regex characters in names literally', () => {
    assert.equal(locateDeclarationLine(['x', 'class A.B', 'class AxB'], 2, 'A.B'), 1);
  });
});

describe('html helpers', () => {
  it('escapes HTML special characters', () => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;',
    );
  });

  it('fills tokens in one pass, without expanding tokens inside values', () => {
    const page = fillTemplate('<p>{{a}}</p><p>{{b}}</p>{{unknown}}', { a: '{{b}}', b: '$&' });
    assert.equal(page, '<p>{{b}}</p><p>$&</p>{{unknown}}');
  });

  it('produces JSON that cannot close a script element', () => {
    const json = toScriptJson({ text: '</script><script>alert(1)</script>' });
    assert.ok(!json.includes('<'));
    assert.deepEqual(JSON.parse(json), { text: '</script><script>alert(1)</script>' });
  });
});
