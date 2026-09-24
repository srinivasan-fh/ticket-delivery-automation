import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

export function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// The prompt (which contains Jira text) never enters the shell string: it is
// read from a file the dashboard wrote, so ticket content cannot inject commands.
export function buildShellCommand({ repoPath, bin, args, promptFile }) {
  return `cd ${shQuote(repoPath)} && ${[bin, ...args].map(shQuote).join(' ')} "$(cat ${shQuote(promptFile)})"`;
}

export function terminalInvocation(platform, command, terminalCmd) {
  if (terminalCmd) {
    const [file, ...rest] = terminalCmd.trim().split(/\s+/);
    return { file, args: rest.map((a) => (a === '{cmd}' ? command : a)) };
  }
  if (platform === 'darwin') {
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
      file: 'osascript',
      args: ['-e', `tell application "Terminal" to do script "${escaped}"`, '-e', 'tell application "Terminal" to activate'],
    };
  }
  if (platform === 'linux') return { file: 'x-terminal-emulator', args: ['-e', 'bash', '-lc', command] };
  return null;
}

export function launchDetached({ file, args }, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(file, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

// Headless `claude -p` run; output goes to a file the dashboard can show.
export function runHeadless({ bin, args, prompt, cwd, outFile }, spawnImpl = spawn) {
  const out = createWriteStream(outFile);
  const child = spawnImpl(bin, ['-p', prompt, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  let done = false;
  const finish = (line) => {
    if (done) return;
    done = true;
    out.end(`\n\n---\n${line}\n`);
  };
  child.once('error', (err) => finish(`Failed to start: ${err.message}`));
  child.once('close', (code) => finish(`Exited with code ${code}`));
  return child;
}
