import { context2d, decodeSvg, svgSize } from './svgImage.ts';
import type { Region, Size, View } from './viewport.ts';

const SNAPSHOT_MAX_PIXELS = 16e6;
const SNAPSHOT_MAX_SIDE = 8192;
const DETAIL_HEADROOM = 1.5;
const DETAIL_MAX_PIXELS = 16e6;
const DETAIL_STRIP_HEIGHT = 256;
const DETAIL_FRAME_BUDGET_MS = 12;
const DETAIL_DELAY_MS = 400;

export interface DetailArea extends Region {
  readonly scale: number;
}

export type DetailPlan =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'draw'; readonly area: DetailArea };

export interface DetailInput {
  readonly view: View;
  readonly container: Size;
  readonly diagram: Size;
  readonly devicePixelRatio: number;
  /** Resolution of the full snapshot; a detail is only worth drawing above it. */
  readonly snapshotScale: number;
  readonly existing: DetailArea | null;
}

/** Bitmap scale for the whole diagram: at most 1, within the pixel and side limits. */
export function snapshotScale(diagram: Size): number {
  return Math.min(
    1,
    Math.sqrt(SNAPSHOT_MAX_PIXELS / (diagram.width * diagram.height)),
    SNAPSHOT_MAX_SIDE / Math.max(diagram.width, diagram.height),
  );
}

/**
 * Decides the sharp detail for a resting view: the visible area plus half a screen around
 * it, at 1.5x screen resolution, reusing the current one while it still covers the view.
 */
export function planDetail(input: DetailInput): DetailPlan {
  const { view, container, diagram, existing } = input;
  const viewW = container.width / view.zoom;
  const viewH = container.height / view.zoom;
  const vx0 = -view.panX / view.zoom;
  const vy0 = -view.panY / view.zoom;
  const screenScale = view.zoom * input.devicePixelRatio;
  if (
    existing &&
    existing.x0 <= Math.max(0, vx0) &&
    existing.y0 <= Math.max(0, vy0) &&
    existing.x1 >= Math.min(diagram.width, vx0 + viewW) &&
    existing.y1 >= Math.min(diagram.height, vy0 + viewH) &&
    existing.scale >= screenScale
  ) {
    return { kind: 'keep' };
  }
  const x0 = Math.max(0, vx0 - viewW * 0.5);
  const y0 = Math.max(0, vy0 - viewH * 0.5);
  const x1 = Math.min(diagram.width, vx0 + viewW * 1.5);
  const y1 = Math.min(diagram.height, vy0 + viewH * 1.5);
  const width = x1 - x0;
  const height = y1 - y0;
  const scale = Math.min(
    screenScale * DETAIL_HEADROOM,
    Math.sqrt(DETAIL_MAX_PIXELS / Math.max(1, width * height)),
  );
  if (width <= 0 || height <= 0 || scale <= input.snapshotScale * 1.05) {
    return { kind: 'remove' };
  }
  return { kind: 'draw', area: { x0, y0, x1, y1, scale } };
}

export interface SnapshotDeps {
  readonly wrapper: HTMLElement;
  readonly background: string;
  view(): View;
  containerSize(): Size;
  isInteracting(): boolean;
  /** Called with the full bitmap each time it is (re)built. */
  onBuilt(canvas: HTMLCanvasElement, diagram: Size): void;
}

/**
 * Bitmap copies of the SVG shown while the view moves: one of the whole diagram, plus a sharp
 * detail of the visible area drawn in short strips once the view rests.
 */
export class ZoomSnapshot {
  private image: HTMLImageElement | null = null;
  private diagram: Size = { width: 0, height: 0 };
  private scale = 1;
  private detailTimer = 0;
  private detailJob = 0;
  private detailArea: DetailArea | null = null;

  private readonly deps: SnapshotDeps;

  constructor(deps: SnapshotDeps) {
    this.deps = deps;
  }

  /** Decoded image of the current SVG, once built. */
  get decoded(): HTMLImageElement | null {
    return this.image;
  }

  get isReady(): boolean {
    return this.image !== null;
  }

  async build(svg: SVGSVGElement): Promise<void> {
    const diagram = svgSize(svg);
    if (!diagram) {
      return;
    }
    try {
      const image = await decodeSvg(svg);
      const scale = snapshotScale(diagram);
      const canvas = document.createElement('canvas');
      canvas.id = 'zoomSnapshot';
      canvas.width = Math.round(diagram.width * scale);
      canvas.height = Math.round(diagram.height * scale);
      canvas.style.width = `${diagram.width}px`;
      canvas.style.height = `${diagram.height}px`;
      this.paint(canvas, (ctx) => ctx.drawImage(image, 0, 0, canvas.width, canvas.height));
      // Rebuilds (after a relations focus change) replace the previous bitmaps
      const previous = document.getElementById('zoomSnapshot');
      if (previous) {
        previous.replaceWith(canvas);
      } else {
        this.deps.wrapper.prepend(canvas);
      }
      this.cancelDetail();
      this.removeDetail();
      this.image = image;
      this.diagram = diagram;
      this.scale = scale;
      document.body.classList.add('snapshot-ready');
      this.deps.onBuilt(canvas, diagram);
      this.scheduleDetail();
    } catch (error) {
      console.warn('[Snapshot] Could not build zoom snapshot:', error);
    }
  }

  scheduleDetail(): void {
    clearTimeout(this.detailTimer);
    this.detailTimer = window.setTimeout(() => this.updateDetail(), DETAIL_DELAY_MS);
  }

  cancelDetail(): void {
    clearTimeout(this.detailTimer);
    this.detailJob++;
  }

  private removeDetail(): void {
    document.getElementById('zoomDetail')?.remove();
    this.detailArea = null;
  }

  private paint(canvas: HTMLCanvasElement, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const ctx = context2d(canvas);
    ctx.fillStyle = this.deps.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw(ctx);
  }

  private updateDetail(): void {
    const image = this.image;
    if (!image || this.deps.isInteracting()) {
      return;
    }
    const plan = planDetail({
      view: this.deps.view(),
      container: this.deps.containerSize(),
      diagram: this.diagram,
      devicePixelRatio: window.devicePixelRatio || 1,
      snapshotScale: this.scale,
      existing: this.detailArea,
    });
    if (plan.kind === 'keep') {
      return;
    }
    if (plan.kind === 'remove') {
      this.removeDetail();
      return;
    }
    const { area } = plan;
    const regionW = area.x1 - area.x0;
    const regionH = area.y1 - area.y0;
    const canvas = document.createElement('canvas');
    canvas.id = 'zoomDetail';
    canvas.width = Math.round(regionW * area.scale);
    canvas.height = Math.round(regionH * area.scale);
    canvas.style.left = `${area.x0}px`;
    canvas.style.top = `${area.y0}px`;
    canvas.style.width = `${regionW}px`;
    canvas.style.height = `${regionH}px`;
    const ctx = context2d(canvas);
    ctx.fillStyle = this.deps.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const job = ++this.detailJob;
    const rowsPerUnit = canvas.height / regionH;
    let rowTop = 0;
    const drawStrips = () => {
      if (job !== this.detailJob || this.deps.isInteracting()) {
        return;
      }
      const start = performance.now();
      while (rowTop < canvas.height && performance.now() - start < DETAIL_FRAME_BUDGET_MS) {
        const rows = Math.min(DETAIL_STRIP_HEIGHT, canvas.height - rowTop);
        ctx.drawImage(
          image,
          area.x0,
          area.y0 + rowTop / rowsPerUnit,
          regionW,
          rows / rowsPerUnit,
          0,
          rowTop,
          canvas.width,
          rows,
        );
        rowTop += rows;
      }
      if (rowTop < canvas.height) {
        window.setTimeout(drawStrips, 0);
        return;
      }
      const current = document.getElementById('zoomDetail');
      if (current) {
        current.replaceWith(canvas);
      } else {
        this.deps.wrapper.appendChild(canvas);
      }
      this.detailArea = area;
    };
    drawStrips();
  }
}
