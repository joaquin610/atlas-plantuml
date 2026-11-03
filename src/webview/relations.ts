import type { Host } from './host.ts';

const DIM_OPACITY = '0.15';
const CLICK_DELAY_MS = 220;
const SNAPSHOT_REFRESH_MS = 150;

export interface Link {
  readonly from: string;
  readonly to: string;
}

/** Entities and links that stay visible when `name` is focused (everything when null). */
export function focusSets(
  links: readonly Link[],
  name: string | null,
): { readonly entities: ReadonlySet<string>; readonly links: readonly boolean[] } {
  const entities = new Set<string>(name ? [name] : []);
  const visible = links.map((link) => {
    const connected = name !== null && (link.from === name || link.to === name);
    if (connected) {
      entities.add(link.from);
      entities.add(link.to);
    }
    return name === null || connected;
  });
  return { entities, links: visible };
}

export interface RelationsDeps {
  readonly host: Host;
  /** A click that ends a drag, or Journeys selection, must not change the focus. */
  canFocus(event: MouseEvent): boolean;
  /** The moving bitmaps serialize inline opacity, so they are rebuilt after a change. */
  refreshSnapshot(): void;
  isTyping(event: KeyboardEvent): boolean;
}

/**
 * Click a class to dim everything not connected to it; click it again, click empty space or
 * press Esc to clear. Double-click opens the element's line in the source.
 */
export function setupRelations(svg: SVGSVGElement, deps: RelationsDeps): void {
  const entities = Array.from(svg.querySelectorAll<SVGGElement>('g.entity[data-entity]'));
  const linkElements = Array.from(
    svg.querySelectorAll<SVGGElement>('g.link[data-entity-1][data-entity-2]'),
  );
  const links = linkElements.map((link) => ({
    from: link.getAttribute('data-entity-1') ?? '',
    to: link.getAttribute('data-entity-2') ?? '',
  }));
  let focused: string | null = null;
  let clickTimer = 0;
  let refreshTimer = 0;

  const setFocus = (name: string | null) => {
    if (name === focused) {
      return;
    }
    focused = name;
    const visible = focusSets(links, name);
    linkElements.forEach((link, i) => {
      link.style.opacity = visible.links[i] ? '' : DIM_OPACITY;
    });
    for (const entity of entities) {
      const shown = name === null || visible.entities.has(entity.dataset.entity ?? '');
      entity.style.opacity = shown ? '' : DIM_OPACITY;
    }
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(deps.refreshSnapshot, SNAPSHOT_REFRESH_MS);
  };

  // Capture phase: the Journeys handlers stop propagation on every group
  svg.addEventListener(
    'click',
    (e) => {
      if (!deps.canFocus(e)) {
        return;
      }
      const entity = (e.target as Element).closest<SVGGElement>('g.entity[data-entity]');
      const name = entity?.dataset.entity ?? null;
      clearTimeout(clickTimer);
      // Wait briefly so a double-click does not toggle the focus twice
      clickTimer = window.setTimeout(
        () => setFocus(name === focused ? null : name),
        CLICK_DELAY_MS,
      );
    },
    true,
  );
  svg.addEventListener('dblclick', (e) => {
    clearTimeout(clickTimer);
    const element = (e.target as Element).closest('[data-source-line]');
    if (!element) {
      return;
    }
    deps.host.post({
      type: 'revealSource',
      line: Number(element.getAttribute('data-source-line')),
      name: element.getAttribute('data-entity') || element.getAttribute('data-entity-1') || '',
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focused && !deps.isTyping(e)) {
      setFocus(null);
    }
  });
}
