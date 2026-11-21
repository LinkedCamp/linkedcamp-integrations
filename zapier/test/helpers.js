'use strict';

const nock = require('nock');

const MCP = 'https://mcp.linkedcamp.com';
const API = 'https://api.linkedcamp.com';
const KEY = 'test-key-not-real';

const rpcResult = (id, result) => JSON.stringify({ jsonrpc: '2.0', id, result });

// Mock the initialize + notifications/initialized handshake.
const mockHandshake = ({ sessionId } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  nock(MCP)
    .post('/mcp', (b) => b.method === 'initialize')
    .reply(200, rpcResult(1, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'x' } }), headers);
  nock(MCP).post('/mcp', (b) => b.method === 'notifications/initialized').reply(202, '');
  if (sessionId) nock(MCP).delete('/mcp').reply(200, '');
};

// Mock one tools/call; `reply` is [status, body, headers].
const mockToolCall = (toolName, reply, { argsMatch } = {}) =>
  nock(MCP)
    .post('/mcp', (b) =>
      b.method === 'tools/call' && b.params.name === toolName && (!argsMatch || argsMatch(b.params.arguments)))
    .reply(...reply);

const jsonTool = (value) => [
  200,
  rpcResult(2, { content: [{ type: 'text', text: JSON.stringify(value) }] }),
  { 'Content-Type': 'application/json' },
];

const bundle = (extra = {}) => ({ authData: { api_key: KEY }, inputData: {}, meta: {}, ...extra });

module.exports = { MCP, API, KEY, rpcResult, mockHandshake, mockToolCall, jsonTool, bundle };
