import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

import { loadConfig } from './config.js';
import { createJiraClient } from './jira.js';
import { createPortalClient } from './portal.js';
import { createStore } from './store.js';
import { launchDetached, runHeadless } from './launcher.js';
import { createApp } from './server.js';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const run = promisify(execFile);

const app = createApp({
  config,
  jira: createJiraClient(config.jira),
  portal: createPortalClient(config.portal),
  store: createStore(path.join(config.dataDir, 'state.json')),
  platform: process.platform,
  exec: async (file, args) => (await run(file, args, { timeout: 10000 })).stdout,
  launch: (inv) => launchDetached(inv),
  runHeadless: (opts) => runHeadless(opts),
});

app.listen(config.port, config.host, () => {
  console.log(`Ticket Delivery Automation → http://localhost:${config.port}`);
});
