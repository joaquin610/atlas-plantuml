import { join } from 'node:path';
import * as vscode from 'vscode';
import { DiskCache } from '../infra/cache/diskCache.ts';
import { PlantUmlRenderer } from '../infra/plantuml/plantumlRenderer.ts';
import { registerCommands } from './commands.ts';
import { DiagnosticsPublisher } from './diagnostics.ts';
import { DIAGNOSTICS_NAME, VIEW_TYPES } from './ids.ts';
import { PreviewManager } from './previewManager.ts';
import { openSplit } from './sourceNavigation.ts';
import { WebviewHtml } from './webviewHtml.ts';

// Composition root: builds the objects and registers them. No behavior lives here.
export function activate(context: vscode.ExtensionContext): void {
  const storage = context.globalStorageUri.fsPath;
  const renderer = new PlantUmlRenderer({
    jarDirs: [context.extensionPath, storage],
    diskCache: new DiskCache(join(storage, 'svg-cache'), '.svg'),
  });
  const diagnostics = new DiagnosticsPublisher(
    vscode.languages.createDiagnosticCollection(DIAGNOSTICS_NAME),
  );
  const previews = new PreviewManager(context.globalState, {
    renderer,
    diagnostics,
    html: new WebviewHtml(context.extensionUri),
    extensionUri: context.extensionUri,
  });
  context.subscriptions.push(
    diagnostics,
    vscode.window.registerCustomEditorProvider(VIEW_TYPES.preview, previews, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.window.registerCustomEditorProvider(VIEW_TYPES.split, {
      resolveCustomTextEditor: (document, panel) => openSplit(document, panel, VIEW_TYPES.preview),
    }),
    ...registerCommands(context.extensionUri, previews),
  );
}

export function deactivate(): void {}
