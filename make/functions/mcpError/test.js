it('returns an empty string for a successful result', () => {
	assert.strictEqual(mcpError('{"jsonrpc":"2.0","id":1,"result":{"content":[]}}', 1, 200), '');
	assert.strictEqual(mcpError('{"jsonrpc":"2.0","id":1,"result":{"isError":false}}', 1, 200), '');
});

it('maps the verified 401 / -32001 body to the reconnect message', () => {
	const body = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Not authenticated. ..."},"id":null}';
	assert.strictEqual(mcpError(body, 1, 401), 'Reconnect Linkedcamp: the API key was rejected.');
	assert.strictEqual(mcpError(body, 1, 200), 'Reconnect Linkedcamp: the API key was rejected.');
});

it('maps 403 to the permission message', () => {
	assert.strictEqual(mcpError('', 1, 403), 'Not allowed for this Linkedcamp key (plan, permission, access tier or server-side block).');
	assert.strictEqual(
		mcpError('{"jsonrpc":"2.0","id":1,"error":{"code":-32003,"message":"Blocked."}}', 1, '403'),
		'Not allowed for this Linkedcamp key (plan, permission, access tier or server-side block). Blocked.',
	);
});

it('reports other JSON-RPC errors with code and message', () => {
	assert.strictEqual(mcpError('{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Invalid params"}}', 1, 200), '[-32602] Invalid params');
	assert.strictEqual(mcpError('{"jsonrpc":"2.0","id":1,"error":{"code":0,"message":"Zero"}}', 1, 200), '[0] Zero');
});

it('reports result.isError with the joined content text', () => {
	const body = 'data: {"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[{"type":"text","text":"Campaign not found."},{"type":"text","text":"Check the id."}]}}\n\n';
	assert.strictEqual(mcpError(body, 1, 200), 'Campaign not found. Check the id.');
	assert.strictEqual(mcpError('{"jsonrpc":"2.0","id":1,"result":{"isError":true}}', 1, 200), 'The Linkedcamp tool reported an error.');
});

it('reports HTTP errors and unparseable bodies', () => {
	assert.strictEqual(mcpError('<html>oops</html>', 1, 502), 'Linkedcamp MCP request failed with HTTP 502.');
	assert.strictEqual(mcpError('<html>oops</html>', 1, 200), 'Unexpected response from the Linkedcamp MCP server: no JSON-RPC message with id 1.');
	assert.strictEqual(mcpError(undefined, 1, undefined), 'Unexpected response from the Linkedcamp MCP server: no JSON-RPC message with id 1.');
});
