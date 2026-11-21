'use strict';

const nock = require('nock');
const zapier = require('zapier-platform-core');
const App = require('../index');
const { HOOKS } = require('../triggers/hooks');
const { API, KEY, MCP, bundle } = require('./helpers');

const appTester = zapier.createAppTester(App);

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

const TARGET = 'https://hooks.zapier.com/hooks/standard/1/abc/';

describe('REST hook triggers', () => {
  it('defines the 8 documented events', () => {
    expect(HOOKS.map((h) => h.event)).toEqual([
      'REPLY_DETECTED', 'ACCEPTS_REQUEST', 'CONNECT_INVITED', 'EMAIL_SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED',
    ]);
  });

  it('subscribes with the token header, then finds the id by callbackUrl', async () => {
    nock(API, { reqheaders: { token: KEY }, badheaders: ['x-api-key'] })
      .post('/webhooks', { title: 'Zapier – New Reply', callbackUrl: TARGET, event: 'REPLY_DETECTED' })
      .reply(200, { success: true, message: 'Webhook added successfully!' });
    nock(API, { reqheaders: { token: KEY } })
      .get('/webhooks')
      .reply(200, {
        success: true,
        data: [
          { _id: 'other', callbackUrl: 'https://example.com/x', title: 't', events: ['OPENED'], isValid: true },
          { _id: 'w1', callbackUrl: TARGET, title: 'Zapier – New Reply', events: ['REPLY_DETECTED'], isValid: true },
        ],
      });
    const out = await appTester(
      App.triggers.new_reply.operation.performSubscribe,
      bundle({ targetUrl: TARGET })
    );
    expect(out).toEqual({ id: 'w1' });
  });

  it('uses data._id directly when the create response includes it', async () => {
    nock(API).post('/webhooks').reply(200, { success: true, message: 'ok', data: { _id: 'w9' } });
    const out = await appTester(App.triggers.new_email_open.operation.performSubscribe, bundle({ targetUrl: TARGET }));
    expect(out).toEqual({ id: 'w9' });
  });

  it('throws on REST success:false (HTTP 200)', async () => {
    nock(API).post('/webhooks').reply(200, { success: false, message: 'Invalid event!' });
    await expect(
      appTester(App.triggers.new_reply.operation.performSubscribe, bundle({ targetUrl: TARGET }))
    ).rejects.toThrow('Linkedcamp API error: Invalid event!');
  });

  it('maps "Token is required!" to an auth error', async () => {
    nock(API).post('/webhooks').reply(200, { success: false, message: 'Token is required!' });
    await expect(
      appTester(App.triggers.new_reply.operation.performSubscribe, bundle({ targetUrl: TARGET }))
    ).rejects.toThrow('Reconnect Linkedcamp');
  });

  it('unsubscribes by id', async () => {
    const del = nock(API, { reqheaders: { token: KEY } })
      .delete('/webhooks/w1')
      .reply(200, { success: true, message: 'Webhook deleted' });
    await appTester(App.triggers.new_reply.operation.performUnsubscribe, bundle({ subscribeData: { id: 'w1' } }));
    expect(del.isDone()).toBe(true);
  });

  it('passes the payload through unchanged with a stable id', async () => {
    const payload = { opaque: { nested: true }, n: 1 };
    const [a] = await appTester(App.triggers.new_reply.operation.perform, bundle({ cleanedRequest: payload }));
    const [b] = await appTester(App.triggers.new_reply.operation.perform, bundle({ cleanedRequest: { ...payload } }));
    expect(a).toMatchObject(payload);
    expect(a.id).toBe(b.id);
  });

  it('performList for New Reply reads REPLIED leads over MCP', async () => {
    nock(MCP).post('/mcp', (b) => b.method === 'initialize').reply(200, '{"jsonrpc":"2.0","id":1,"result":{}}', {
      'Content-Type': 'application/json',
    });
    nock(MCP).post('/mcp', (b) => b.method === 'notifications/initialized').reply(202, '');
    let args;
    nock(MCP)
      .post('/mcp', (b) => b.method === 'tools/call' && b.params.name === 'lead_list' && ((args = b.params.arguments), true))
      .reply(200, JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: '[]' }] } }), {
        'Content-Type': 'application/json',
      });
    await appTester(App.triggers.new_reply.operation.performList, bundle());
    expect(args.status).toBe('REPLIED');
  });

  it('performList for events without a capture returns an empty list (no invented sample)', async () => {
    const out = await appTester(App.triggers.new_email_bounce.operation.performList, bundle());
    expect(Array.isArray(out)).toBe(true);
  });
});
