import * as vscode from 'vscode';
import { parseRenderError } from '../core/plantuml/renderError.ts';

/** Mirrors the syntax error PlantUML draws in the SVG as an editor diagnostic. */
export class DiagnosticsPublisher implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor(collection: vscode.DiagnosticCollection) {
    this.collection = collection;
  }

  update(document: vscode.TextDocument, svg: string): void {
    const error = parseRenderError(svg);
    if (!error) {
      this.collection.delete(document.uri);
      return;
    }
    const line = Math.max(0, Math.min(document.lineCount - 1, error.line - 1));
    const text = document.lineAt(line);
    const range = new vscode.Range(
      line,
      text.firstNonWhitespaceCharacterIndex,
      line,
      text.text.length,
    );
    const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'PlantUML';
    this.collection.set(document.uri, [diagnostic]);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
