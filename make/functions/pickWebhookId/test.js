const url = 'https://hook.eu1.make.com/abc123';

it('uses the id returned by POST /webhooks when present', () => {
	assert.strictEqual(pickWebhookId('w9', [{ _id: 'w1', callbackUrl: url }], url), 'w9');
});

it('matches GET /webhooks by callbackUrl', () => {
	const hooks = [
		{ _id: 'w1', callbackUrl: 'https://hook.eu1.make.com/other', title: 'x', events: ['OPENED'], isValid: true },
		{ _id: 'w2', callbackUrl: url, title: 'Make: Watch Email Opens', events: ['OPENED'], isValid: true },
	];
	assert.strictEqual(pickWebhookId(undefined, hooks, url), 'w2');
	assert.strictEqual(pickWebhookId('', hooks, url), 'w2');
	assert.strictEqual(pickWebhookId(null, hooks, url), 'w2');
});

it('returns the last match when the URL appears twice', () => {
	assert.strictEqual(pickWebhookId(undefined, [{ _id: 'a', callbackUrl: url }, { _id: 'b', callbackUrl: url }], url), 'b');
});

it('returns an empty string when nothing matches', () => {
	assert.strictEqual(pickWebhookId(undefined, [{ _id: 'a', callbackUrl: 'https://x' }], url), '');
	assert.strictEqual(pickWebhookId(undefined, [{ callbackUrl: url }], url), '');
	assert.strictEqual(pickWebhookId(undefined, undefined, url), '');
	assert.strictEqual(pickWebhookId(undefined, [], ''), '');
});
