// Preview page entry point: builds the parts and connects them. Logic lives in the modules.
import { renderPngBase64 } from './exportPng.ts';
import { byId, createHost, type Host, readInit } from './host.ts';
import { Journeys } from './journeys.ts';
import { Minimap } from './minimap.ts';
import { setupRelations } from './relations.ts';
import { Search } from './search.ts';
import { ZoomSnapshot } from './snapshot.ts';
import { diagramBackground } from './svgImage.ts';
import { setupExtensionControls, setupPanelToggle } from './toolbar.ts';
import { ViewController } from './viewController.ts';
import { isView, type View, wheelZoomFactor } from './viewport.ts';

const SAVE_VIEW_DELAY_MS = 300;
const FIRST_SNAPSHOT_DELAY_MS = 300;

function main(): void {
  const host = createHost();
  const init = readInit();
  setupExtensionControls(host, init);
  setupPanelToggle(host, 'minimapHidden', 'minimap-hidden', byId('minimapButton'), false);
  const setJourneysHidden = setupPanelToggle(
    host,
    'journeysHidden',
    'journeys-hidden',
    byId('toggleJourneysButton'),
    true,
  );
  byId('closeJourneysButton').addEventListener('click', () => setJourneysHidden(true));
  alignPanelsToToolbar();
  window.addEventListener('resize', alignPanelsToToolbar);

  const svg = document.querySelector<SVGSVGElement>('.svg-wrapper svg');
  if (!svg) {
    return;
  }
  const container = byId('previewContainer');
  const wrapper = byId('svgWrapper');
  const background = diagramBackground(svg);

  let snapshot: ZoomSnapshot | undefined;
  let minimap: Minimap | undefined;
  let saveTimer = 0;
  const view = new ViewController(
    { container, wrapper, zoomLabel: byId('zoomLevel') },
    {
      onChange: (current) => {
        snapshot?.scheduleDetail();
        minimap?.update(current);
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => host.patchState({ view: current }), SAVE_VIEW_DELAY_MS);
      },
      onInteractionStart: () => snapshot?.cancelDetail(),
      onRest: () => snapshot?.scheduleDetail(),
    },
  );
  minimap = new Minimap(
    {
      root: byId('minimap'),
      canvas: byId<HTMLCanvasElement>('minimapCanvas'),
      viewBox: byId('minimapView'),
    },
    view,
  );
  const map = minimap;
  snapshot = new ZoomSnapshot({
    wrapper,
    background,
    view: () => view.view,
    containerSize: () => view.containerSize(),
    isInteracting: () => view.isInteracting,
    onBuilt: (canvas, diagram) => map.draw(canvas, diagram),
  });
  const bitmaps = snapshot;

  // An Arrange candidate has a different size, so it is shown whole
  if (init.arrange) {
    view.fit();
  } else if (!restoreView(host, view)) {
    view.actualSize();
  }

  const search = new Search(
    svg,
    {
      input: byId<HTMLInputElement>('searchInput'),
      count: byId('searchCount'),
      previous: byId<HTMLButtonElement>('searchPrev'),
      next: byId<HTMLButtonElement>('searchNext'),
      wrapper,
    },
    view,
  );
  const journeysOpen = () => !document.body.classList.contains('journeys-hidden');
  setupRelations(svg, {
    host,
    canFocus: (e) =>
      !view.isPanning &&
      !view.hasPanned &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      !journeysOpen(),
    refreshSnapshot: () => {
      if (bitmaps.isReady) {
        void bitmaps.build(svg);
      }
    },
    isTyping: (e) => e.target === search.input,
  });
  new Journeys({
    svg,
    elements: {
      container,
      inputContainer: byId('inputContainer'),
      input: byId<HTMLTextAreaElement>('journeyInput'),
      list: byId('journeyList'),
      count: byId('journeyCount'),
      selectionCounter: byId('selectionCounter'),
      rectangle: byId('rectangleSelection'),
      clipboardButton: byId('clipboardButton'),
      resetButton: byId('resetButton'),
    },
    host,
    viewController: view,
    isPanelOpen: journeysOpen,
    searchInput: search.input,
  });
  setupExport(host, svg, background, () => bitmaps.decoded);
  setupViewInput(host, container, view);
  window.setTimeout(() => void bitmaps.build(svg), FIRST_SNAPSHOT_DELAY_MS);
}

function restoreView(host: Host, view: ViewController): boolean {
  const saved: View | undefined = host.state().view;
  if (!isView(saved)) {
    return false;
  }
  view.setNow(saved);
  return true;
}

/** The toolbar can wrap to two lines; side panels start right below it. */
function alignPanelsToToolbar(): void {
  const toolbar = document.querySelector<HTMLElement>('.toolbar');
  const top = `${toolbar?.offsetHeight ?? 0}px`;
  byId('journeySidebar').style.top = top;
  byId('inputContainer').style.top = top;
}

function setupViewInput(host: Host, container: HTMLElement, view: ViewController): void {
  byId('zoomIn').addEventListener('click', () => view.zoomBy(1.2));
  byId('zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.2));
  byId('zoomReset').addEventListener('click', () => view.fit());
  byId('zoomActual').addEventListener('click', () => view.actualSize());

  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode);
      view.smoothZoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    },
    { passive: false },
  );
  container.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      view.beginPan(e.clientX, e.clientY);
      e.preventDefault();
    }
  });
  document.addEventListener('mousemove', (e) => view.movePan(e.clientX, e.clientY));
  document.addEventListener('mouseup', () => view.endPan());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
      e.preventDefault();
      host.post({ type: 'viewSource' });
    }
  });
}

/** PNG is rendered here from the vector; SVG comes from the extension's last render. */
function setupExport(
  host: Host,
  svg: SVGSVGElement,
  background: string,
  decoded: () => HTMLImageElement | null,
): void {
  const select = byId<HTMLSelectElement>('exportSelect');
  select.addEventListener('change', async () => {
    const format = select.value;
    select.value = '';
    if (format === 'svg') {
      host.post({ type: 'exportImage', format: 'svg' });
      return;
    }
    if (format !== 'png') {
      return;
    }
    select.disabled = true;
    document.body.style.cursor = 'progress';
    try {
      host.post({
        type: 'exportImage',
        format: 'png',
        data: await renderPngBase64(svg, background, decoded()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      host.post({ type: 'error', message: `PNG export failed: ${message}` });
    } finally {
      select.disabled = false;
      document.body.style.cursor = '';
    }
  });
}

main();
