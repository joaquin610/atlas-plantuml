import * as vscode from 'vscode';
import { describe } from './exportImage.ts';
import { COMMANDS, VIEW_TYPES } from './ids.ts';
import type { PreviewManager } from './previewManager.ts';

const plural = (count: number) => (count === 1 ? '' : 's');

export function registerCommands(
  extensionUri: vscode.Uri,
  previews: PreviewManager,
): vscode.Disposable[] {
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
    vscode.commands.registerCommand(COMMANDS.writeCursorRules, () =>
      writeCursorRules(extensionUri),
    ),
  ];
}

/** Copies the bundled Cursor rules to .cursor/rules, or opens them when that is not possible. */
async function writeCursorRules(extensionUri: vscode.Uri): Promise<void> {
  try {
    const rules = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(extensionUri, 'resources', 'plan-uml.mdc'),
    );
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      const dir = vscode.Uri.joinPath(folder.uri, '.cursor', 'rules');
      try {
        await vscode.workspace.fs.createDirectory(dir);
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, 'plan-uml.mdc'), rules);
        vscode.window.showInformationMessage('Cursor rules written to .cursor/rules/plan-uml.mdc');
        return;
      } catch (error) {
        console.log('[Atlas PlantUML] Could not write cursor rules file:', error);
      }
    }
    const doc = await vscode.workspace.openTextDocument({
      content: new TextDecoder().decode(rules),
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
      folder
        ? 'Could not write to .cursor/rules/plan-uml.mdc. File opened in editor - please copy it manually to .cursor/rules/plan-uml.mdc'
        : 'No workspace folder found. File opened in editor - please copy it manually to .cursor/rules/plan-uml.mdc in your workspace',
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to write cursor rules: ${describe(error)}`);
  }
}
