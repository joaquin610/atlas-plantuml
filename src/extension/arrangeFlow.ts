import { cpus } from 'node:os';
import * as vscode from 'vscode';
import {
  type ArrangeCandidate,
  arrange,
  type BatchRenderer,
  type ScoredLayout,
} from '../core/arrange/arrange.ts';
import type { ArrangeView } from '../shared/messages.ts';

/** Options found by Arrange, valid while the document stays at `version`. */
export interface ArrangeState {
  readonly version: number;
  readonly baseline: ScoredLayout;
  readonly options: readonly ArrangeCandidate[];
  selected: number;
}

export function toArrangeView(state: ArrangeState): ArrangeView {
  return {
    baseline: state.baseline.crossings,
    selected: state.selected,
    options: state.options.map((o) => ({ crossings: o.crossings, direction: o.direction })),
  };
}

/** Runs the search with a cancellable notification. Undefined when nothing is to be shown. */
export async function searchArrangement(
  document: vscode.TextDocument,
  renderBatch: BatchRenderer,
): Promise<ArrangeState | undefined> {
  // Results describe the text at this moment; edits made meanwhile invalidate them
  const version = document.version;
  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Arranging diagram',
      cancellable: true,
    },
    (progress, token) => {
      let reported = 0;
      return arrange({
        text: document.getText(),
        renderBatch,
        concurrency: Math.max(2, Math.min(4, cpus().length - 1)),
        onProgress: (done, total) => {
          const percent = Math.round((done / total) * 100);
          progress.report({
            increment: percent - reported,
            message: `${done}/${total} layouts tried`,
          });
          reported = percent;
        },
        isCancelled: () => token.isCancellationRequested,
      });
    },
  );
  switch (outcome.kind) {
    case 'cancelled':
      return undefined;
    case 'error':
      vscode.window.showWarningMessage(`Arrange: ${outcome.error}`);
      return undefined;
    case 'done':
      if (outcome.options.length === 0) {
        vscode.window.showInformationMessage(
          `The current layout is already the most readable one found (${outcome.baseline.crossings} crossings).`,
        );
        return undefined;
      }
      return { version, baseline: outcome.baseline, options: outcome.options, selected: 0 };
  }
}

/** Writes the selected order to the file and saves it; Ctrl+Z in the editor undoes it. */
export async function applyArrangement(
  document: vscode.TextDocument,
  state: ArrangeState,
): Promise<void> {
  const option = state.options[state.selected];
  const edit = new vscode.WorkspaceEdit();
  const all = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  edit.replace(document.uri, all, option.source);
  if (!(await vscode.workspace.applyEdit(edit))) {
    vscode.window.showErrorMessage('Arrange: the file could not be updated.');
    return;
  }
  await document.save();
  vscode.window.showInformationMessage(
    `Layout applied: ${state.baseline.crossings} → ${option.crossings} crossings. Undo with Ctrl+Z in the editor.`,
  );
}
