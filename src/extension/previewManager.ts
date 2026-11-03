import type * as vscode from 'vscode';
import { STATE_KEYS } from './ids.ts';
import { type DarkPreference, PreviewSession, type SessionDeps } from './previewSession.ts';

/** Custom editor provider: creates one session per preview and shares the dark preference. */
export class PreviewManager implements vscode.CustomTextEditorProvider, DarkPreference {
  private readonly sessions = new Set<PreviewSession>();

  private readonly globalState: vscode.Memento;

  private readonly deps: Omit<SessionDeps, 'preferences'>;

  constructor(globalState: vscode.Memento, deps: Omit<SessionDeps, 'preferences'>) {
    this.globalState = globalState;

    this.deps = deps;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const session = new PreviewSession(document, panel, { ...this.deps, preferences: this }, (s) =>
      this.forget(s),
    );
    this.sessions.add(session);
    await session.refresh({ force: true });
  }

  isDark(): boolean {
    return this.globalState.get<boolean>(STATE_KEYS.darkMode, false) === true;
  }

  /** The preference is global: every open preview re-renders with the new colors. */
  async setDark(dark: boolean): Promise<void> {
    await this.globalState.update(STATE_KEYS.darkMode, dark);
    await Promise.all([...this.sessions].map((session) => session.refresh()));
  }

  closeAll(): number {
    const count = this.sessions.size;
    for (const session of [...this.sessions]) {
      session.panel.dispose();
    }
    return count;
  }

  async reloadVisible(): Promise<number> {
    const visible = [...this.sessions].filter((session) => session.panel.visible);
    const results = await Promise.allSettled(
      visible.map((session) => session.refresh({ force: true })),
    );
    return results.filter((result) => result.status === 'fulfilled').length;
  }

  private forget(session: PreviewSession): void {
    this.sessions.delete(session);
    const uri = session.document.uri.toString();
    if (![...this.sessions].some((other) => other.document.uri.toString() === uri)) {
      this.deps.diagnostics.clear(session.document.uri);
    }
  }
}
