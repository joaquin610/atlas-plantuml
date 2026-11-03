// Pure parts of the preview page; the DOM wiring is covered by page.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportScale } from '../../src/webview/exportPng.ts';
import { boxesIntersect, elementUid, formatJourney } from '../../src/webview/journeys.ts';
import { minimapScale, minimapViewRect } from '../../src/webview/minimap.ts';
import { focusSets } from '../../src/webview/relations.ts';
import { rankMatches } from '../../src/webview/search.ts';
import { planDetail, snapshotScale } from '../../src/webview/snapshot.ts';
import {
  centerContent,
  clampZoom,
  fitContent,
  isView,
  viewCenter,
  visibleRegion,
  wheelZoomFactor,
  zoomAround,
  zoomForBox,
} from '../../src/webview/viewport.ts';

const container = { width: 800, height: 600 };

describe('viewport', () => {
  it('keeps the anchor point in place when zooming', () => {
    const view = { zoom: 1, panX: 10, panY: 20 };
    const zoomed = zoomAround(view, 400, 300, 2);
    const before = { x: (400 - view.panX) / view.zoom, y: (300 - view.panY) / view.zoom };
    const after = { x: (400 - zoomed.panX) / zoomed.zoom, y: (300 - zoomed.panY) / zoomed.zoom };
    assert.deepEqual(after, before);
  });

  it('fits large diagrams and never enlarges small ones', () => {
    const fitted = fitContent(container, { width: 1520, height: 560 });
    assert.equal(fitted.zoom, 0.5);
    assert.deepEqual(fitContent(container, { width: 100, height: 100 }), {
      zoom: 1,
      panX: 350,
      panY: 250,
    });
  });

  it('centers, measures and clamps', () => {
    const view = centerContent(container, { width: 200, height: 100 }, 1);
    assert.deepEqual(viewCenter(container, view), { x: 100, y: 50 });
    assert.deepEqual(visibleRegion(container, { zoom: 2, panX: -100, panY: 0 }), {
      x0: 50,
      y0: -0,
      x1: 450,
      y1: 300,
    });
    assert.equal(clampZoom(50), 5);
    assert.equal(clampZoom(0), 0.1);
  });

  it('validates persisted views', () => {
    assert.ok(isView({ zoom: 1, panX: 0, panY: 0 }));
    assert.ok(!isView({ zoom: Number.NaN, panX: 0, panY: 0 }));
    assert.ok(!isView(null));
  });

  it('turns wheel deltas into bounded factors', () => {
    assert.equal(wheelZoomFactor(0, 0), 1);
    assert.ok(wheelZoomFactor(-100, 0) > 1);
    assert.equal(wheelZoomFactor(10_000, 0), 0.5);
    assert.ok(wheelZoomFactor(3, 1) < wheelZoomFactor(3, 0));
  });

  it('zooms search results to fit at most 80% of the screen', () => {
    assert.equal(zoomForBox(container, { width: 100, height: 50 }, 0.5), 0.8);
    assert.equal(zoomForBox(container, { width: 100, height: 50 }, 3), 2);
    assert.equal(zoomForBox(container, { width: 1600, height: 50 }, 1), 0.4);
  });
});

describe('snapshot plan', () => {
  const diagram = { width: 4000, height: 3000 };
  const base = {
    container,
    diagram,
    devicePixelRatio: 1,
    snapshotScale: snapshotScale(diagram),
    existing: null,
  };

  it('caps the full bitmap at 16M pixels', () => {
    assert.equal(snapshotScale({ width: 1000, height: 1000 }), 1);
    assert.ok(snapshotScale(diagram) * snapshotScale(diagram) * 12e6 <= 16e6 + 1);
  });

  it('draws the visible area plus margin when zoomed in', () => {
    const plan = planDetail({ ...base, view: { zoom: 2, panX: -2000, panY: -1000 } });
    assert.equal(plan.kind, 'draw');
    if (plan.kind === 'draw') {
      assert.deepEqual(
        [plan.area.x0, plan.area.y0, plan.area.x1, plan.area.y1],
        [800, 350, 1600, 950],
      );
      assert.equal(plan.area.scale, 3);
    }
  });

  it('keeps a detail that still covers the view', () => {
    const view = { zoom: 2, panX: -2000, panY: -1000 };
    const first = planDetail({ ...base, view });
    assert.equal(first.kind, 'draw');
    if (first.kind === 'draw') {
      const nudged = { ...view, panX: view.panX - 50 };
      assert.equal(planDetail({ ...base, view: nudged, existing: first.area }).kind, 'keep');
    }
  });

  it('skips the detail when zoomed out below the snapshot resolution', () => {
    assert.equal(planDetail({ ...base, view: { zoom: 0.1, panX: 0, panY: 0 } }).kind, 'remove');
  });

  it('limits PNG exports', () => {
    assert.equal(exportScale({ width: 100, height: 100 }), 2);
    assert.equal(exportScale({ width: 32768, height: 100 }), 0.5);
  });
});

describe('minimap', () => {
  it('fits in 220x160 and shows the visible part', () => {
    const diagram = { width: 2200, height: 800 };
    const scale = minimapScale(diagram);
    assert.equal(scale, 0.1);
    assert.deepEqual(minimapViewRect({ zoom: 1, panX: 0, panY: 0 }, container, diagram, scale), {
      left: 0,
      top: 0,
      width: 80,
      height: 60,
    });
    assert.equal(
      minimapViewRect({ zoom: 1, panX: 5000, panY: 0 }, container, diagram, scale),
      null,
    );
  });
});

describe('search ranking', () => {
  const targets = [
    { name: 'OrderLine', isPackage: false },
    { name: 'Order', isPackage: true },
    { name: 'PurchaseOrder', isPackage: false },
    { name: 'Order', isPackage: false },
    { name: 'Customer', isPackage: false },
  ];

  it('orders exact, prefix and substring matches, classes before packages', () => {
    assert.deepEqual(
      rankMatches(targets, ' order ').map((t) => `${t.name}${t.isPackage ? '/' : ''}`),
      ['Order', 'Order/', 'OrderLine', 'PurchaseOrder'],
    );
  });

  it('finds nothing for an empty query', () => {
    assert.deepEqual(rankMatches(targets, '  '), []);
  });
});

describe('relations focus', () => {
  const links = [
    { from: 'A', to: 'B' },
    { from: 'C', to: 'A' },
    { from: 'C', to: 'D' },
  ];

  it('keeps the focused entity, its neighbors and their links', () => {
    const focus = focusSets(links, 'A');
    assert.deepEqual([...focus.entities].sort(), ['A', 'B', 'C']);
    assert.deepEqual(focus.links, [true, true, false]);
  });

  it('shows everything without focus', () => {
    assert.deepEqual(focusSets(links, null).links, [true, true, true]);
  });
});

describe('journeys', () => {
  it('builds element ids', () => {
    assert.equal(elementUid({ entity: 'Order' }), 'Order');
    assert.equal(elementUid({ entity1: 'A', entity2: 'B' }), 'A->B');
    assert.equal(elementUid({ sourceLine: '7' }), '_7_');
    assert.equal(elementUid({}, 'id'), 'id');
  });

  it('formats a journey with 1-based lines', () => {
    const text = formatJourney(
      [
        { uid: 'A', lineNumber: 0 },
        { uid: 'A->B', lineNumber: 4 },
      ],
      'rename',
    );
    assert.equal(text, '<About Entities(A:1, A->B:5)>:rename');
  });

  it('detects rectangle overlap', () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    assert.ok(boxesIntersect(box, { x: 5, y: 5, width: 10, height: 10 }));
    assert.ok(!boxesIntersect(box, { x: 11, y: 0, width: 1, height: 1 }));
  });
});
