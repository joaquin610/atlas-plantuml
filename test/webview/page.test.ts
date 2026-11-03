// End-to-end check of the preview page in a headless Chromium browser (Edge or Chrome).
// It loads the built bundle with a real PlantUML SVG, clicks through the main features and
// reads the results from the page. Skipped when no browser is found; run `pnpm run build` first.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { fillTemplate, toScriptJson } from '../../src/core/html.ts';
import { LAYOUTS } from '../../src/core/plantuml/layouts.ts';
import type { PreviewInit } from '../../src/shared/messages.ts';
import { fixture, ROOT } from '../helpers.ts';

const BROWSERS = [
  process.env.ATLAS_PLANTUML_TEST_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = BROWSERS.find((path) => path && existsSync(path));
const bundle = join(ROOT, 'out', 'webview.js');
const skip = !browser
  ? 'No Chromium browser found'
  : !existsSync(bundle)
    ? 'Run pnpm run build'
    : false;

// Runs inside the page: fake VS Code API, frames on timers (headless virtual time does not
// advance requestAnimationFrame) and a probe that writes its findings to #probeResult.
const STUB = `
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.__messages = [];
window.__state = undefined;
window.acquireVsCodeApi = () => ({
  postMessage: (m) => window.__messages.push(m),
  getState: () => window.__state,
  setState: (s) => { window.__state = s; },
});
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
`;

const PROBE = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const sent = (type) => window.__messages.filter((m) => m.type === type);
(async () => {
  const r = {};
  await wait(900);
  r.snapshotReady = document.body.classList.contains('snapshot-ready');
  r.zoomBefore = $('#zoomLevel').textContent;
  $('#zoomIn').click();
  await wait(100);
  r.zoomAfter = $('#zoomLevel').textContent;
  await wait(400);
  r.savedView = !!(window.__state && window.__state.view);
  const input = $('#searchInput');
  input.value = 'order';
  input.dispatchEvent(new Event('input'));
  await wait(50);
  r.searchCount = $('#searchCount').textContent;
  r.searchHighlight = !!$('#searchHighlight');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  $('#minimapButton').click();
  r.minimapHidden = document.body.classList.contains('minimap-hidden');
  r.journeysHidden = document.body.classList.contains('journeys-hidden');
  const customer = $('g.entity[data-entity="Customer"]');
  customer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(400);
  r.dimmed = [...document.querySelectorAll('g.entity')].filter((g) => g.style.opacity === '0.15').length;
  customer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  r.reveal = sent('revealSource')[0] || null;
  const exportSelect = $('#exportSelect');
  exportSelect.value = 'svg';
  exportSelect.dispatchEvent(new Event('change'));
  r.exported = sent('exportImage').map((m) => m.format);
  const layout = $('#layoutSelect');
  r.layoutOptions = layout.options.length;
  layout.value = '2';
  layout.dispatchEvent(new Event('change'));
  r.layoutMessage = sent('setLayout')[0] || null;
  $('#darkModeButton').click();
  r.darkMessage = sent('setDark')[0] || null;
  r.arrangeOptions = $('#arrangeSelect').options.length;
  r.arranging = document.body.classList.contains('arranging');
  r.errors = window.__errors;
  const out = document.createElement('pre');
  out.id = 'probeResult';
  out.textContent = JSON.stringify(r);
  document.body.appendChild(out);
})().catch((e) => { window.__errors.push(String(e)); });
`;

interface ProbeResult {
  snapshotReady: boolean;
  zoomBefore: string;
  zoomAfter: string;
  savedView: boolean;
  searchCount: string;
  searchHighlight: boolean;
  minimapHidden: boolean;
  journeysHidden: boolean;
  dimmed: number;
  reveal: { type: string; line: number; name: string } | null;
  exported: string[];
  layoutOptions: number;
  layoutMessage: { index: number } | null;
  darkMessage: { dark: boolean } | null;
  arrangeOptions: number;
  arranging: boolean;
  errors: string[];
}

describe('preview page (headless browser)', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-plantuml-page-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  function runPage(name: string, init: PreviewInit): ProbeResult {
    const page = fillTemplate(readFileSync(join(ROOT, 'media', 'preview.html'), 'utf-8'), {
      csp: "default-src * 'unsafe-inline' blob: data:",
      nonce: '',
      styleUri: pathToFileURL(join(ROOT, 'media', 'preview.css')).href,
      scriptUri: pathToFileURL(bundle).href,
      init: toScriptJson(init),
      svg: fixture('shop.svg'),
    })
      .replace('<head>', `<head><script>${STUB}</script>`)
      .replace('</body>', `<script>${PROBE}</script></body>`);
    const file = join(dir, `${name}.html`);
    writeFileSync(file, page);
    const result = spawnSync(
      browser as string,
      [
        '--headless=new',
        // Linux CI runners block the Chromium sandbox
        ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        '--disable-gpu',
        '--no-first-run',
        '--allow-file-access-from-files',
        `--user-data-dir=${join(dir, `profile-${name}`)}`,
        '--window-size=1200,800',
        '--virtual-time-budget=8000',
        '--dump-dom',
        pathToFileURL(file).href,
      ],
      { encoding: 'utf-8', timeout: 60_000 },
    );
    const match = /<pre id="probeResult">([^<]*)<\/pre>/.exec(result.stdout);
    assert.ok(match, `probe did not finish: ${result.stderr.slice(0, 500)}`);
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as ProbeResult;
  }

  const init: PreviewInit = {
    dark: false,
    layouts: LAYOUTS.map((layout) => layout.label),
    layoutIndex: 0,
    arrange: null,
  };

  it('works end to end with a real diagram', () => {
    const r = runPage('default', init);
    assert.deepEqual(r.errors, []);
    assert.ok(r.snapshotReady, 'zoom snapshot built');
    assert.equal(r.zoomBefore, '100%');
    assert.equal(r.zoomAfter, '120%');
    assert.ok(r.savedView, 'view persisted');
    assert.match(r.searchCount, /^1\/\d+$/);
    assert.ok(r.searchHighlight);
    assert.ok(r.minimapHidden);
    assert.ok(r.journeysHidden, 'Journeys hidden by default');
    assert.ok(r.dimmed > 0, 'relations focus dims unrelated classes');
    assert.equal(r.reveal?.name, 'Customer');
    assert.ok(Number.isFinite(r.reveal?.line));
    assert.deepEqual(r.exported, ['svg']);
    assert.equal(r.layoutOptions, LAYOUTS.length);
    assert.deepEqual(r.layoutMessage, { type: 'setLayout', index: 2 });
    assert.deepEqual(r.darkMessage, { type: 'setDark', dark: true });
    assert.equal(r.arranging, false);
  });

  it('shows the Arrange preview controls', () => {
    const r = runPage('arrange', {
      ...init,
      dark: true,
      arrange: {
        baseline: 9,
        selected: 1,
        options: [
          { crossings: 3, direction: 'tb' },
          { crossings: 4, direction: 'lr' },
        ],
      },
    });
    assert.deepEqual(r.errors, []);
    assert.ok(r.arranging);
    assert.equal(r.arrangeOptions, 2);
  });
});
