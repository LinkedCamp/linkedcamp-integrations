#!/usr/bin/env node
// §7.4 webhook lifecycle check against the TEST sub-account. This CREATES and
// DELETES a REST webhook, so it refuses to run without --confirm.
//
//   node scripts/webhook-cycle.mjs --event REPLY_DETECTED --callback-url https://<your inbox> --confirm
//
// 1. POST /webhooks, 2. GET /webhooks shows the URL, 3. waits for you to cause
// one real event and save the delivered body (then import it with
// `node scripts/bootstrap.mjs --payload <EVENT> <file>`), 4. DELETE, 5. GET shows it gone.
// Never prints the key.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.linkedcamp.com';
const EVENTS = ['REPLY_DETECTED', 'ACCEPTS_REQUEST', 'CONNECT_INVITED', 'EMAIL_SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED'];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const key = process.env.LINKEDCAMP_TEST_API_KEY || (() => {
  const p = path.join(ROOT, '.env.local');
  const m = fs.existsSync(p) && fs.readFileSync(p, 'utf8').match(/^\s*LINKEDCAMP_TEST_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : undefined;
})();
const event = arg('--event');
const callbackUrl = arg('--callback-url');

if (!process.argv.includes('--confirm')) { console.error('Refusing: pass --confirm (this creates and deletes a webhook on the test account).'); process.exit(2); }
if (!key) { console.error('LINKEDCAMP_TEST_API_KEY is not set.'); process.exit(2); }
if (!EVENTS.includes(event)) { console.error(`--event must be one of ${EVENTS.join(', ')}`); process.exit(2); }
if (!/^https:\/\//.test(callbackUrl || '')) { console.error('--callback-url must be an https URL you control.'); process.exit(2); }

const rest = async (method, p, body) => {
  const res = await fetch(`${API}${p}`, { method, headers: { token: key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (data.success !== true) throw new Error(`${method} ${p}: ${data.message || res.status}`);
  return data;
};
const findHook = async () => ((await rest('GET', '/webhooks')).data || []).filter((h) => h.callbackUrl === callbackUrl);

const created = await rest('POST', '/webhooks', { title: `Lifecycle test – ${event}`, callbackUrl, event });
console.log(`1. created: ${created.message}${created.data && created.data._id ? ' (response included data._id)' : ' (no id in response)'}`);
const hooks = await findHook();
if (!hooks.length) throw new Error('2. GET /webhooks does not show the callback URL');
const id = (created.data && created.data._id) || hooks[hooks.length - 1]._id;
console.log(`2. listed: ${hooks.length} hook(s) with this URL; events ${JSON.stringify(hooks[hooks.length - 1].events)}, isValid ${hooks[hooks.length - 1].isValid}`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question(`3. Cause one real ${event} on the test account, save the delivered JSON body to a file, then press Enter to unsubscribe… `);
rl.close();
await rest('DELETE', `/webhooks/${encodeURIComponent(id)}`);
const after = await findHook();
console.log(after.some((h) => h._id === id) ? '5. FAILED: hook still listed after DELETE' : '4-5. deleted and no longer listed');
console.log(`Import the payload: node scripts/bootstrap.mjs --payload ${event} <file>`);
