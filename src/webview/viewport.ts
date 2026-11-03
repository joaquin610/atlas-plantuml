// Pure pan/zoom math. A view maps diagram point p to screen point p * zoom + pan.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
const FIT_PADDING = 40;

export interface View {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Region {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function clampZoom(zoom: number, max = MAX_ZOOM): number {
  return Math.max(MIN_ZOOM, Math.min(max, zoom));
}

export function isView(value: unknown): value is View {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return [v.zoom, v.panX, v.panY].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Changes zoom keeping the diagram point under (anchorX, anchorY) in place. */
export function zoomAround(view: View, anchorX: number, anchorY: number, zoom: number): View {
  const x = (anchorX - view.panX) / view.zoom;
  const y = (anchorY - view.panY) / view.zoom;
  return { zoom, panX: anchorX - x * zoom, panY: anchorY - y * zoom };
}

/** Puts diagram point (x, y) at the center of the container. */
export function centerOn(container: Size, zoom: number, x: number, y: number): View {
  return { zoom, panX: container.width / 2 - x * zoom, panY: container.height / 2 - y * zoom };
}

export function centerContent(container: Size, content: Size, zoom = 1): View {
  return {
    zoom,
    panX: (container.width - content.width * zoom) / 2,
    panY: (container.height - content.height * zoom) / 2,
  };
}

/** Whole diagram visible and centered, never enlarged beyond 1:1. */
export function fitContent(container: Size, content: Size): View {
  const zoom = Math.min(
    (container.width - FIT_PADDING) / content.width,
    (container.height - FIT_PADDING) / content.height,
    1,
  );
  return centerContent(container, content, zoom);
}

/** Diagram point at the center of the container. */
export function viewCenter(container: Size, view: View): { x: number; y: number } {
  return {
    x: (container.width / 2 - view.panX) / view.zoom,
    y: (container.height / 2 - view.panY) / view.zoom,
  };
}

/** Diagram area visible in the container (may extend beyond the diagram). */
export function visibleRegion(container: Size, view: View): Region {
  const x0 = -view.panX / view.zoom;
  const y0 = -view.panY / view.zoom;
  return {
    x0,
    y0,
    x1: x0 + container.width / view.zoom,
    y1: y0 + container.height / view.zoom,
  };
}

// Pixels per wheel delta unit, by WheelEvent.deltaMode (pixels, lines, pages)
const WHEEL_UNIT_PX = [1, 16, 800];

/** Zoom factor proportional to the scroll distance, limited to halving or doubling. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const unit = WHEEL_UNIT_PX[deltaMode] ?? 1;
  return Math.min(2, Math.max(0.5, Math.exp(-deltaY * unit * 0.001)));
}

/** Zoom that shows a box comfortably: at least `minimum`, at most 80% of the container. */
export function zoomForBox(container: Size, box: Size, current: number, minimum = 0.8): number {
  const zoom = Math.min(
    Math.max(current, minimum),
    (container.width * 0.8) / box.width,
    (container.height * 0.8) / box.height,
  );
  return clampZoom(zoom, 2);
}
