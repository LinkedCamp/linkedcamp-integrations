'use strict';

const fs = require('fs');
const path = require('path');
const nock = require('nock');
const zapier = require('zapier-platform-core');
const App = require('../index');
const { MCP, KEY, rpcResult, mockHandshake, mockToolCall, jsonTool, bundle } = require('./helpers');
const { parseRpcBody, extractOutput } = require('../lib/mcp');

const appTester = zapier.createAppTester(App);

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('MCP transport', () => {
  it('sends X-Api-Key to mcp.linkedcamp.com and runs the auth test', async () => {
    nock(MCP, { reqheaders: { 'x-api-key': KEY } })
      .post('/mcp', (b) => b.method === 'initialize')
      .reply(200, rpcResult(1, { protocolVersion: '2025-06-18' }), { 'Content-Type': 'application/json' });
    nock(MCP).post('/mcp', (b) => b.method === 'notifications/initialized').reply(202, '');
    mockToolCall('whoami', jsonTool({ name: 'Test User', email: 'user@example.com' }));
    const result = await appTester(App.authentication.test, bundle());
    expect(result).toEqual({ name: 'Test User', email: 'user@example.com' });
    const label = App.authentication.connectionLabel({}, { inputData: result });
    expect(label).toBe('Test User (user@example.com)');
  });

  it('never sends the REST token header to the MCP host', async () => {
    let sawToken = false;
    nock(MCP)
      .post('/mcp')
      .times(3)
      .reply(function (uri, body) {
        if (this.req.headers.token) sawToken = true;
        const b = typeof body === 'string' ? JSON.parse(body) : body;
        if (b.method === 'initialize') return [200, rpcResult(1, {}), { 'Content-Type': 'application/json' }];
        if (b.method === 'notifications/initialized') return [202, ''];
        return jsonTool({ ok: true });
      });
    await appTester(App.authentication.test, bundle());
    expect(sawToken).toBe(false);
  });

  it('parses an SSE-framed tools/call response and picks the message with id 2', async () => {
    mockHandshake();
    const sse = fs.readFileSync(path.join(__dirname, 'fixtures', 'sse-tools-call.txt'), 'utf8');
    mockToolCall('campaign_list', [200, sse, { 'Content-Type': 'text/event-stream' }]);
    const out = await appTester(App.triggers.new_campaign.operation.perform, bundle());
    expect(out.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('carries Mcp-Session-Id and MCP-Protocol-Version when the server issues a session', async () => {
    mockHandshake({ sessionId: 'sess-1' });
    nock(MCP, { reqheaders: { 'mcp-session-id': 'sess-1', 'mcp-protocol-version': '2025-06-18' } })
      .post('/mcp', (b) => b.method === 'tools/call')
      .reply(...jsonTool({ ok: true }));
    await appTester(App.authentication.test, bundle());
    expect(nock.isDone()).toBe(true);
  });

  it('maps -32001 to an auth refresh error', async () => {
    nock(MCP)
      .post('/mcp')
      .reply(
        401,
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Not authenticated.' }, id: null }),
        { 'Content-Type': 'application/json' }
      );
    await expect(appTester(App.authentication.test, bundle())).rejects.toThrow(
      'Reconnect Linkedcamp: the API key was rejected'
    );
  });

  it('maps HTTP 403 to a not-allowed error', async () => {
    mockHandshake();
    mockToolCall('whoami', [403, '{"error":"FORBIDDEN"}', { 'Content-Type': 'application/json' }]);
    await expect(appTester(App.authentication.test, bundle())).rejects.toThrow('Not allowed for this Linkedcamp key');
  });

  it('turns result.isError into an error with the content text', async () => {
    mockHandshake();
    mockToolCall('lead_get', [
      200,
      rpcResult(2, { isError: true, content: [{ type: 'text', text: 'Lead not found' }] }),
      { 'Content-Type': 'application/json' },
    ]);
    await expect(
      appTester(App.searches.get_lead.operation.perform, bundle({ inputData: { leadId: 'nope' } }))
    ).rejects.toThrow('Lead not found');
  });

  it('surfaces other JSON-RPC errors with code and message', async () => {
    mockHandshake();
    mockToolCall('whoami', [
      200,
      JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Invalid params' } }),
      { 'Content-Type': 'application/json' },
    ]);
    await expect(appTester(App.authentication.test, bundle())).rejects.toThrow('-32602: Invalid params');
  });

  it('re-initializes once and retries a read after a 404 with a session', async () => {
    mockHandshake({ sessionId: 's1' });
    mockToolCall('lead_list', [404, '']);
    mockHandshake({ sessionId: 's2' });
    mockToolCall('lead_list', jsonTool([{ _id: 'l1' }]));
    const out = await appTester(App.searches.find_lead.operation.perform, bundle({ inputData: { keyword: 'a' } }));
    expect(out[0].id).toBe('l1');
  });

  it('never retries a write tool after a 404', async () => {
    mockHandshake({ sessionId: 's1' });
    const call = mockToolCall('lead_note_add', [404, '']);
    await expect(
      appTester(App.creates.add_note_to_lead.operation.perform, bundle({ inputData: { leadId: 'l1', content: 'hi' } }))
    ).rejects.toThrow('not retried');
    expect(call.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('returns an empty list when a search tool returns an empty result', async () => {
    mockHandshake();
    mockToolCall('lead_list', jsonTool([]));
    const out = await appTester(App.searches.find_lead.operation.perform, bundle({ inputData: { keyword: 'zz' } }));
    expect(out).toEqual([]);
  });
});

describe('argument building', () => {
  it('sends exact lead_add arguments and drops blank fields', async () => {
    mockHandshake();
    let sent;
    mockToolCall('lead_add', jsonTool({ ok: true }), {
      argsMatch: (a) => {
        sent = a;
        return true;
      },
    });
    await appTester(
      App.creates.add_lead_to_campaign.operation.perform,
      bundle({ inputData: { campaignId: 'c1', email: 'p@example.com', firstName: '', customFields: { recentPost: 'x' } } })
    );
    expect(sent).toEqual({ campaignId: 'c1', email: 'p@example.com', customFields: { recentPost: 'x' } });
  });

  it('requires a profile URL or email for Add Lead', async () => {
    await expect(
      appTester(App.creates.add_lead_to_campaign.operation.perform, bundle({ inputData: { campaignId: 'c1' } }))
    ).rejects.toThrow('profile URL or an email');
  });

  it('polls replied leads from the last 24 hours with pageSize 100', async () => {
    mockHandshake();
    let sent;
    mockToolCall('lead_list', jsonTool([]), { argsMatch: (a) => ((sent = a), true) });
    const before = Date.now();
    await appTester(App.triggers.new_replied_lead.operation.perform, bundle());
    expect(sent.status).toBe('REPLIED');
    expect(sent.pageSize).toBe(100);
    expect(sent.range.from).toBeGreaterThanOrEqual(before - 24 * 3600 * 1000 - 1000);
  });

  it('builds message_send with a nested attachment', async () => {
    mockHandshake();
    let sent;
    mockToolCall('message_send', jsonTool({ ok: true }), { argsMatch: (a) => ((sent = a), true) });
    await appTester(
      App.creates.send_message.operation.perform,
      bundle({ inputData: { conversationId: 'v1', content: 'Hello', attachment_url: 'https://example.com/a.pdf' } })
    );
    expect(sent).toEqual({ conversationId: 'v1', content: 'Hello', attachment: { url: 'https://example.com/a.pdf' } });
  });

  it('converts boolean strings for lead_update', async () => {
    mockHandshake();
    let sent;
    mockToolCall('lead_update', jsonTool({ ok: true }), { argsMatch: (a) => ((sent = a), true) });
    await appTester(
      App.creates.update_lead.operation.perform,
      bundle({ inputData: { leadId: 'l1', paused: 'true', isExcluded: 'false' } })
    );
    expect(sent).toEqual({ leadId: 'l1', paused: true, isExcluded: false });
  });
});

describe('pure helpers', () => {
  it('prefers structuredContent, then JSON text, then {text}', () => {
    expect(extractOutput({ structuredContent: { a: 1 }, content: [{ text: '{"b":2}' }] })).toEqual({ a: 1 });
    expect(extractOutput({ content: [{ text: '{"b":2}' }] })).toEqual({ b: 2 });
    expect(extractOutput({ content: [{ text: 'plain' }] })).toEqual({ text: 'plain' });
  });

  it('parses multi-line SSE data', () => {
    const body = 'data: {"jsonrpc":"2.0",\ndata: "id":2,"result":{}}\n\n';
    expect(parseRpcBody(body, 'text/event-stream', 2)).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
  });
});
