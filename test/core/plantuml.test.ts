import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { isLayoutIndex, LAYOUTS, stepLayout } from '../../src/core/plantuml/layouts.ts';
import { isErrorRender, parseRenderError } from '../../src/core/plantuml/renderError.ts';
import { hasIncludes, injectBeforeEnduml } from '../../src/core/plantuml/source.ts';
import { toDarkSvg } from '../../src/core/svg/darkTheme.ts';
import { fixture, golden } from '../helpers.ts';

describe('injectBeforeEnduml', () => {
  it('inserts the directive lines before the last @enduml', () => {
    const result = injectBeforeEnduml('@startuml\nclass A\n@enduml\n', 'a\nb');
    assert.deepEqual(result, { ok: true, value: '@startuml\nclass A\na\nb\n@enduml\n' });
  });

  it('fails without @enduml', () => {
    assert.deepEqual(injectBeforeEnduml('class A', 'x'), {
      ok: false,
      error: 'No @enduml found in file',
    });
  });
});

describe('hasIncludes', () => {
  it('detects !include lines only', () => {
    assert.ok(hasIncludes('@startuml\n  !include common.puml\n@enduml'));
    assert.ok(!hasIncludes("@startuml\n' !include in a comment is still a line start\n@enduml"));
  });
});

describe('layouts', () => {
  it('starts with the default layout, which injects nothing', () => {
    assert.deepEqual(LAYOUTS[0], { label: 'Default', directive: '' });
  });

  it('validates and cycles indexes', () => {
    assert.ok(isLayoutIndex(LAYOUTS.length - 1));
    assert.ok(!isLayoutIndex(LAYOUTS.length));
    assert.ok(!isLayoutIndex(1.5));
    assert.equal(stepLayout(0, -1), LAYOUTS.length - 1);
    assert.equal(stepLayout(LAYOUTS.length - 1, 1), 0);
  });
});

describe('render errors', () => {
  it('reads the line and message from a PlantUML error render', () => {
    const svg = fixture('broken.svg');
    assert.ok(isErrorRender(svg));
    assert.deepEqual(parseRenderError(svg), {
      line: 3,
      message: 'Syntax Error? (Assumed diagram type: class)',
    });
  });

  it('returns null for a valid render', () => {
    assert.equal(parseRenderError(fixture('shop.svg')), null);
  });

  it('decodes entities and falls back to a generic message', () => {
    assert.deepEqual(parseRenderError('[From x (line 2)] Syntax Error? a &lt;b&gt; &amp;<'), {
      line: 2,
      message: 'Syntax Error? a <b> &',
    });
    assert.equal(
      parseRenderError('[From x (line 2)]')?.message,
      'PlantUML could not render this line',
    );
  });
});

describe('toDarkSvg', () => {
  it('produces the same output as the 0.0.19 build', () => {
    const dark = toDarkSvg(fixture('shop.svg'));
    assert.equal(createHash('sha256').update(dark).digest('hex'), golden.darkShop);
  });

  it('maps default colors and keeps custom ones', () => {
    const svg =
      '<svg style="background:#FFFFFF"><rect fill="#F1F1F1" stroke="#181818"/><rect fill="#123456"/></svg>';
    assert.equal(
      toDarkSvg(svg),
      '<svg style="background:#1E1E1E"><rect fill="#2D2D30" stroke="#9DA5B4"/><rect fill="#123456"/></svg>',
    );
  });

  it('only changes colors, so the layout is the same', () => {
    const light = fixture('shop.svg');
    const strip = (svg: string) => svg.replace(/#[0-9A-Fa-f]{6}/g, '#');
    assert.equal(strip(toDarkSvg(light)), strip(light));
  });
});
