import type { PreviewInit, WebviewMessage } from '../shared/messages.ts';
import type { View } from './viewport.ts';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** What survives a re-render of this preview (VS Code keeps it per webview). */
export interface PersistedState {
  readonly view?: View;
  readonly journeysHidden?: boolean;
  readonly minimapHidden?: boolean;
}

/** Typed access to the extension: messages out, persisted state in and out. */
export interface Host {
  post(message: WebviewMessage): void;
  state(): PersistedState;
  patchState(patch: PersistedState): void;
}

export function createHost(): Host {
  const api = acquireVsCodeApi();
  const state = (): PersistedState => {
    const raw = api.getState();
    return typeof raw === 'object' && raw !== null ? (raw as PersistedState) : {};
  };
  return {
    post: (message) => api.postMessage(message),
    state,
    patchState: (patch) => api.setState({ ...state(), ...patch }),
  };
}

export function readInit(): PreviewInit {
  const element = document.getElementById('previewInit');
  return JSON.parse(element?.textContent ?? 'null') as PreviewInit;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
