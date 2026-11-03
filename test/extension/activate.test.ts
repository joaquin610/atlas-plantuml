// Loads the built extension with a fake `vscode` module and drives a preview through its
// messages. Needs `pnpm run build` and Java (the preview renders with the real jar).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { LAYOUTS } from '../../src/core/plantuml/layouts.ts';
import { COMMANDS, STATE_KEYS, VIEW_TYPES } from '../../src/extension/ids.ts';
import type { PreviewInit } from '../../src/shared/messages.ts';
import { ROOT } from '../helpers.ts';

const bundle = join(ROOT, 'out', 'extension.cjs');
const hasJava = spawnSync('java', ['-version']).status === 0;
const skip = !existsSync(bundle)
  ? 'Run pnpm run build'
  : !hasJava
    ? 'Java is not installed'
    : false;

const disposable = { dispose() {} };

class Uri {
  readonly fsPath: string;
  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }
  static file(path: string) {
    return new Uri(path);
  }
  static joinPath(base: Uri, ...parts: string[]) {
    return new Uri(join(base.fsPath, ...parts));
  }
  toString() {
    return `file://${this.fsPath.replace(/\\/g, '/')}`;
  }
}

class Range {
  readonly start: { line: number; character: number };
  constructor(startLine: number, startCharacter: number) {
    this.start = { line: startLine, character: startCharacter };
  }
}

class Diagnostic {
  readonly range: Range;
  readonly message: string;
  source = '';
  constructor(range: Range, message: string) {
    this.range = range;
    this.message = message;
  }
}

type Provider = {
  resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void>;
};

function createFakeVscode() {
  const editors = new Map<string, Provider>();
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const diagnostics = new Map<string, Diagnostic[]>();
  const messages: string[] = [];
  const vscode = {
    Uri,
    Range,
    Diagnostic,
    DiagnosticSeverity: { Error: 0 },
    ViewColumn: { Active: -1, Beside: -2 },
    ProgressLocation: { Notification: 15 },
    TextEditorRevealType: { InCenter: 2 },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: Uri, list: Diagnostic[]) => diagnostics.set(uri.toString(), list),
        delete: (uri: Uri) => diagnostics.delete(uri.toString()),
        dispose() {},
      }),
    },
    window: {
      registerCustomEditorProvider: (viewType: string, provider: Provider) => {
        editors.set(viewType, provider);
        return disposable;
      },
      showErrorMessage: (m: string) => messages.push(`error: ${m}`),
      showWarningMessage: (m: string) => messages.push(`warning: ${m}`),
      showInformationMessage: (m: string) => messages.push(`info: ${m}`),
      visibleTextEditors: [],
    },
    commands: {
      registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
        commands.set(id, run);
        return disposable;
      },
    },
    workspace: {
      fs: { readFile: async (uri: Uri) => new Uint8Array(await readFile(uri.fsPath)) },
      onDidChangeTextDocument: () => disposable,
      createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} }),
    },
  };
  return { vscode, editors, commands, diagnostics, messages };
}

function fakeDocument(path: string, text: string) {
  const lines = text.split(/\r?\n/);
  return {
    uri: Uri.file(path),
    fileName: path,
    version: 1,
    lineCount: lines.length,
    getText: () => text,
    lineAt: (i: number) => ({
      text: lines[i],
      firstNonWhitespaceCharacterIndex: lines[i].length - lines[i].trimStart().length,
    }),
  };
}

function fakePanel() {
  let receive: (message: unknown) => Promise<void> = async () => {};
  let onDispose = () => {};
  const panel = {
    visible: true,
    viewColumn: 1,
    disposed: false,
    webview: {
      html: '',
      options: {},
      cspSource: 'vscode-resource:',
      asWebviewUri: (uri: Uri) => uri,
      onDidReceiveMessage: (handler: typeof receive) => {
        receive = handler;
        return disposable;
      },
      postMessage: async () => true,
    },
    onDidDispose: (handler: () => void) => {
      onDispose = handler;
      return disposable;
    },
    dispose: () => {
      panel.disposed = true;
      onDispose();
    },
    send: (message: unknown) => receive(message),
  };
  return panel;
}

function initOf(html: string): PreviewInit {
  const json = /<script id="previewInit" type="application\/json">([^<]*)<\/script>/.exec(html);
  assert.ok(json, 'page has its init data');
  return JSON.parse(json[1]);
}

describe('extension (fake VS Code)', { skip }, async () => {
  const fake = createFakeVscode();
  const storage = mkdtempSync(join(tmpdir(), 'atlas-plantuml-ext-'));
  after(() => rmSync(storage, { recursive: true, force: true }));
  const state = new Map<string, unknown>();
  const context = {
    extensionPath: ROOT,
    extensionUri: Uri.file(ROOT),
    globalStorageUri: Uri.file(storage),
    globalState: {
      get: (key: string, fallback: unknown) => (state.has(key) ? state.get(key) : fallback),
      update: async (key: string, value: unknown) => {
        state.set(key, value);
      },
    },
    subscriptions: [] as unknown[],
  };

  const require = createRequire(import.meta.url);
  const Module = require('node:module') as {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const load = Module._load;
  Module._load = (request, ...rest) =>
    request === 'vscode' ? fake.vscode : load.call(Module, request, ...rest);
  const extension = require(bundle) as { activate(context: unknown): void };
  Module._load = load;
  extension.activate(context);

  async function openPreview(name: string, text: string) {
    const path = join(storage, name);
    await writeFile(path, text);
    const panel = fakePanel();
    const provider = fake.editors.get(VIEW_TYPES.preview);
    assert.ok(provider);
    await provider.resolveCustomTextEditor(fakeDocument(path, text), panel);
    return panel;
  }

  it('registers every editor and command', () => {
    assert.deepEqual([...fake.editors.keys()].sort(), Object.values(VIEW_TYPES).sort());
    assert.deepEqual([...fake.commands.keys()].sort(), Object.values(COMMANDS).sort());
  });

  it('renders a preview page with a strict CSP and a nonce on the script', async () => {
    const panel = await openPreview('a.puml', '@startuml\nclass Alpha\nAlpha --> Beta\n@enduml\n');
    const html = panel.webview.html;
    assert.match(html, /<svg[\s\S]*data-entity="Alpha"/);
    const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`<script nonce="${nonce}" src=`));
    assert.deepEqual(initOf(html), {
      dark: false,
      layouts: LAYOUTS.map((layout) => layout.label),
      layoutIndex: 0,
      arrange: null,
    });
  });

  it('switches layout and dark mode from webview messages', async () => {
    const panel = await openPreview(
      'b.puml',
      '@startuml\nclass One\nclass Two\nOne --> Two\n@enduml\n',
    );
    await panel.send({ type: 'setLayout', index: 3 });
    assert.equal(initOf(panel.webview.html).layoutIndex, 3);
    await panel.send({ type: 'setDark', dark: true });
    assert.equal(state.get(STATE_KEYS.darkMode), true);
    assert.equal(initOf(panel.webview.html).dark, true);
    assert.match(panel.webview.html, /#1E1E1E/);
    await panel.send({ type: 'setDark', dark: false });
  });

  it('ignores malformed messages', async () => {
    const panel = await openPreview('c.puml', '@startuml\nclass C\n@enduml\n');
    const before = panel.webview.html;
    const errors = fake.messages.length;
    await panel.send({ type: 'setLayout', index: 'x' });
    await panel.send({ nope: true });
    assert.equal(panel.webview.html, before);
    assert.equal(fake.messages.length, errors);
  });

  it('reports syntax errors as diagnostics and clears them on close', async () => {
    const panel = await openPreview('broken.puml', '@startuml\nclass A\nA -->\n@enduml\n');
    const uri = Uri.file(join(storage, 'broken.puml')).toString();
    const list = fake.diagnostics.get(uri);
    assert.equal(list?.length, 1);
    assert.equal(list?.[0].range.start.line, 2);
    assert.match(list?.[0].message ?? '', /Syntax Error/);
    panel.dispose();
    assert.equal(fake.diagnostics.has(uri), false);
  });

  it('closes every open preview with the command', async () => {
    const panel = await openPreview('d.puml', '@startuml\nclass D\n@enduml\n');
    await fake.commands.get(COMMANDS.closePreview)?.();
    assert.ok(panel.disposed);
    assert.match(fake.messages.at(-1) ?? '', /^info: Closed \d+ previews?$/);
  });
});
