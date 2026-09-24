import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postToCliq } from '../src/cliq.js';

test('postToCliq is a no-op without a webhook and never throws', async () => {
  assert.equal(await postToCliq('', 'x'), false);
  let body;
  assert.equal(await postToCliq('https://cliq/x', 'hi', async (u, o) => { body = JSON.parse(o.body); return { ok: true }; }), true);
  assert.deepEqual(body, { text: 'hi' });
  assert.equal(await postToCliq('https://cliq/x', 'hi', async () => { throw new Error('down'); }), false);
});
