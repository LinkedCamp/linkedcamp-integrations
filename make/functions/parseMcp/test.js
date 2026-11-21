it('parses a plain JSON body string and picks the message by id', () => {
	const body = '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\\"a\\":1}"}]}}';
	assert.deepStrictEqual(parseMcp(body, 1), {
		jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"a":1}' }] },
	});
});

it('accepts an already-parsed JSON object', () => {
	const body = { jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } };
	assert.deepStrictEqual(parseMcp(body, 1), body);
});

it('parses an SSE body and picks the message whose id matches', () => {
	const body = [
		'event: message',
		'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
		'',
		'event: message',
		'data: {"jsonrpc":"2.0","id":7,"result":{"isError":false,"content":[]}}',
		'',
		'event: message',
		'data: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"x":0}}}',
		'',
	].join('\n');
	assert.deepStrictEqual(parseMcp(body, 1), { jsonrpc: '2.0', id: 1, result: { structuredContent: { x: 0 } } });
	assert.deepStrictEqual(parseMcp(body, 7), { jsonrpc: '2.0', id: 7, result: { isError: false, content: [] } });
});

it('handles CRLF line endings, no space after data: and multi-line data', () => {
	const body = 'event: message\r\ndata:{"jsonrpc":"2.0",\r\ndata: "id":"1","result":{}}\r\n\r\n';
	assert.deepStrictEqual(parseMcp(body, 1), { jsonrpc: '2.0', id: '1', result: {} });
});

it('returns the id:null error message (the verified 401 body)', () => {
	const body = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Not authenticated."},"id":null}';
	assert.deepStrictEqual(parseMcp(body, 1), {
		jsonrpc: '2.0', error: { code: -32001, message: 'Not authenticated.' }, id: null,
	});
});

it('returns null when there is no message for the id', () => {
	assert.strictEqual(parseMcp('{"jsonrpc":"2.0","id":2,"result":{}}', 1), null);
	assert.strictEqual(parseMcp('data: not json\n\n', 1), null);
	assert.strictEqual(parseMcp('', 1), null);
	assert.strictEqual(parseMcp(null, 1), null);
	assert.strictEqual(parseMcp(undefined, 1), null);
	assert.strictEqual(parseMcp(0, 1), null);
	assert.strictEqual(parseMcp('<html>Bad gateway</html>', 1), null);
});

it('accepts a JSON-RPC batch array', () => {
	const body = '[{"jsonrpc":"2.0","id":2,"result":{"a":2}},{"jsonrpc":"2.0","id":1,"result":{"a":1}}]';
	assert.deepStrictEqual(parseMcp(body, 1), { jsonrpc: '2.0', id: 1, result: { a: 1 } });
});

it('accepts a Buffer body', () => {
	const body = Buffer.from('{"jsonrpc":"2.0","id":1,"result":{"ok":false}}', 'utf8');
	assert.deepStrictEqual(parseMcp(body, 1), { jsonrpc: '2.0', id: 1, result: { ok: false } });
});
