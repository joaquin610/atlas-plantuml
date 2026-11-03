import type { Host } from './host.ts';
import type { ViewController } from './viewController.ts';

// Journeys (original Plan UML feature): select elements, type an instruction about them and
// copy the list, e.g. for an AI assistant. Selection works only while the panel is open.

interface Selected {
  readonly uid: string;
  readonly lineNumber: number;
  readonly element: Element;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return !(
    b.x > a.x + a.width ||
    b.x + b.width < a.x ||
    b.y > a.y + a.height ||
    b.y + b.height < a.y
  );
}

/** Element id for a journey: entity name, "from->to" for links, else its source line. */
export function elementUid(data: DOMStringMap, id = ''): string {
  if (data.entity) {
    return data.entity;
  }
  if (data.entity1 && data.entity2) {
    return `${data.entity1}->${data.entity2}`;
  }
  return data.sourceLine !== undefined ? `_${Number.parseInt(data.sourceLine, 10)}_` : id;
}

/** Journey text about the selected elements; line numbers are shown 1-based. */
export function formatJourney(
  selected: readonly { uid: string; lineNumber: number }[],
  text: string,
): string {
  const refs = selected.map((item) => `${item.uid}:${item.lineNumber + 1}`);
  return `<About Entities(${refs.join(', ')})>:${text}`;
}

export interface JourneyElements {
  readonly container: HTMLElement;
  readonly inputContainer: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly list: HTMLElement;
  readonly count: HTMLElement;
  readonly selectionCounter: HTMLElement;
  readonly rectangle: HTMLElement;
  readonly clipboardButton: HTMLElement;
  readonly resetButton: HTMLElement;
}

export interface JourneysDeps {
  readonly svg: SVGSVGElement;
  readonly elements: JourneyElements;
  readonly host: Host;
  readonly viewController: ViewController;
  readonly isPanelOpen: () => boolean;
  /** Typing in the search box must not open the journey input. */
  readonly searchInput: HTMLInputElement;
}

export class Journeys {
  private selected: Selected[] = [];
  private journeys: string[] = [];
  private creatingNode = false;

  private readonly svg: SVGSVGElement;
  private readonly elements: JourneyElements;
  private readonly host: Host;
  private readonly viewController: ViewController;
  private readonly isPanelOpen: () => boolean;
  private readonly searchInput: HTMLInputElement;

  constructor(deps: JourneysDeps) {
    this.svg = deps.svg;
    this.elements = deps.elements;
    this.host = deps.host;
    this.viewController = deps.viewController;
    this.isPanelOpen = deps.isPanelOpen;
    this.searchInput = deps.searchInput;
    const { elements } = deps;
    this.setupElementClicks();
    this.setupRectangleSelection();
    this.setupInput();
    elements.clipboardButton.addEventListener('click', () => this.copyToClipboard());
    elements.resetButton.addEventListener('click', () => {
      this.journeys = [];
      this.renderList();
    });
    // Ctrl+Click on empty space: instruction about a new node
    elements.container.addEventListener('click', (e) => {
      const view = this.viewController;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !view.isPanning && !view.hasPanned) {
        e.preventDefault();
        e.stopPropagation();
        this.startCreatingNode();
      }
    });
  }

  private startCreatingNode(): void {
    this.creatingNode = true;
    this.elements.inputContainer.classList.add('visible');
    this.elements.input.value = '';
    this.elements.input.focus();
  }

  private setupElementClicks(): void {
    for (const group of Array.from(this.svg.querySelectorAll('g'))) {
      group.addEventListener('click', (e) => {
        const view = this.viewController;
        if (view.isPanning || view.hasPanned || !this.isPanelOpen()) {
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          this.startCreatingNode();
          return;
        }
        if (e.shiftKey) {
          return;
        }
        e.stopPropagation();
        this.toggle(group);
      });
    }
  }

  private toggle(element: SVGGElement): void {
    const sourceLine = element.dataset.sourceLine;
    if (sourceLine === undefined) {
      return;
    }
    const lineNumber = Number.parseInt(sourceLine, 10);
    const uid = elementUid(element.dataset, element.id);
    const index = this.selected.findIndex((s) => s.uid === uid && s.lineNumber === lineNumber);
    if (index >= 0) {
      this.selected[index].element.classList.remove('selected');
      this.selected.splice(index, 1);
    } else {
      element.classList.add('selected');
      this.selected.push({ uid, lineNumber, element });
    }
    this.renderCounter();
  }

  private selectInRectangle(rect: Box): void {
    for (const group of Array.from(this.svg.querySelectorAll('g'))) {
      try {
        const sourceLine = group.dataset.sourceLine;
        if (sourceLine === undefined || !boxesIntersect(rect, group.getBBox())) {
          continue;
        }
        const lineNumber = Number.parseInt(sourceLine, 10);
        const uid = elementUid(group.dataset, group.id);
        if (!this.selected.some((s) => s.uid === uid && s.lineNumber === lineNumber)) {
          group.classList.add('selected');
          this.selected.push({ uid, lineNumber, element: group });
        }
      } catch (error) {
        // Some elements have no valid bounding box
        console.warn('[Selection] Rectangle: error getting bbox for element', error);
      }
    }
    this.renderCounter();
  }

  private setupRectangleSelection(): void {
    const { container, rectangle } = this.elements;
    let start: { x: number; y: number } | null = null;
    const local = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    });
    container.addEventListener('mousedown', (e) => {
      if (e.shiftKey && e.button === 0 && !e.ctrlKey && !e.metaKey) {
        start = local(e);
        Object.assign(rectangle.style, {
          display: 'block',
          left: `${start.x}px`,
          top: `${start.y}px`,
          width: '0px',
          height: '0px',
        });
        e.preventDefault();
        e.stopPropagation();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (start) {
        const box = boxFrom(start, local(e));
        Object.assign(rectangle.style, {
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
        });
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (!start) {
        return;
      }
      const box = boxFrom(start, local(e));
      start = null;
      rectangle.style.display = 'none';
      // Screen to diagram coordinates
      const { zoom, panX, panY } = this.viewController.view;
      this.selectInRectangle({
        x: (box.x - panX) / zoom,
        y: (box.y - panY) / zoom,
        width: box.width / zoom,
        height: box.height / zoom,
      });
    });
  }

  private setupInput(): void {
    const { input, inputContainer } = this.elements;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (this.creatingNode) {
          if (text) {
            this.add(`<Create Node>: ${text}`);
          }
          this.reset();
        } else if (this.selected.length > 0) {
          if (text) {
            this.add(formatJourney(this.selected, text));
          }
          this.reset();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.reset();
      }
      // Shift+Enter inserts a newline (default behavior)
    });
    // Typing while elements are selected opens the input
    document.addEventListener('keydown', (e) => {
      if (e.target === this.searchInput || this.selected.length === 0 || this.creatingNode) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const printable = e.key.length === 1;
      if (printable && !inputContainer.classList.contains('visible')) {
        inputContainer.classList.add('visible');
        input.focus();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.activeElement !== input) {
        this.reset();
      }
    });
  }

  private add(journey: string): void {
    this.journeys.push(journey);
    this.renderList();
  }

  private reset(): void {
    for (const item of this.selected) {
      item.element.classList.remove('selected');
    }
    this.selected = [];
    this.renderCounter();
    this.creatingNode = false;
    this.elements.inputContainer.classList.remove('visible');
    this.elements.input.value = '';
  }

  private renderCounter(): void {
    const count = this.selected.length;
    const counter = this.elements.selectionCounter;
    counter.textContent = count > 0 ? `${count} element${count === 1 ? '' : 's'} selected` : '';
    counter.style.display = count > 0 ? 'inline' : 'none';
  }

  private renderList(): void {
    const { list, count } = this.elements;
    list.replaceChildren();
    count.textContent = String(this.journeys.length);
    this.journeys.forEach((journey, index) => {
      const item = document.createElement('div');
      item.className = 'journey-item';
      const text = document.createElement('div');
      text.className = 'journey-text';
      text.textContent = journey;
      const remove = document.createElement('button');
      remove.className = 'journey-delete';
      remove.textContent = '×';
      remove.title = 'Delete journey';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.journeys.splice(index, 1);
        this.renderList();
      });
      item.append(text, remove);
      list.appendChild(item);
    });
  }

  private copyToClipboard(): void {
    if (this.journeys.length > 0) {
      this.host.post({ type: 'copyJourneysToClipboard', text: this.journeys.join('\n\n') });
    }
  }
}
