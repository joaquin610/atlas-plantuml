import { fail, ok, type Result } from '../result.ts';

const STARTUML = /^\s*@startuml\b/;
const ENDUML = /^\s*@enduml\b/;
const INCLUDE = /^\s*!include/m;

export type Eol = '\r\n' | '\n';

export function detectEol(text: string): Eol {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function findStartuml(lines: readonly string[]): number {
  return lines.findIndex((line) => STARTUML.test(line));
}

export function findLastEnduml(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ENDUML.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

/** Inserts directive lines right before the last @enduml; the rest of the text is untouched. */
export function injectBeforeEnduml(source: string, directive: string): Result<string> {
  const lines = splitLines(source);
  const end = findLastEnduml(lines);
  if (end === -1) {
    return fail('No @enduml found in file');
  }
  lines.splice(end, 0, ...directive.split('\n'));
  return ok(lines.join('\n'));
}

/** Output of a diagram with includes depends on other files, so it cannot be cached by its text. */
export function hasIncludes(source: string): boolean {
  return INCLUDE.test(source);
}
