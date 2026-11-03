import type { ViewController } from './viewController.ts';
import { zoomForBox } from './viewport.ts';

export interface SearchTarget {
  readonly name: string;
  readonly isPackage: boolean;
}

/** Case-insensitive matches: exact, then prefix, then substring; classes before packages. */
export function rankMatches<T extends SearchTarget>(targets: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const rank = (target: T) => {
    const name = target.name.toLowerCase();
    const base = name === q ? 0 : name.startsWith(q) ? 1 : 2;
    return base * 2 + (target.isPackage ? 1 : 0);
  };
  return targets
    .filter((target) => target.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b));
}

interface ElementTarget extends SearchTarget {
  readonly element: SVGGraphicsElement;
}

export interface SearchElements {
  readonly input: HTMLInputElement;
  readonly count: HTMLElement;
  readonly previous: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly wrapper: HTMLElement;
}

/** Finds classes and packages by name and centers the view on them. */
export class Search {
  private readonly targets: ElementTarget[];
  private matches: ElementTarget[] = [];
  private index = 0;

  private readonly elements: SearchElements;

  private readonly viewController: ViewController;

  constructor(svg: SVGSVGElement, elements: SearchElements, viewController: ViewController) {
    this.elements = elements;

    this.viewController = viewController;
    this.targets = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>('g.entity[data-entity], g.cluster[data-entity]'),
    ).map((element) => ({
      element,
      name: element.dataset.entity ?? '',
      isPackage: element.classList.contains('cluster'),
    }));
    const { input } = elements;
    input.addEventListener('input', () => this.run(input.value));
    elements.previous.addEventListener('click', () => this.step(-1));
    elements.next.addEventListener('click', () => this.step(1));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = '';
        this.run('');
        input.blur();
      }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  get input(): HTMLInputElement {
    return this.elements.input;
  }

  private run(query: string): void {
    this.matches = rankMatches(this.targets, query);
    this.index = 0;
    const single = this.matches.length < 2;
    this.elements.previous.disabled = single;
    this.elements.next.disabled = single;
    if (this.matches.length > 0) {
      this.focusMatch();
    } else {
      document.getElementById('searchHighlight')?.remove();
      this.elements.count.textContent = query.trim() ? '0' : '';
    }
  }

  private step(direction: 1 | -1): void {
    if (this.matches.length === 0) {
      return;
    }
    this.index = (this.index + direction + this.matches.length) % this.matches.length;
    this.focusMatch();
  }

  private focusMatch(): void {
    const match = this.matches[this.index];
    this.elements.count.textContent = `${this.index + 1}/${this.matches.length}`;
    const box = match.element.getBBox();
    const controller = this.viewController;
    const zoom = zoomForBox(controller.containerSize(), box, controller.view.zoom);
    this.highlight(box, zoom);
    controller.animateTo(zoom, box.x + box.width / 2, box.y + box.height / 2);
  }

  private highlight(box: DOMRect, zoom: number): void {
    let highlight = document.getElementById('searchHighlight');
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = 'searchHighlight';
      this.elements.wrapper.appendChild(highlight);
    }
    const border = 3 / zoom;
    const pad = 4 / zoom + border;
    Object.assign(highlight.style, {
      left: `${box.x - pad}px`,
      top: `${box.y - pad}px`,
      width: `${box.width + pad * 2}px`,
      height: `${box.height + pad * 2}px`,
      borderWidth: `${border}px`,
    });
  }
}
