// Layer rules, checked on every test run:
//   core    pure logic: imports only core (no Node, DOM, vscode)
//   shared  extension <-> webview contract: imports core types only
//   infra   Node I/O (Java, files): core and Node, never vscode
//   webview browser page: core, shared and itself, never Node or vscode
//   extension VS Code adapters: may import everything except webview
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from './helpers.ts';

type Layer = 'core' | 'shared' | 'infra' | 'webview' | 'extension';

const ALLOWED: Record<Layer, readonly (Layer | 'node' | 'vscode')[]> = {
  core: ['core'],
  shared: ['core', 'shared'],
  infra: ['core', 'infra', 'node'],
  webview: ['core', 'shared', 'webview'],
  extension: ['core', 'shared', 'infra', 'extension', 'node', 'vscode'],
};

const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function layerOf(file: string): Layer {
  return relative(SRC, file).split(sep)[0] as Layer;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf-8');
  return [...text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
}

function targetOf(file: string, specifier: string): Layer | 'node' | 'vscode' | 'package' {
  if (specifier === 'vscode') {
    return 'vscode';
  }
  if (specifier.startsWith('node:')) {
    return 'node';
  }
  if (!specifier.startsWith('.')) {
    return 'package';
  }
  return layerOf(join(file, '..', specifier));
}

describe('architecture', () => {
  const files = sourceFiles(SRC);

  it('finds the source files', () => {
    assert.ok(files.length > 20);
  });

  for (const file of files) {
    const layer = layerOf(file);
    it(`${relative(ROOT, file)} respects the ${layer} layer`, () => {
      for (const specifier of importsOf(file)) {
        const target = targetOf(file, specifier);
        assert.ok(
          target !== 'package' && ALLOWED[layer].includes(target),
          `${layer} must not import "${specifier}" (${target})`,
        );
        if (target !== 'node' && target !== 'vscode') {
          assert.ok(
            specifier.endsWith('.ts'),
            `relative imports need the .ts extension: ${specifier}`,
          );
        }
      }
    });
  }
});
