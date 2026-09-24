import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildShellCommand, launchDetached, runHeadless, shQuote, terminalInvocation } from '../src/launcher.js';

test('shQuote survives quotes and shell metacharacters', () => {
  const nasty = `it's $(whoami) \`id\` ; "x"`;
  assert.equal(execFileSync('sh', ['-c', `printf %s ${shQuote(nasty)}`], { encoding: 'utf8' }), nasty);
});

test('buildShellCommand reads the prompt from a file, never inlines it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tda-'));
  const promptFile = path.join(dir, 'p.md');
  writeFileSync(promptFile, 'Summary: $(touch pwned) `id`');
  const cmd = buildShellCommand({ repoPath: dir, bin: 'printf', args: ['%s'], promptFile });
  assert.equal(execFileSync('sh', ['-c', cmd], { encoding: 'utf8' }), 'Summary: $(touch pwned) `id`');
  assert.throws(() => readFileSync(path.join(dir, 'pwned')));
});

test('terminalInvocation per platform and custom template', () => {
  assert.deepEqual(terminalInvocation('linux', 'c'), { file: 'x-terminal-emulator', args: ['-e', 'bash', '-lc', 'c'] });
  const mac = terminalInvocation('darwin', `cd 'a' && x "$(cat 'p')"`);
  assert.equal(mac.file, 'osascript');
  assert.equal(mac.args[1], `tell application "Terminal" to do script "cd 'a' && x \\"$(cat 'p')\\""`);
  assert.equal(terminalInvocation('win32', 'c'), null);
  assert.deepEqual(terminalInvocation('win32', 'c d', ' kitty  bash -lc {cmd} '), { file: 'kitty', args: ['bash', '-lc', 'c d'] });
});

test('launchDetached resolves on spawn and rejects on error', async () => {
  const fake = (event) => () => {
    const child = new EventEmitter();
    child.unref = () => { child.unrefd = true; };
    setImmediate(() => child.emit(event, new Error('ENOENT')));
    fake.last = child;
    return child;
  };
  await launchDetached({ file: 'x', args: [] }, fake('spawn'));
  assert.ok(fake.last.unrefd);
  await assert.rejects(launchDetached({ file: 'x', args: [] }, fake('error')), /ENOENT/);
});

test('runHeadless writes output and exit code', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tda-'));
  const outFile = path.join(dir, 'out.md');
  // `node -p <expr>` mimics `claude -p <prompt>`
  const child = runHeadless({ bin: process.execPath, args: [], prompt: '"hello from " + "run"', cwd: dir, outFile });
  await new Promise((r) => child.once('close', r));
  await new Promise((r) => setTimeout(r, 50));
  const out = readFileSync(outFile, 'utf8');
  assert.match(out, /hello from run/);
  assert.match(out, /Exited with code 0/);
});

test('runHeadless records a failed start once', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tda-'));
  const outFile = path.join(dir, 'out.md');
  const child = runHeadless({ bin: path.join(dir, 'missing-bin'), args: [], prompt: 'x', cwd: dir, outFile });
  await new Promise((r) => child.once('close', r));
  await new Promise((r) => setTimeout(r, 50));
  const out = readFileSync(outFile, 'utf8');
  assert.match(out, /Failed to start/);
  assert.doesNotMatch(out, /Exited with code/);
});
