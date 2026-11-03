import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { isLayoutIndex, LAYOUTS, stepLayout } from '../core/plantuml/layouts.ts';
import { injectBeforeEnduml } from '../core/plantuml/source.ts';
import { fail, ok, type Result } from '../core/result.ts';
import { toDarkSvg } from '../core/svg/darkTheme.ts';
import type { PlantUmlRenderer } from '../infra/plantuml/plantumlRenderer.ts';
import {
  type PreviewInit,
  parseWebviewMessage,
  type WebviewMessage,
  type WebviewMessageType,
} from '../shared/messages.ts';
import {
  type ArrangeState,
  applyArrangement,
  searchArrangement,
  toArrangeView,
} from './arrangeFlow.ts';
import type { DiagnosticsPublisher } from './diagnostics.ts';
import { describe, saveExport } from './exportImage.ts';
import { revealSource } from './sourceNavigation.ts';
import type { WebviewHtml } from './webviewHtml.ts';

export interface DarkPreference {
  isDark(): boolean;
  setDark(dark: boolean): Promise<void>;
}

export interface SessionDeps {
  readonly renderer: PlantUmlRenderer;
  readonly diagnostics: DiagnosticsPublisher;
  readonly html: WebviewHtml;
  readonly preferences: DarkPreference;
  readonly extensionUri: vscode.Uri;
}

type Handlers = {
  readonly [K in WebviewMessageType]: (
    message: Extract<WebviewMessage, { type: K }>,
  ) => Promise<void> | void;
};

const REFRESH_DELAY_MS = 150;

/** One preview panel: its render state, its webview and the messages it receives. */
export class PreviewSession implements vscode.Disposable {
  private layoutIndex = 0;
  private arrangeState: ArrangeState | undefined;
  private shownSvg = '';
  private shownKey = '';
  private refreshCount = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly handlers: Handlers;

  readonly document: vscode.TextDocument;

  readonly panel: vscode.WebviewPanel;

  private readonly deps: SessionDeps;

  constructor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    deps: SessionDeps,
    onDispose: (session: PreviewSession) => void,
  ) {
    this.document = document;

    this.panel = panel;

    this.deps = deps;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(deps.extensionUri, 'media'),
        vscode.Uri.joinPath(deps.extensionUri, 'out'),
      ],
    };
    this.handlers = this.createHandlers();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          this.scheduleRefresh();
        }
      }),
      panel.webview.onDidReceiveMessage((raw: unknown) => this.onMessage(raw)),
    );
    try {
      const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
      this.disposables.push(
        watcher,
        watcher.onDidChange(() => this.scheduleRefresh()),
      );
    } catch (error) {
      // Without a workspace there may be no watcher; edits in VS Code still refresh
      console.warn('[Atlas PlantUML] Could not watch the file:', error);
    }
    panel.onDidDispose(() => {
      this.dispose();
      onDispose(this);
    });
  }

  /**
   * Renders and shows the current state. The page is replaced only when something changed
   * (or when forced), so typing does not reload the webview on every key.
   */
  async refresh({ force = false } = {}): Promise<void> {
    const count = ++this.refreshCount;
    if (this.arrangeState && this.arrangeState.version !== this.document.version) {
      this.arrangeState = undefined;
    }
    const rendered = await this.render();
    // A newer refresh started meanwhile: its result wins
    if (count !== this.refreshCount || this.disposed) {
      return;
    }
    const webview = this.panel.webview;
    if (!rendered.ok) {
      this.shownKey = '';
      const layout = this.layoutIndex > 0 ? LAYOUTS[this.layoutIndex].label : undefined;
      webview.html = this.deps.html.error(webview, {
        message: rendered.error,
        ...(layout ? { layoutLabel: layout } : {}),
      });
      return;
    }
    if (!this.arrangeState) {
      this.deps.diagnostics.update(this.document, rendered.value);
    }
    const init: PreviewInit = {
      dark: this.deps.preferences.isDark(),
      layouts: LAYOUTS.map((layout) => layout.label),
      layoutIndex: this.layoutIndex,
      arrange: this.arrangeState ? toArrangeView(this.arrangeState) : null,
    };
    const svg = init.dark ? toDarkSvg(rendered.value) : rendered.value;
    const key = `${JSON.stringify(init)}\0${svg}`;
    if (!force && key === this.shownKey) {
      return;
    }
    this.shownKey = key;
    this.shownSvg = svg;
    webview.html = await this.deps.html.preview(webview, { svg, init });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DELAY_MS);
  }

  private async render(): Promise<Result<string>> {
    if (this.arrangeState) {
      return ok(this.arrangeState.options[this.arrangeState.selected].svg);
    }
    let source: string;
    try {
      // The saved file is rendered, as PlantUML would see it
      source = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.document.uri));
    } catch (error) {
      return fail(`Failed to read file: ${describe(error)}`);
    }
    const directive = LAYOUTS[this.layoutIndex].directive;
    const text = directive ? injectBeforeEnduml(source, directive) : ok(source);
    if (!text.ok) {
      return text;
    }
    return this.deps.renderer.render(text.value, this.cwd());
  }

  private cwd(): string {
    return dirname(this.document.uri.fsPath);
  }

  private async onMessage(raw: unknown): Promise<void> {
    const message = parseWebviewMessage(raw);
    if (!message) {
      return;
    }
    try {
      const handler = this.handlers[message.type] as (m: WebviewMessage) => Promise<void> | void;
      await handler(message);
    } catch (error) {
      vscode.window.showErrorMessage(`Atlas PlantUML Preview: ${describe(error)}`);
    }
  }

  private setLayout(index: number): Promise<void> {
    if (isLayoutIndex(index)) {
      this.layoutIndex = index;
    }
    return this.refresh();
  }

  private createHandlers(): Handlers {
    return {
      reload: () => this.refresh({ force: true }),
      setLayout: (m) => this.setLayout(m.index),
      cycleLayout: (m) => this.setLayout(stepLayout(this.layoutIndex, m.step)),
      resetLayout: () => this.setLayout(0),
      setDark: (m) => this.deps.preferences.setDark(m.dark),
      exportImage: (m) =>
        saveExport(
          this.document,
          m.format,
          m.format === 'png' ? Buffer.from(m.data, 'base64') : Buffer.from(this.shownSvg, 'utf-8'),
        ),
      revealSource: (m) => revealSource(this.document, m.line, m.name),
      arrange: async () => {
        const state = await searchArrangement(this.document, (sources) =>
          this.deps.renderer.renderBatch(sources, this.cwd()),
        );
        await this.panel.webview.postMessage({ type: 'arrangeDone' });
        if (state) {
          this.arrangeState = state;
          await this.refresh();
        }
      },
      arrangeSelect: (m) => {
        const state = this.arrangeState;
        if (state && m.index >= 0 && m.index < state.options.length) {
          state.selected = m.index;
          return this.refresh();
        }
        return undefined;
      },
      arrangeApply: async () => {
        const state = this.arrangeState;
        if (!state) {
          return;
        }
        this.arrangeState = undefined;
        await applyArrangement(this.document, state);
        await this.refresh();
      },
      arrangeDiscard: () => {
        this.arrangeState = undefined;
        return this.refresh();
      },
      copyJourneysToClipboard: async (m) => {
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.showInformationMessage('Journeys copied to clipboard');
      },
      error: (m) => {
        vscode.window.showErrorMessage(`Atlas PlantUML Preview: ${m.message}`);
      },
      viewSource: async () => {
        await vscode.window.showTextDocument(this.document.uri);
        this.panel.dispose();
      },
      closePreview: () => this.panel.dispose(),
    };
  }
}
