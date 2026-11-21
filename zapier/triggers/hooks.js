'use strict';

// Instant triggers: Linkedcamp REST webhooks, one subscription per event.
// Payload schema is not documented, so the body is passed through unchanged.

const fs = require('fs');
const path = require('path');
const { callTool } = require('../lib/mcp');
const { createWebhook, deleteWebhook } = require('../lib/rest');
const { listWithIds, stableHash } = require('../lib/hydrate');

const HOOKS = [
  { key: 'new_reply', label: 'New Reply', noun: 'Reply', event: 'REPLY_DETECTED',
    description: 'Triggers when a prospect replies to a campaign message.', listStatus: 'REPLIED' },
  { key: 'new_connection_accepted', label: 'New Connection Accepted', noun: 'Connection', event: 'ACCEPTS_REQUEST',
    description: 'Triggers when a prospect accepts a connection request sent by a campaign.',
    listStatus: 'CONNECTED' },
  { key: 'new_connection_request_sent', label: 'New Connection Request Sent', noun: 'Connection Request',
    event: 'CONNECT_INVITED', description: 'Triggers when a campaign sends a connection request.' },
  { key: 'new_email_sent', label: 'New Email Sent', noun: 'Email', event: 'EMAIL_SENT',
    description: 'Triggers when a campaign email is sent.' },
  { key: 'new_email_open', label: 'New Email Open', noun: 'Email Open', event: 'OPENED',
    description: 'Triggers when a campaign email is opened.' },
  { key: 'new_email_link_click', label: 'New Email Link Click', noun: 'Email Link Click', event: 'CLICKED',
    description: 'Triggers when a campaign email has a link clicked.' },
  { key: 'new_email_bounce', label: 'New Email Bounce', noun: 'Email Bounce', event: 'BOUNCED',
    description: 'Triggers when a campaign email bounces.' },
  { key: 'new_unsubscribe', label: 'New Unsubscribe', noun: 'Unsubscribe', event: 'UNSUBSCRIBED',
    description: 'Triggers when a prospect unsubscribes from campaign emails.' },
];

// Captured payloads are copied here by scripts/bootstrap.mjs (anonymised).
const loadPayloadSamples = (event) => {
  const file = path.join(__dirname, '..', 'samples', `payload-${event}.json`);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data) ? data : [data];
};

const withPayloadId = (payload) => {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { value: payload };
  // No documented event id: hash the whole body so a redelivered payload dedupes.
  const { querystring, ...rest } = body;
  return { ...rest, id: stableHash(rest) };
};

const makeHook = (h) => ({
  key: h.key,
  noun: h.noun,
  display: { label: h.label, description: h.description },
  operation: {
    type: 'hook',
    performSubscribe: (z, bundle) =>
      createWebhook(z, { title: `Zapier – ${h.label}`, callbackUrl: bundle.targetUrl, event: h.event }),
    performUnsubscribe: (z, bundle) => deleteWebhook(z, bundle.subscribeData.id),
    perform: (z, bundle) => [withPayloadId(bundle.cleanedRequest)],
    performList: async (z) => {
      if (h.listStatus) {
        return listWithIds(await callTool(z, 'lead_list', { status: h.listStatus, pageSize: 3 }), 'lead_list');
      }
      return loadPayloadSamples(h.event).map(withPayloadId);
    },
  },
});

module.exports = { HOOKS, hooks: HOOKS.map(makeHook), withPayloadId, loadPayloadSamples };
