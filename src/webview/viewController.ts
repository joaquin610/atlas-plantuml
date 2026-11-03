import {
  centerContent,
  centerOn,
  clampZoom,
  fitContent,
  type Size,
  type View,
  viewCenter,
  zoomAround,
} from './viewport.ts';

export interface ViewElements {
  readonly container: HTMLElement;
  readonly wrapper: HTMLElement;
  readonly zoomLabel: HTMLElement;
}

export interface ViewListener {
  /** After every applied transform. */
  onChange(view: View): void;
  /** Movement started or continues: expensive redraws should stop. */
  onInteractionStart(): void;
  /** The view has been still for a moment. */
  onRest(): void;
}

const PAN_THRESHOLD_PX = 3;
const REST_DELAY_MS = 200;
const WHEEL_EASING = 0.35;

interface PanStart {
  readonly x: number;
  readonly y: number;
  readonly view: View;
}

/**
 * Owns the pan/zoom state and writes it to the DOM at most once per frame. While the view
 * moves, the body has the "interacting" class (the CSS swaps the SVG for a bitmap).
 */
export class ViewController {
  private current: View = { zoom: 1, panX: 0, panY: 0 };
  private frame = 0;
  private animation = 0;
  private wheelTarget: number | null = null;
  private wheelAnchor = { x: 0, y: 0 };
  private wheelFrame = 0;
  private restTimer = 0;
  private panStart: PanStart | null = null;
  private panMoved = false;

  private readonly elements: ViewElements;

  private readonly listener: ViewListener;

  constructor(elements: ViewElements, listener: ViewListener) {
    this.elements = elements;

    this.listener = listener;
  }

  get view(): View {
    return this.current;
  }

  get isPanning(): boolean {
    return this.panStart !== null;
  }

  /** True during a drag and for two frames after it, so the click that ends it is ignored. */
  get hasPanned(): boolean {
    return this.panMoved;
  }

  get isInteracting(): boolean {
    return document.body.classList.contains('interacting');
  }

  containerSize(): Size {
    const rect = this.elements.container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /** Size of the diagram at zoom 1, or null when it has no size yet. */
  contentSize(): Size | null {
    const svg = this.elements.wrapper.querySelector('svg');
    if (!svg) {
      return null;
    }
    const wrapper = this.elements.wrapper;
    const saved = wrapper.style.transform;
    wrapper.style.transform = 'translate(0, 0) scale(1)';
    const rect = svg.getBoundingClientRect();
    wrapper.style.transform = saved;
    return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
  }

  /** Sets the view on the next frame; several calls in one frame cost one DOM write. */
  set(view: View): void {
    this.current = { ...view, zoom: clampZoom(view.zoom) };
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.apply();
      });
    }
  }

  setNow(view: View): void {
    this.current = { ...view, zoom: clampZoom(view.zoom) };
    this.apply();
  }

  stopMotion(): void {
    cancelAnimationFrame(this.animation);
    this.wheelTarget = null;
  }

  zoomBy(factor: number): void {
    this.stopMotion();
    const container = this.containerSize();
    const zoom = clampZoom(this.current.zoom * factor);
    this.set(zoomAround(this.current, container.width / 2, container.height / 2, zoom));
  }

  fit(): void {
    const content = this.contentSize();
    if (content) {
      this.stopMotion();
      this.set(fitContent(this.containerSize(), content));
    }
  }

  actualSize(): void {
    const content = this.contentSize();
    if (content) {
      this.stopMotion();
      this.set(centerContent(this.containerSize(), content, 1));
    }
  }

  /** Wheel zoom: each event moves the target; frames glide toward it around the cursor. */
  smoothZoomAt(x: number, y: number, factor: number): void {
    cancelAnimationFrame(this.animation);
    this.markInteracting();
    this.wheelTarget = clampZoom((this.wheelTarget ?? this.current.zoom) * factor);
    this.wheelAnchor = { x, y };
    if (!this.wheelFrame) {
      this.wheelFrame = requestAnimationFrame(() => this.stepWheel());
    }
  }

  /** Animates to a zoom centered on a diagram point (search results, minimap jumps). */
  animateTo(zoom: number, x: number, y: number, durationMs = 300): void {
    this.stopMotion();
    const container = this.containerSize();
    const startZoom = this.current.zoom;
    const start = viewCenter(container, this.current);
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const ease = 1 - (1 - t) ** 3;
      const frameZoom = startZoom * (zoom / startZoom) ** ease;
      this.current = centerOn(
        container,
        frameZoom,
        start.x + (x - start.x) * ease,
        start.y + (y - start.y) * ease,
      );
      this.markInteracting();
      this.apply();
      if (t < 1) {
        this.animation = requestAnimationFrame(step);
      }
    };
    this.animation = requestAnimationFrame(step);
  }

  beginPan(clientX: number, clientY: number): void {
    cancelAnimationFrame(this.animation);
    this.panStart = { x: clientX, y: clientY, view: this.current };
    this.panMoved = false;
    this.elements.container.classList.add('panning');
  }

  movePan(clientX: number, clientY: number): void {
    const start = this.panStart;
    if (!start) {
      return;
    }
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) > PAN_THRESHOLD_PX || Math.abs(dy) > PAN_THRESHOLD_PX) {
      this.panMoved = true;
      document.body.classList.add('dragging');
    }
    if (this.panMoved) {
      this.markInteracting();
    }
    this.set({ zoom: this.current.zoom, panX: start.view.panX + dx, panY: start.view.panY + dy });
  }

  endPan(): void {
    if (!this.panStart) {
      return;
    }
    this.panStart = null;
    this.elements.container.classList.remove('panning');
    document.body.classList.remove('dragging');
    // Click handlers run before these frames, so they still see the drag
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.panMoved = false;
      }),
    );
  }

  markInteracting(): void {
    document.body.classList.add('interacting');
    clearTimeout(this.restTimer);
    this.listener.onInteractionStart();
    this.restTimer = window.setTimeout(() => this.endInteracting(), REST_DELAY_MS);
  }

  private endInteracting(): void {
    if (this.panStart || this.wheelTarget !== null) {
      this.restTimer = window.setTimeout(() => this.endInteracting(), 100);
      return;
    }
    document.body.classList.remove('interacting');
    this.listener.onRest();
  }

  private stepWheel(): void {
    this.wheelFrame = 0;
    const target = this.wheelTarget;
    if (target === null) {
      return;
    }
    const ratio = target / this.current.zoom;
    const done = Math.abs(Math.log(ratio)) < 0.002;
    const zoom = done ? target : this.current.zoom * ratio ** WHEEL_EASING;
    this.current = zoomAround(this.current, this.wheelAnchor.x, this.wheelAnchor.y, zoom);
    this.apply();
    if (done) {
      this.wheelTarget = null;
    } else {
      this.markInteracting();
      this.wheelFrame = requestAnimationFrame(() => this.stepWheel());
    }
  }

  private apply(): void {
    const { zoom, panX, panY } = this.current;
    this.elements.wrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    const label = `${Math.round(zoom * 100)}%`;
    if (this.elements.zoomLabel.textContent !== label) {
      this.elements.zoomLabel.textContent = label;
    }
    this.listener.onChange(this.current);
  }
}
