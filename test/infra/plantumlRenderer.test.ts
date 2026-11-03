// Integration test: runs the bundled PlantUML jar. Skipped when Java is not installed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseRenderError } from '../../src/core/plantuml/renderError.ts';
import { PlantUmlRenderer } from '../../src/infra/plantuml/plantumlRenderer.ts';
import { fixture, ROOT } from '../helpers.ts';

const hasJava = spawnSync('java', ['-version']).status === 0;
const cwd = join(ROOT, 'test', 'fixtures');

describe('PlantUmlRenderer (Java)', { skip: hasJava ? false : 'Java is not installed' }, () => {
  const renderer = new PlantUmlRenderer({ jarDirs: [ROOT] });

  it('renders a diagram to SVG', async () => {
    const result = await renderer.render(fixture('shop.puml'), cwd);
    assert.ok(result.ok);
    assert.match(result.value, /<svg[\s\S]*data-entity="Order"/);
  });

  it('returns the error render for invalid diagrams, with the failing line', async () => {
    const result = await renderer.render(fixture('broken.puml'), cwd);
    assert.ok(result.ok);
    assert.equal(parseRenderError(result.value)?.line, 3);
  });

  it('renders a batch in one process, in order', async () => {
    const svgs = await renderer.renderBatch(
      ['@startuml\nclass First\n@enduml', '@startuml\nclass Second\n@enduml'],
      cwd,
    );
    assert.equal(svgs.length, 2);
    assert.match(svgs[0], /First/);
    assert.match(svgs[1], /Second/);
  });

  it('explains a missing jar', async () => {
    const missing = new PlantUmlRenderer({ jarDirs: [cwd] });
    const result = await missing.render('@startuml\nclass A\n@enduml', cwd);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.error, /jar .* not found/);
  });
});

describe('PlantUmlRenderer without Java', () => {
  it('explains that Java is missing', async () => {
    const renderer = new PlantUmlRenderer({ jarDirs: [ROOT], java: 'java-that-does-not-exist' });
    const result = await renderer.render('@startuml\nclass A\n@enduml', cwd);
    assert.deepEqual(result, {
      ok: false,
      error: 'Java is not available. Please install Java to use PlantUML.',
    });
    assert.deepEqual(await renderer.renderBatch(['a', 'b'], cwd), ['', '']);
  });
});
