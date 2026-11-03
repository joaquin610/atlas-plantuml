import * as vscode from 'vscode';
import { COMMANDS, VIEW_TYPES } from './ids.ts';
import type { PreviewManager } from './previewManager.ts';

const plural = (count: number) => (count === 1 ? '' : 's');

export function registerCommands(previews: PreviewManager): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(COMMANDS.openPreview, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor?.document.fileName.endsWith('.puml')) {
        vscode.window.showWarningMessage('Please open a .puml file first');
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        editor.document.uri,
        VIEW_TYPES.preview,
      );
    }),
    vscode.commands.registerCommand(COMMANDS.closePreview, () => {
      const count = previews.closeAll();
      vscode.window.showInformationMessage(
        count > 0 ? `Closed ${count} preview${plural(count)}` : 'No previews are currently open',
      );
    }),
    vscode.commands.registerCommand(COMMANDS.reloadWebviews, async () => {
      const count = await previews.reloadVisible();
      vscode.window.showInformationMessage(
        count > 0 ? `Reloaded ${count} preview${plural(count)}` : 'No active previews to reload',
      );
    }),
  ];
}
