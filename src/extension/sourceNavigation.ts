import * as vscode from 'vscode';
import { locateDeclarationLine } from '../core/source/locateDeclaration.ts';

/** Opens the source beside the preview (or where it is already open) at an element's line. */
export async function revealSource(
  document: vscode.TextDocument,
  line: number,
  name: string,
): Promise<void> {
  const lines = Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
  const target = locateDeclarationLine(lines, line, name);
  const text = document.lineAt(target);
  const selection = new vscode.Range(
    target,
    text.firstNonWhitespaceCharacterIndex,
    target,
    text.text.length,
  );
  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === document.uri.toString(),
  );
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: visible?.viewColumn ?? vscode.ViewColumn.Beside,
    selection,
    preview: false,
  });
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
}

/** "Preview + Source" editor: the source on the left and the preview beside it. */
export async function openSplit(
  document: vscode.TextDocument,
  placeholder: vscode.WebviewPanel,
  previewViewType: string,
): Promise<void> {
  placeholder.webview.html = '<!DOCTYPE html><html><body></body></html>';
  const column = placeholder.viewColumn ?? vscode.ViewColumn.Active;
  await vscode.window.showTextDocument(document, { viewColumn: column, preview: false });
  await vscode.commands.executeCommand('vscode.openWith', document.uri, previewViewType, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  });
  placeholder.dispose();
}
