// package.json and the code must agree on every identifier and packaged file.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { COMMANDS, VIEW_TYPES } from '../src/extension/ids.ts';
import { JAR_FILENAME } from '../src/infra/plantuml/plantumlRenderer.ts';
import { ROOT } from './helpers.ts';

interface Manifest {
  readonly main: string;
  readonly icon: string;
  readonly contributes: {
    readonly commands: readonly { command: string }[];
    readonly customEditors: readonly { viewType: string }[];
    readonly grammars: readonly { path: string }[];
    readonly languages: readonly { configuration: string }[];
  };
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as Manifest;
const vscodeignore = readFileSync(join(ROOT, '.vscodeignore'), 'utf-8');

describe('package.json', () => {
  it('declares exactly the commands the extension registers', () => {
    const declared = manifest.contributes.commands.map((c) => c.command).sort();
    assert.deepEqual(declared, Object.values(COMMANDS).sort());
  });

  it('declares exactly the custom editors the extension registers', () => {
    const declared = manifest.contributes.customEditors.map((e) => e.viewType).sort();
    assert.deepEqual(declared, Object.values(VIEW_TYPES).sort());
  });

  it('points to files that exist and are packaged', () => {
    const files = [
      manifest.icon,
      ...manifest.contributes.grammars.map((g) => g.path),
      ...manifest.contributes.languages.map((l) => l.configuration),
      'media/preview.html',
      'media/preview.css',
      JAR_FILENAME,
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
    ].map((file) => file.replace(/^\.\//, ''));
    for (const file of files) {
      assert.ok(existsSync(join(ROOT, file)), `missing ${file}`);
    }
    for (const bundle of [manifest.main, './out/webview.js']) {
      assert.ok(vscodeignore.includes(`!${bundle.replace(/^\.\//, '')}`), `${bundle} not packaged`);
    }
  });
});
