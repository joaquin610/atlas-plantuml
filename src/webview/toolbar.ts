import type { PreviewInit } from '../shared/messages.ts';
import { byId, type Host, type PersistedState } from './host.ts';

type PanelKey = 'journeysHidden' | 'minimapHidden';

/**
 * A panel that can be hidden, remembered per preview (webview state) and across previews
 * (localStorage). `bodyClass` on <body> hides it through the CSS.
 */
export function setupPanelToggle(
  host: Host,
  key: PanelKey,
  bodyClass: string,
  button: HTMLElement,
  hiddenByDefault: boolean,
): (hidden: boolean) => void {
  const storageKey = `planUml.${key}`;
  const set = (hidden: boolean) => {
    document.body.classList.toggle(bodyClass, hidden);
    button.classList.toggle('active', !hidden);
    host.patchState({ [key]: hidden } as PersistedState);
    try {
      localStorage.setItem(storageKey, String(hidden));
    } catch {
      // Storage can be unavailable in some webviews
    }
  };
  const read = (): boolean => {
    const saved = host.state()[key];
    if (typeof saved === 'boolean') {
      return saved;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? hiddenByDefault : stored === 'true';
    } catch {
      return hiddenByDefault;
    }
  };
  set(read());
  button.addEventListener('click', () => set(!document.body.classList.contains(bodyClass)));
  return set;
}

function busy(): void {
  document.body.style.cursor = 'progress';
}

/** Buttons whose work happens in the extension; it re-renders the page when done. */
export function setupExtensionControls(host: Host, init: PreviewInit): void {
  const dark = byId<HTMLButtonElement>('darkModeButton');
  document.body.classList.toggle('diagram-dark', init.dark);
  dark.classList.toggle('active', init.dark);
  dark.addEventListener('click', () => {
    dark.disabled = true;
    busy();
    host.post({ type: 'setDark', dark: !init.dark });
  });

  const layout = byId<HTMLSelectElement>('layoutSelect');
  init.layouts.forEach((label, i) => {
    layout.add(new Option(label, String(i), false, i === init.layoutIndex));
  });
  layout.addEventListener('change', () => {
    layout.disabled = true;
    busy();
    host.post({ type: 'setLayout', index: Number(layout.value) });
  });

  byId('reloadButton').addEventListener('click', () => host.post({ type: 'reload' }));
  byId('viewSource').addEventListener('click', () => host.post({ type: 'viewSource' }));
  setupArrange(host, init, layout);
}

function setupArrange(host: Host, init: PreviewInit, layout: HTMLSelectElement): void {
  const button = byId<HTMLButtonElement>('arrangeButton');
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Arranging...';
    host.post({ type: 'arrange' });
  });
  const arrange = init.arrange;
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type === 'arrangeDone' && !arrange) {
      button.disabled = false;
      button.textContent = 'Arrange';
    }
  });
  if (!arrange) {
    return;
  }
  // A candidate is previewed until it is applied or discarded
  document.body.classList.add('arranging');
  button.disabled = true;
  layout.disabled = true;
  const select = byId<HTMLSelectElement>('arrangeSelect');
  arrange.options.forEach((option, i) => {
    const direction = option.direction === 'lr' ? 'left to right' : 'top to bottom';
    const label = `Option ${i + 1}: ${option.crossings} crossings, ${direction}`;
    select.add(new Option(label, String(i), false, i === arrange.selected));
  });
  byId('arrangeBaseline').textContent = `(current: ${arrange.baseline} crossings)`;
  const send = (message: Parameters<Host['post']>[0]) => {
    busy();
    select.disabled = true;
    host.post(message);
  };
  select.addEventListener('change', () =>
    send({ type: 'arrangeSelect', index: Number(select.value) }),
  );
  byId('arrangeApply').addEventListener('click', () => send({ type: 'arrangeApply' }));
  byId('arrangeDiscard').addEventListener('click', () => send({ type: 'arrangeDiscard' }));
}
