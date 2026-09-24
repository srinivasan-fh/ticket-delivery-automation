import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';

test('checks and access persist and serialise concurrent writes', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tda-')), 'nested', 'state.json');
  const store = createStore(file);
  assert.deepEqual(await store.all(), { tickets: {}, access: {} });
  await Promise.all([store.setCheck('A-1', 'develop', 'a', true), store.setCheck('A-1', 'develop', 'b', true), store.setAccess('x', true)]);
  const t = await store.setCheck('A-1', 'develop', 'a', false);
  assert.deepEqual(Object.keys(t.checks.develop), ['b']);
  const reloaded = await createStore(file).all();
  assert.deepEqual(Object.keys(reloaded.tickets['A-1'].checks.develop), ['b']);
  assert.ok(reloaded.access.x);
  assert.deepEqual(await store.setAccess('x', false), {});
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).access, {});
});

test('corrupt file surfaces an error', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tda-')), 'state.json');
  writeFileSync(file, '{nope');
  await assert.rejects(createStore(file).all());
});
