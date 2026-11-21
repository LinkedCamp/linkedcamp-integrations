'use strict';

// MCP client for the Linkedcamp MCP server (spec/mcp-client.md).
// Streamable HTTP, JSON-RPC 2.0. Never logs headers or the API key.

const MCP_URL = 'https://mcp.linkedcamp.com/mcp';
const PROTOCOL_VERSION = '2025-06-18';
const TIMEOUT_MS = 60000;
const CLIENT_VERSION = require('../package.json').version;

const AUTH_MESSAGE = 'Reconnect Linkedcamp: the API key was rejected';
const FORBIDDEN_MESSAGE =
  'Not allowed for this Linkedcamp key (plan, permission, access tier or server-side block)';

const getHeader = (response, name) => {
  if (!response || !response.headers) return undefined;
  if (typeof response.headers.get === 'function') {
    return response.headers.get(name) || undefined;
  }
  return response.headers[name] || response.headers[name.toLowerCase()];
};

// Parse a JSON-RPC response body that is either application/json or
// text/event-stream. Returns the message whose id matches `id` (or the only
// message when there is just one).
const parseRpcBody = (text, contentType, id) => {
  const body = typeof text === 'string' ? text : '';
  const isSse =
    (contentType && contentType.includes('text/event-stream')) ||
    /^\s*(event|data|id|retry):/m.test(body);
  if (!isSse) {
    if (!body.trim()) return undefined;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        return parsed.find((m) => m && m.id === id) || parsed[0];
      }
      return parsed;
    } catch (err) {
      return undefined;
    }
  }
  const messages = [];
  // SSE events are separated by blank lines; data lines of one event join with \n.
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch (err) {
      // ignore keep-alives and non-JSON frames
    }
  }
  return messages.find((m) => m && m.id === id) || (messages.length === 1 ? messages[0] : undefined);
};

// Turn a tools/call result into a plain JS value (§3 step 6).
const extractOutput = (result) => {
  if (!result) return {};
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent;
  }
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  if (first && typeof first.text === 'string') {
    try {
      return JSON.parse(first.text);
    } catch (err) {
      return { text: first.text };
    }
  }
  return {};
};

const toolErrorText = (result) => {
  const parts = (Array.isArray(result.content) ? result.content : [])
    .map((c) => (c && typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean);
  return parts.join('\n') || 'Linkedcamp tool call failed';
};

// Map an HTTP response + parsed message to a thrown Zapier error, or return the message.
const checkResponse = (z, response, msg) => {
  const status = response.status;
  if (status === 401 || (msg && msg.error && msg.error.code === -32001)) {
    throw new z.errors.RefreshAuthError(AUTH_MESSAGE);
  }
  if (status === 403) {
    throw new z.errors.Error(FORBIDDEN_MESSAGE, 'Forbidden', 403);
  }
  if (msg && msg.error) {
    const code = msg.error.code;
    throw new z.errors.Error(
      `Linkedcamp MCP error ${code}: ${msg.error.message || 'unknown error'}`,
      String(code),
      status
    );
  }
  if (status >= 400) {
    throw new z.errors.Error(`Linkedcamp MCP request failed with HTTP ${status}`, 'HttpError', status);
  }
  return msg;
};

const post = (z, payload, session) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (session && session.id) headers['Mcp-Session-Id'] = session.id;
  if (session && session.protocolVersion) headers['MCP-Protocol-Version'] = session.protocolVersion;
  // X-Api-Key is added by beforeRequest (authentication.js) for mcp.linkedcamp.com only.
  return z.request({
    url: MCP_URL,
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    skipThrowForStatus: true,
    timeout: TIMEOUT_MS,
  });
};

const initialize = async (z) => {
  const response = await post(z, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'linkedcamp-zapier', version: CLIENT_VERSION },
    },
  });
  const msg = parseRpcBody(response.content, getHeader(response, 'content-type'), 1);
  checkResponse(z, response, msg);
  const session = {
    id: getHeader(response, 'mcp-session-id'),
    protocolVersion: (msg && msg.result && msg.result.protocolVersion) || PROTOCOL_VERSION,
  };
  const notified = await post(z, { jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  if (notified.status === 401) throw new z.errors.RefreshAuthError(AUTH_MESSAGE);
  return session;
};

const endSession = async (z, session) => {
  if (!session || !session.id) return;
  try {
    await z.request({
      url: MCP_URL,
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': session.id },
      skipThrowForStatus: true,
      timeout: 10000,
    });
  } catch (err) {
    // best effort
  }
};

// Remove undefined / null / '' values so optional fields left blank are not sent.
const clean = (obj) => {
  if (Array.isArray(obj)) return obj.map(clean);
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = clean(v);
      if (Object.keys(nested).length === 0) continue;
      out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
};

/**
 * Call one Linkedcamp MCP tool.
 * @param {object} z Zapier z object
 * @param {string} name tool name (exact, from spec/tools.md)
 * @param {object} args tool arguments
 * @param {object} [opts] { write: true } for write tools (never auto-retried)
 */
const callTool = async (z, name, args = {}, opts = {}) => {
  const attempt = async () => {
    const session = await initialize(z);
    try {
      const response = await post(
        z,
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: clean(args) } },
        session
      );
      if (response.status === 404 && session.id) {
        const err = new Error('session expired');
        err.sessionExpired = true;
        throw err;
      }
      const msg = parseRpcBody(response.content, getHeader(response, 'content-type'), 2);
      checkResponse(z, response, msg);
      if (!msg || !msg.result) {
        throw new z.errors.Error('Linkedcamp MCP returned an empty response', 'EmptyResponse');
      }
      if (msg.result.isError === true) {
        throw new z.errors.Error(toolErrorText(msg.result), 'ToolError');
      }
      return extractOutput(msg.result);
    } finally {
      await endSession(z, session);
    }
  };

  try {
    return await attempt();
  } catch (err) {
    // §3: HTTP 404 with a session → re-initialize once and retry once.
    // §3.7: never auto-retry write tools.
    if (err && err.sessionExpired && !opts.write) return attempt();
    if (err && err.sessionExpired) {
      throw new z.errors.Error(
        'Linkedcamp MCP session expired before the write was accepted; it was not retried. Run the step again.',
        'SessionExpired',
        404
      );
    }
    throw err;
  }
};

module.exports = {
  MCP_URL,
  callTool,
  clean,
  parseRpcBody,
  extractOutput,
  AUTH_MESSAGE,
  FORBIDDEN_MESSAGE,
};
