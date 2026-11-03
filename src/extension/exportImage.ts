import { basename } from 'node:path';
import * as vscode from 'vscode';

export type ExportFormat = 'png' | 'svg';

/** Asks where to save the diagram as shown and writes it there. */
export async function saveExport(
  document: vscode.TextDocument,
  format: ExportFormat,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.length === 0) {
    vscode.window.showErrorMessage('Atlas PlantUML export failed: nothing to export yet.');
    return;
  }
  const base = document.uri.fsPath.replace(/\.[^./\\]+$/, '');
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${base}.${format}`),
    filters: format === 'png' ? { 'PNG image': ['png'] } : { 'SVG image': ['svg'] },
  });
  if (!target) {
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.showInformationMessage(`Diagram exported to ${basename(target.fsPath)}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Atlas PlantUML export failed: ${describe(error)}`);
  }
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
