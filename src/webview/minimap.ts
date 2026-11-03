import { context2d } from './svgImage.ts';
import type { ViewController } from './viewController.ts';
import { centerOn, type Size, type View } from './viewport.ts';

const MAX_WIDTH = 220;
const MAX_HEIGHT = 160;

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function minimapScale(diagram: Size): number {
  return Math.min(MAX_WIDTH / diagram.width, MAX_HEIGHT / diagram.height);
}

/** Visible area in minimap pixels, clipped to the diagram; null when nothing is visible. */
export function minimapViewRect(
  view: View,
  container: Size,
  diagram: Size,
  scale: number,
): Rect | null {
  const x0 = Math.max(0, (-view.panX / view.zoom) * scale);
  const y0 = Math.max(0, (-view.panY / view.zoom) * scale);
  const x1 = Math.min(diagram.width * scale, ((container.width - view.panX) / view.zoom) * scale);
  const y1 = Math.min(diagram.height * scale, ((container.height - view.panY) / view.zoom) * scale);
  return x1 > x0 && y1 > y0 ? { left: x0, top: y0, width: x1 - x0, height: y1 - y0 } : null;
}

export interface MinimapElements {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly viewBox: HTMLElement;
}

/** Whole diagram in a corner; click or drag in it to move the view. */
export class Minimap {
  private scale = 0;
  private diagram: Size = { width: 0, height: 0 };

  private readonly elements: MinimapElements;

  private readonly viewController: ViewController;

  constructor(elements: MinimapElements, viewController: ViewController) {
    this.elements = elements;

    this.viewController = viewController;
    let dragging = false;
    elements.root.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.scale) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      viewController.stopMotion();
      this.moveTo(e);
    });
    document.addEventListener('mousemove', (e) => {
      if (dragging) {
        this.moveTo(e);
      }
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
    });
    elements.root.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false },
    );
  }

  draw(snapshot: HTMLCanvasElement, diagram: Size): void {
    this.diagram = diagram;
    this.scale = minimapScale(diagram);
    const cssW = Math.round(diagram.width * this.scale);
    const cssH = Math.round(diagram.height * this.scale);
    const dpr = window.devicePixelRatio || 1;
    const canvas = this.elements.canvas;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = context2d(canvas);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
    this.update(this.viewController.view);
  }

  update(view: View): void {
    if (!this.scale) {
      return;
    }
    const rect = minimapViewRect(
      view,
      this.viewController.containerSize(),
      this.diagram,
      this.scale,
    );
    const style = this.elements.viewBox.style;
    style.display = rect ? 'block' : 'none';
    if (rect) {
      style.left = `${rect.left}px`;
      style.top = `${rect.top}px`;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
    }
  }

  private moveTo(e: MouseEvent): void {
    const rect = this.elements.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scale;
    const y = (e.clientY - rect.top) / this.scale;
    const controller = this.viewController;
    controller.markInteracting();
    controller.set(centerOn(controller.containerSize(), controller.view.zoom, x, y));
  }
}
