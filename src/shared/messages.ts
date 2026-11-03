// Contract between the extension and the preview webview. Both sides import these types,
// and the extension validates every incoming message with parseWebviewMessage.
import type { Direction } from '../core/arrange/diagram.ts';

export type WebviewMessage =
  | { readonly type: 'reload' }
  | { readonly type: 'setLayout'; readonly index: number }
  | { readonly type: 'cycleLayout'; readonly step: 1 | -1 }
  | { readonly type: 'resetLayout' }
  | { readonly type: 'setDark'; readonly dark: boolean }
  | { readonly type: 'exportImage'; readonly format: 'svg' }
  | { readonly type: 'exportImage'; readonly format: 'png'; readonly data: string }
  | { readonly type: 'revealSource'; readonly line: number; readonly name: string }
  | { readonly type: 'arrange' }
  | { readonly type: 'arrangeSelect'; readonly index: number }
  | { readonly type: 'arrangeApply' }
  | { readonly type: 'arrangeDiscard' }
  | { readonly type: 'copyJourneysToClipboard'; readonly text: string }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'viewSource' }
  | { readonly type: 'closePreview' };

export type WebviewMessageType = WebviewMessage['type'];

export type ExtensionMessage = { readonly type: 'arrangeDone' };

export interface ArrangeView {
  readonly baseline: number;
  readonly selected: number;
  readonly options: readonly { readonly crossings: number; readonly direction: Direction }[];
}

/** Data the preview page starts with (embedded as JSON in the page). */
export interface PreviewInit {
  readonly dark: boolean;
  readonly layouts: readonly string[];
  readonly layoutIndex: number;
  readonly arrange: ArrangeView | null;
}

const SIMPLE_TYPES = new Set<string>([
  'reload',
  'resetLayout',
  'arrange',
  'arrangeApply',
  'arrangeDiscard',
  'viewSource',
  'closePreview',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Returns a typed message, or null for anything malformed. */
export function parseWebviewMessage(raw: unknown): WebviewMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return null;
  }
  const { type } = raw;
  if (SIMPLE_TYPES.has(type)) {
    return { type } as WebviewMessage;
  }
  switch (type) {
    case 'setLayout':
    case 'arrangeSelect':
      return Number.isInteger(raw.index) ? { type, index: raw.index as number } : null;
    case 'cycleLayout':
      return { type, step: raw.step === -1 ? -1 : 1 };
    case 'setDark':
      return { type, dark: raw.dark === true };
    case 'exportImage':
      if (raw.format === 'svg') {
        return { type, format: 'svg' };
      }
      return raw.format === 'png' && typeof raw.data === 'string'
        ? { type, format: 'png', data: raw.data }
        : null;
    case 'revealSource':
      return Number.isFinite(raw.line)
        ? { type, line: raw.line as number, name: typeof raw.name === 'string' ? raw.name : '' }
        : null;
    case 'copyJourneysToClipboard':
      return typeof raw.text === 'string' ? { type, text: raw.text } : null;
    case 'error':
      return { type, message: String(raw.message ?? 'Unknown error') };
    default:
      return null;
  }
}
