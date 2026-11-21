it('returns a top-level array result', () => {
	assert.deepStrictEqual(mcpList('{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"[{\\"_id\\":\\"a\\"}]"}]}}', 1), [{ _id: 'a' }]);
});

it('returns the only array-valued property of an object result', () => {
	const body = '{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"rows":[{"_id":"a"},{"_id":"b"}],"page":1,"total":0}}}';
	assert.deepStrictEqual(mcpList(body, 1), [{ _id: 'a' }, { _id: 'b' }]);
});

it('returns an empty array for an empty array property, text-only or empty results', () => {
	assert.deepStrictEqual(mcpList('{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"rows":[],"page":2}}}', 1), []);
	assert.deepStrictEqual(mcpList('{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"No results."}]}}', 1), []);
	assert.deepStrictEqual(mcpList('{"jsonrpc":"2.0","id":1,"result":{"content":[]}}', 1), []);
	assert.deepStrictEqual(mcpList('{"jsonrpc":"2.0","id":1,"error":{"code":1,"message":"x"}}', 1), []);
});

it('throws on an ambiguous or unknown shape', () => {
	assert.throws(
		() => mcpList('{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"a":[],"b":[]}}}', 1),
		{ message: 'Unexpected Linkedcamp list result shape (keys: a, b). Please report it to Linkedcamp support.' },
	);
	assert.throws(
		() => mcpList('{"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"data":{"items":[]}}}}', 1),
		{ message: 'Unexpected Linkedcamp list result shape (keys: data). Please report it to Linkedcamp support.' },
	);
	assert.throws(
		() => mcpList('{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"5"}]}}', 1),
		{ message: 'Unexpected Linkedcamp list result (number).' },
	);
});
