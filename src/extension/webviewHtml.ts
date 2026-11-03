import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { escapeHtml, fillTemplate, toScriptJson } from '../core/html.ts';
import type { PreviewInit } from '../shared/messages.ts';

export interface PreviewPage {
  readonly svg: string;
  readonly init: PreviewInit;
}

export interface ErrorPage {
  readonly message: string;
  /** Set when a non-default layout is active, so the page can offer to switch back. */
  readonly layoutLabel?: string;
}

/** Builds the webview documents. Scripts run only with the page nonce (strict CSP). */
export class WebviewHtml {
  private template: Promise<string> | undefined;

  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  async preview(webview: vscode.Webview, page: PreviewPage): Promise<string> {
    const nonce = createNonce();
    const media = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file)).toString();
    const script = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js'))
      .toString();
    return fillTemplate(await this.loadTemplate(), {
      csp: contentSecurityPolicy(webview.cspSource, nonce),
      nonce,
      styleUri: media('preview.css'),
      scriptUri: script,
      init: toScriptJson(page.init),
      svg: page.svg,
    });
  }

  error(webview: vscode.Webview, page: ErrorPage): string {
    const nonce = createNonce();
    const layoutControls = page.layoutLabel
      ? `<p>Layout: ${escapeHtml(page.layoutLabel)}
        <button id="nextLayout">Next layout</button>
        <button id="defaultLayout">Back to default</button></p>
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('nextLayout').onclick = () => vscode.postMessage({ type: 'cycleLayout', step: 1 });
        document.getElementById('defaultLayout').onclick = () => vscode.postMessage({ type: 'resetLayout' });
      </script>`
      : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(webview.cspSource, nonce)}">
  <title>Atlas PlantUML Preview - Error</title>
  <style>
    body { margin: 0; padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
    .error { color: var(--vscode-errorForeground); padding: 20px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="error">
    <h2>Atlas PlantUML Rendering Error</h2>
    <p>${escapeHtml(page.message)}</p>
    <p><strong>Tip:</strong> Make sure Java is installed and available in your PATH.</p>
    ${layoutControls}
  </div>
</body>
</html>`;
  }

  private loadTemplate(): Promise<string> {
    this.template ??= Promise.resolve(
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.html')),
    ).then((bytes) => new TextDecoder().decode(bytes));
    return this.template;
  }
}

function createNonce(): string {
  return randomBytes(16).toString('base64');
}

function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}
