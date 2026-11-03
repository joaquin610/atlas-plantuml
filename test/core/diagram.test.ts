import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCandidate, parseDiagram, sameContent } from '../../src/core/arrange/diagram.ts';
import { fixture, golden } from '../helpers.ts';

const shop = fixture('shop.puml');

function parsed(text: string) {
  const result = parseDiagram(text);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

describe('parseDiagram', () => {
  it('finds the same movable units as the 0.0.19 build', () => {
    const diagram = parsed(shop);
    assert.deepEqual(diagram.units, golden.units);
    assert.deepEqual([...diagram.directionLines], golden.directionLines);
  });

  it('keeps the comment above a declaration with it', () => {
    const diagram = parsed(shop);
    const commented = diagram.units.find((unit) => diagram.lines[unit.first].startsWith("'"));
    assert.ok(commented, 'a unit should start at its comment');
    assert.match(diagram.lines[commented.first + 1], /class Order/);
  });

  it('rejects the same inputs, with the same messages, as the 0.0.19 build', () => {
    const inputs = [
      '@startuml\nclass A\n@enduml',
      'class A',
      '@startuml\n!include x.puml\nclass A\nclass B\nclass C\n@enduml',
      '@startuml\nclass A {\nclass B\nclass C\n@enduml',
    ];
    const errors = inputs.map((text) => {
      const result = parseDiagram(text);
      return result.ok ? null : result.error;
    });
    assert.deepEqual(errors, golden.errors);
  });

  it('allows !pragma and !theme', () => {
    const text =
      '@startuml\n!theme plain\n!pragma layout smetana\nclass A\nclass B\nclass C\n@enduml';
    assert.equal(parseDiagram(text).ok, true);
  });

  it('ignores braces inside quotes', () => {
    const text = '@startuml\nclass A {\n  +name: "{x"\n}\nclass B\nclass C\n@enduml';
    assert.deepEqual(parsed(text).units[0], { first: 1, last: 3 });
  });
});

describe('buildCandidate', () => {
  it('matches the 0.0.19 output for a reversed order', () => {
    const diagram = parsed(shop);
    const reversed = diagram.units.map((_, i) => i).reverse();
    assert.equal(buildCandidate(diagram, reversed, 'tb'), golden.reversedTb);
  });

  it('puts left to right right before @enduml', () => {
    const diagram = parsed(shop);
    const identity = diagram.units.map((_, i) => i);
    const text = buildCandidate(diagram, identity, 'lr');
    assert.equal(text, golden.identityLr);
    assert.match(text, /left to right direction\n@enduml/);
  });

  it('keeps CRLF line endings', () => {
    const diagram = parsed(shop.replace(/\n/g, '\r\n'));
    const text = buildCandidate(
      diagram,
      diagram.units.map((_, i) => i),
      'lr',
    );
    assert.equal(text, golden.crlfLr);
    assert.ok(!/[^\r]\n/.test(text));
  });

  it('drops existing direction lines and adds them back only for lr', () => {
    const text = shop.replace('@enduml', 'left to right direction\n@enduml');
    const diagram = parsed(text);
    const identity = diagram.units.map((_, i) => i);
    assert.doesNotMatch(buildCandidate(diagram, identity, 'tb'), /direction/);
    assert.equal(buildCandidate(diagram, identity, 'lr').match(/direction/g)?.length, 1);
  });
});

describe('sameContent', () => {
  it('accepts reordered lines and different directions', () => {
    assert.ok(sameContent('a\nb\nleft to right direction', 'b\na'));
  });

  it('rejects lost or changed lines', () => {
    assert.ok(!sameContent('a\nb', 'a'));
    assert.ok(!sameContent('a\nb', 'a\nc'));
  });
});
