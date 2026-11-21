#!/usr/bin/env node
// Capture bootstrap (§7.1). Read-only. Needs LINKEDCAMP_TEST_API_KEY (test
// sub-account) in the environment or in the git-ignored .env.local.
// Never prints, logs or writes the key. Writes only anonymised captures.
//
//   node scripts/bootstrap.mjs                    full read-only capture
//   node scripts/bootstrap.mjs --payload EVENT f  anonymise a webhook payload
//                                                 file and save it as a capture
//                                                 + Zapier sample
//   node scripts/bootstrap.mjs --derive           rebuild output map + samples
//                                                 from existing captures

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURES = path.join(ROOT, 'spec', 'captures');
const ZAP_SAMPLES = path.join(ROOT, 'zapier', 'samples');
const OUTPUT_MAP = path.join(ROOT, 'zapier', 'lib', 'output-map.json');
const MCP_URL = 'https://mcp.linkedcamp.com/mcp';
const PROTOCOL = '2025-06-18';

const EVENTS = ['REPLY_DETECTED', 'ACCEPTS_REQUEST', 'CONNECT_INVITED', 'EMAIL_SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED'];
const HOOK_KEYS = {
  REPLY_DETECTED: 'new_reply', ACCEPTS_REQUEST: 'new_connection_accepted', CONNECT_INVITED: 'new_connection_request_sent',
  EMAIL_SENT: 'new_email_sent', OPENED: 'new_email_open', CLICKED: 'new_email_link_click', BOUNCED: 'new_email_bounce',
  UNSUBSCRIBED: 'new_unsubscribe',
};

// The only tools this script may call. All are read-only.
const READ_ONLY = new Set([
  'whoami', 'reference', 'campaign_list', 'campaign_get', 'lead_list', 'lead_get', 'conversation_list',
  'analytics_campaign', 'analytics_campaign_funnel', 'appointment_list', 'linkedin_account_list', 'tag_list',
  'subaccount_list',
]);
const LIST_TOOLS = ['appointment_list', 'campaign_list', 'lead_list', 'conversation_list', 'linkedin_account_list', 'subaccount_list', 'tag_list'];

// Arguments §4 documents per tool (used to diff against live inputSchemas).
const EXPECTED_ARGS = {
  whoami: [],
  appointment_list: ['leadId', 'conversationId', 'status', 'page'],
  campaign_list: ['keyword', 'status', 'page', 'userId'],
  lead_list: ['keyword', 'campaignId', 'status', 'tags', 'range', 'page', 'pageSize'],
  lead_add: ['campaignId', 'profileLink', 'email', 'firstName', 'lastName', 'fullName', 'designation', 'location', 'phone', 'website', 'salesNavLink', 'recruiterLink', 'personalization', 'customFields'],
  campaign_upload_leads: ['campaignId', 'header', 'leads', 'removeDuplicates'],
  lead_update: ['leadId', 'email', 'firstName', 'lastName', 'designation', 'phone', 'website', 'personalization', 'paused', 'isExcluded', 'isInterested', 'seen', 'customFields'],
  lead_note_add: ['leadId', 'content'],
  message_send: ['conversationId', 'content', 'attachment'],
  message_draft_ai_reply: ['conversationId', 'provider', 'prompt'],
  conversation_update: ['conversationId', 'isArchived', 'seen', 'assistant', 'pauseBotOnManualMessage'],
  campaign_set_status: ['campaignId', 'status'],
  campaign_launch: ['campaignId', 'skipPreflight'],
  campaign_create: ['title', 'sourceUrl'],
  blacklist_add: ['linkedAccountId', 'type', 'keyword'],
  tag_create: ['content', 'interest'],
  task_upsert: ['taskId', 'title', 'content', 'leadId', 'conversationId', 'link', 'tag', 'date', 'isCompleted'],
  reminder_create: ['title', 'remindAt', 'description', 'leadId', 'conversationId', 'linkedAccountId'],
  campaign_get: ['campaignId', 'includeFlow'],
  lead_get: ['leadId', 'includeActivities', 'includeMessages'],
  analytics_campaign: ['campaignId', 'range', 'includeGraph', 'userId'],
  analytics_campaign_funnel: ['campaignId', 'range'],
  conversation_list: ['campaignId', 'keyword', 'platform', 'type', 'tags', 'linkedAccountId', 'emailAccountId', 'page'],
  linkedin_account_list: [],
  subaccount_list: ['keyword', 'page', 'pageSize'],
};

// ---------- env ----------
const loadKey = () => {
  if (process.env.LINKEDCAMP_TEST_API_KEY) return process.env.LINKEDCAMP_TEST_API_KEY.trim();
  for (const f of ['.env.local', 'make/.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^\s*LINKEDCAMP_TEST_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  return undefined;
};

// ---------- anonymiser ----------
const SENSITIVE_KEY = /(^|_)(name|firstname|lastname|fullname|email|phone|mobile|address|location|city|headline|summary|about|designation|title|company|companyname|occupation|avatar|image|picture|photo|profile.*|.*link|.*url|website|content|message|body|text|subject|note|description|snippet|preview|signature|password|token|secret|apikey|key)$/i;
const KEEP_KEY = /^(_id|id|.*Id|status|type|platform|event|events|interest|provider|plan|role|state|isValid|is[A-Z].*|has[A-Z].*|.*At|.*Date|date|createdAt|updatedAt|page|pageSize|total|count|.*Count|limit|currency)$/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

const token = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8);

const anonString = (key, v) => {
  if (KEEP_KEY.test(key) && !SENSITIVE_KEY.test(key)) {
    return v.replace(EMAIL_RE, (e) => `user-${token(e)}@example.com`).replace(URL_RE, (u) => `https://example.com/${token(u)}`);
  }
  if (SENSITIVE_KEY.test(key)) {
    if (EMAIL_RE.test(v)) { EMAIL_RE.lastIndex = 0; return `user-${token(v)}@example.com`; }
    if (/^https?:\/\//i.test(v)) return `https://example.com/${token(v)}`;
    return `redacted-${token(v)}`;
  }
  return v
    .replace(EMAIL_RE, (e) => `user-${token(e)}@example.com`)
    .replace(URL_RE, (u) => `https://example.com/${token(u)}`)
    .replace(PHONE_RE, (p) => (p.replace(/\D/g, '').length >= 9 ? '+10000000000' : p));
};

const anonymise = (value, key = '') => {
  if (Array.isArray(value)) return value.map((v) => anonymise(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = anonymise(v, k);
    return out;
  }
  if (typeof value === 'string') return anonString(key, value);
  return value;
};

// ---------- MCP ----------
const parseBody = (text, contentType, id) => {
  if (!text || !text.trim()) return undefined;
  const sse = (contentType || '').includes('text/event-stream') || /^\s*(event|data):/m.test(text);
  if (!sse) { try { return JSON.parse(text); } catch { return undefined; } }
  const msgs = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    try { msgs.push(JSON.parse(data)); } catch { /* skip */ }
  }
  return msgs.find((m) => m && m.id === id) || msgs[0];
};

const makeClient = (key) => {
  const session = { id: undefined, version: PROTOCOL };
  const post = async (payload, { withSession = true } = {}) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-Api-Key': key };
    if (withSession && session.id) headers['Mcp-Session-Id'] = session.id;
    if (withSession) headers['MCP-Protocol-Version'] = session.version;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, contentType: res.headers.get('content-type'), sessionId: res.headers.get('mcp-session-id'), text };
    } finally { clearTimeout(t); }
  };
  const call = async (name, args = {}) => {
    if (!READ_ONLY.has(name)) throw new Error(`refusing non-read-only tool ${name}`);
    const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } });
    const msg = parseBody(r.text, r.contentType, 2);
    if (r.status === 401 || msg?.error?.code === -32001) throw new Error('auth rejected (-32001/401)');
    if (r.status === 403) throw new Error('HTTP 403 forbidden');
    if (msg?.error) throw new Error(`JSON-RPC ${msg.error.code}: ${msg.error.message}`);
    if (!msg?.result) throw new Error(`empty response (HTTP ${r.status})`);
    if (msg.result.isError) throw new Error(`tool error: ${(msg.result.content || []).map((c) => c.text).join(' ').slice(0, 300)}`);
    const result = msg.result;
    let output;
    if (result.structuredContent != null) output = result.structuredContent;
    else { try { output = JSON.parse(result.content?.[0]?.text); } catch { output = { text: result.content?.[0]?.text }; } }
    return { output, hasStructured: result.structuredContent != null, contentType: r.contentType };
  };
  return { session, post, call };
};

// ---------- helpers ----------
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
};
const rel = (p) => path.relative(ROOT, p);
const toList = (out) => {
  if (Array.isArray(out)) return { list: out, listKey: null };
  if (out && typeof out === 'object') {
    const keys = Object.keys(out).filter((k) => Array.isArray(out[k]));
    if (keys.length === 1) return { list: out[keys[0]], listKey: keys[0] };
    if (keys.length > 1) return { list: out[keys[0]], listKey: keys[0], ambiguous: keys };
  }
  return { list: [], listKey: null };
};
const idOf = (item) => (item && (item._id ?? item.id)) || undefined;
const idKeyOf = (item) => (item && item._id != null ? '_id' : item && item.id != null ? 'id' : null);

// ---------- derive output map + Zapier samples from captures ----------
const derive = () => {
  const map = JSON.parse(fs.readFileSync(OUTPUT_MAP, 'utf8'));
  const notes = [];
  for (const tool of LIST_TOOLS) {
    const f = path.join(CAPTURES, `${tool}.json`);
    if (!fs.existsSync(f)) continue;
    const { list, listKey, ambiguous } = toList(JSON.parse(fs.readFileSync(f, 'utf8')));
    const idKey = list.length ? idKeyOf(list[0]) : null;
    map.tools[tool] = { listKey, idKey };
    if (ambiguous) notes.push(`${tool}: several array properties (${ambiguous.join(', ')}); picked ${listKey}`);
    if (list.length && !idKey) notes.push(`${tool}: items have neither _id nor id`);
    if (!list.length) notes.push(`${tool}: empty list captured; id key unconfirmed`);
  }
  map.provisional = notes.length > 0 || LIST_TOOLS.some((t) => !fs.existsSync(path.join(CAPTURES, `${t}.json`)));
  write(OUTPUT_MAP, map);

  const first = (tool) => {
    const f = path.join(CAPTURES, `${tool}.json`);
    if (!fs.existsSync(f)) return undefined;
    const { list } = toList(JSON.parse(fs.readFileSync(f, 'utf8')));
    if (!list.length) return undefined;
    const item = list[0];
    return { ...item, id: String(idOf(item) ?? token(JSON.stringify(item))) };
  };
  const whole = (tool) => {
    const f = path.join(CAPTURES, `${tool}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined;
  };
  const samples = {
    new_appointment: first('appointment_list'), find_appointment: first('appointment_list'),
    new_campaign: first('campaign_list'), find_campaign: first('campaign_list'),
    new_replied_lead: first('lead_list'), find_lead: first('lead_list'),
    find_conversation: first('conversation_list'),
    get_campaign: whole('campaign_get'), get_lead: whole('lead_get'), get_campaign_stats: whole('analytics_campaign'),
  };
  for (const ev of EVENTS) {
    const f = path.join(CAPTURES, `payload-${ev}.json`);
    if (!fs.existsSync(f)) continue;
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    const body = Array.isArray(p) ? p[0] : p;
    samples[HOOK_KEYS[ev]] = { ...body, id: crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex') };
    write(path.join(ZAP_SAMPLES, `payload-${ev}.json`), p);
  }
  let n = 0;
  for (const [key, sample] of Object.entries(samples)) {
    if (sample && typeof sample === 'object') { write(path.join(ZAP_SAMPLES, `${key}.json`), sample); n += 1; }
  }
  console.log(`derived output map (${rel(OUTPUT_MAP)}) and ${n} Zapier samples`);
  notes.forEach((x) => console.log(`  note: ${x}`));
};

// ---------- webhook payload import ----------
const importPayload = (event, file) => {
  if (!EVENTS.includes(event)) throw new Error(`unknown event ${event}; one of ${EVENTS.join(', ')}`);
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  write(path.join(CAPTURES, `payload-${event}.json`), anonymise(raw));
  console.log(`saved ${rel(path.join(CAPTURES, `payload-${event}.json`))} (anonymised)`);
  derive();
};

// ---------- full capture ----------
const capture = async () => {
  const key = loadKey();
  if (!key) {
    console.error('LINKEDCAMP_TEST_API_KEY is not set (env or .env.local). Use the TEST sub-account key.');
    process.exit(2);
  }
  const c = makeClient(key);
  const behaviour = [];
  const log = (s) => { behaviour.push(s); console.log(s); };

  // 0. Does tools/call work without initialize? (matters for Make)
  const bare = await c.post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } }, { withSession: false });
  const bareMsg = parseBody(bare.text, bare.contentType, 2);
  const bareOk = bare.status === 200 && bareMsg && bareMsg.result && !bareMsg.result.isError;

  // 1. initialize
  const init = await c.post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'linkedcamp-bootstrap', version: '1.0.0' } } }, { withSession: false });
  const initMsg = parseBody(init.text, init.contentType, 1);
  if (init.status === 401 || initMsg?.error?.code === -32001) { console.error('API key rejected (-32001).'); process.exit(3); }
  c.session.id = init.sessionId || undefined;
  c.session.version = initMsg?.result?.protocolVersion || PROTOCOL;
  const notif = await c.post({ jsonrpc: '2.0', method: 'notifications/initialized' });

  // tools/list
  const tl = await c.post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
  const tlMsg = parseBody(tl.text, tl.contentType, 3);
  const tools = tlMsg?.result?.tools || [];
  write(path.join(CAPTURES, 'tools-list.json'), tlMsg?.result || {});

  log('# Server behaviour (captured by scripts/bootstrap.mjs)');
  log('');
  log(`- Captured: ${new Date().toISOString()}`);
  log(`- \`initialize\` HTTP ${init.status}, Content-Type \`${init.contentType}\``);
  log(`- \`mcp-session-id\` issued: **${init.sessionId ? 'yes' : 'no'}**`);
  log(`- Negotiated protocol version: \`${c.session.version}\` (requested ${PROTOCOL})`);
  log(`- \`notifications/initialized\` HTTP ${notif.status}`);
  log(`- \`tools/call\` without \`initialize\` works: **${bareOk ? 'yes' : 'no'}** (HTTP ${bare.status}, Content-Type \`${bare.contentType}\`)`);
  log(`- \`tools/list\` HTTP ${tl.status}, Content-Type \`${tl.contentType}\`, ${tools.length} tools visible to this key`);
  log(`- \`tools/list\` exposes \`outputSchema\` on ${tools.filter((t) => t.outputSchema).length} tools`);

  // schema diff
  const diff = [];
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const [name, expected] of Object.entries(EXPECTED_ARGS)) {
    const t = byName[name];
    if (!t) { diff.push(`- \`${name}\`: not in tools/list for this key`); continue; }
    const live = Object.keys(t.inputSchema?.properties || {});
    const missing = expected.filter((a) => !live.includes(a));
    const extra = live.filter((a) => !expected.includes(a));
    if (missing.length) diff.push(`- \`${name}\`: §4 argument(s) not in live schema: ${missing.join(', ')}`);
    if (extra.length) diff.push(`- \`${name}\`: live schema has extra argument(s): ${extra.join(', ')}`);
  }
  write(path.join(CAPTURES, 'schema-diff-live.md'), `# Live inputSchema vs §4\n\n${diff.length ? diff.join('\n') : 'No mismatches.'}\n`);

  // 2-4. reference + read-only tools
  const results = {};
  const grab = async (name, args, file = name) => {
    try {
      const r = await c.call(name, args);
      results[file] = { ok: true, structured: r.hasStructured, contentType: r.contentType };
      write(path.join(CAPTURES, `${file}.json`), anonymise(r.output));
      return r.output;
    } catch (err) {
      results[file] = { ok: false, error: String(err.message).replace(key, '<key>') };
      return undefined;
    }
  };
  await grab('reference', { topic: 'leads' }, 'reference-leads');
  await grab('reference', { topic: 'campaign' }, 'reference-campaign');
  await grab('whoami', {});
  const campaigns = await grab('campaign_list', { page: 1 });
  const leads = await grab('lead_list', { pageSize: 5 });
  await grab('conversation_list', { page: 1 });
  await grab('appointment_list', { page: 1 });
  await grab('linkedin_account_list', {});
  await grab('tag_list', {});
  await grab('subaccount_list', { page: 1, pageSize: 5 });
  await grab('analytics_campaign', {});
  const campaignId = idOf(toList(campaigns).list[0]);
  const leadId = idOf(toList(leads).list[0]);
  if (campaignId) {
    await grab('campaign_get', { campaignId: String(campaignId), includeFlow: true });
    await grab('analytics_campaign_funnel', { campaignId: String(campaignId) });
  } else { results.campaign_get = results.analytics_campaign_funnel = { ok: false, error: 'no campaign in test account' }; }
  if (leadId) await grab('lead_get', { leadId: String(leadId), includeActivities: true });
  else results.lead_get = { ok: false, error: 'no lead in test account' };

  log('');
  log('## Read-only tool captures');
  log('');
  log('| Tool | Result | structuredContent | Content-Type |');
  log('|---|---|---|---|');
  for (const [k, v] of Object.entries(results)) {
    log(`| \`${k}\` | ${v.ok ? 'ok' : `failed: ${v.error}`} | ${v.ok ? (v.structured ? 'yes' : 'no') : ''} | ${v.contentType || ''} |`);
  }
  if (c.session.id) {
    await fetch(MCP_URL, { method: 'DELETE', headers: { 'Mcp-Session-Id': c.session.id, 'X-Api-Key': key } }).catch(() => {});
  }
  write(path.join(CAPTURES, 'server-behaviour.md'), `${behaviour.join('\n')}\n`);
  derive();
  console.log(`\nWrote ${rel(CAPTURES)}/. Review the anonymisation before committing.`);
  if (diff.length) console.log(`Schema mismatches: see ${rel(path.join(CAPTURES, 'schema-diff-live.md'))} and copy them into QUESTIONS.md.`);
};

const args = process.argv.slice(2);
if (args[0] === '--payload') importPayload(args[1], args[2]);
else if (args[0] === '--derive') derive();
else capture().catch((err) => { console.error(`bootstrap failed: ${err.message}`); process.exit(1); });

