import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Checklist progress per ticket, kept in a local JSON file.
// Shape: { tickets: { KEY: { checks: { stageId: { itemId: isoDate } } } }, access: { itemId: isoDate } }
export function createStore(file) {
  let cache;
  let queue = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      cache = {};
    }
    cache.tickets ??= {};
    cache.access ??= {};
    return cache;
  }

  async function save() {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(cache, null, 2));
    await rename(`${file}.tmp`, file);
  }

  function serial(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }

  function toggle(bucket, id, done) {
    if (done) bucket[id] = new Date().toISOString();
    else delete bucket[id];
  }

  return {
    async all() {
      return structuredClone(await load());
    },
    setCheck(key, stage, item, done) {
      return serial(async () => {
        const s = await load();
        const ticket = (s.tickets[key] ??= { checks: {} });
        toggle((ticket.checks[stage] ??= {}), item, done);
        await save();
        return structuredClone(ticket);
      });
    },
    setAccess(item, done) {
      return serial(async () => {
        const s = await load();
        toggle(s.access, item, done);
        await save();
        return structuredClone(s.access);
      });
    },
  };
}
