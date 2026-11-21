it('prefers structuredContent, including falsy members', () => {
	const body = '{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"count":0,"ok":false},"content":[{"type":"text","text":"{\\"ignored\\":true}"}]}}';
	assert.deepStrictEqual(mcpResult(body, 1), { count: 0, ok: false });
});

it('parses content[0].text when it is JSON', () => {
	const body = '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"[1,2]"},{"type":"text","text":"x"}]}}';
	assert.deepStrictEqual(mcpResult(body, 1), [1, 2]);
});

it('wraps non-JSON text as { text }', () => {
	const body = '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Done."}]}}';
	assert.deepStrictEqual(mcpResult(body, 1), { text: 'Done.' });
});

it('works on an SSE body', () => {
	const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\\"a\\":\\"b\\"}"}]}}\n\n';
	assert.deepStrictEqual(mcpResult(body, 1), { a: 'b' });
});

it('returns {} for an empty content list and null without a result', () => {
	assert.deepStrictEqual(mcpResult('{"jsonrpc":"2.0","id":1,"result":{"content":[]}}', 1), {});
	assert.deepStrictEqual(mcpResult('{"jsonrpc":"2.0","id":1,"result":{}}', 1), {});
	assert.strictEqual(mcpResult('{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"bad"}}', 1), null);
	assert.strictEqual(mcpResult('', 1), null);
});
