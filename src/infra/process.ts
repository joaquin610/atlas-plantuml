import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly stdout: Buffer;
  readonly stderr: string;
  readonly exitCode: number | null;
  /** Set when the process could not start or was killed by the timeout. */
  readonly failure?: string;
}

export interface ProcessOptions {
  readonly cwd?: string;
  readonly input?: string;
  readonly timeoutMs: number;
}

/** Runs a command and collects its output. Never rejects: failures are part of the result. */
export function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    let stderr = '';
    let failure: string | undefined;
    let settled = false;
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(stdout), stderr, exitCode, failure });
    };
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    const timer = setTimeout(() => {
      failure = `${command} did not finish within ${Math.round(options.timeoutMs / 1000)} s`;
      child.kill();
    }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      failure = error.message;
      finish(null);
    });
    child.on('close', (code) => finish(code));
    // A process that exits early closes stdin; the write error is reported by 'close'
    child.stdin.on('error', () => {});
    child.stdin.end(options.input ?? '', 'utf-8');
  });
}
