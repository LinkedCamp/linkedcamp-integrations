it('uses the campaign title', () => {
	assert.strictEqual(optionLabel({ _id: 'c1', title: ' Q1 agencies ' }, 'campaign'), 'Q1 agencies');
});

it('combines name and email for accounts and clients', () => {
	assert.strictEqual(optionLabel({ _id: 'a1', name: 'Sam Doe', email: 'sam@example.com' }, 'linkedinAccount'), 'Sam Doe (sam@example.com)');
	assert.strictEqual(optionLabel({ _id: 'u1', email: 'client@example.com' }, 'client'), 'client@example.com');
});

it('falls back to the record id', () => {
	assert.strictEqual(optionLabel({ _id: 'c2', title: '' }, 'campaign'), 'c2');
	assert.strictEqual(optionLabel({ _id: 'c3' }, 'unknownKind'), 'c3');
	assert.throws(() => optionLabel({}, 'campaign'), { message: 'Linkedcamp record has no _id.' });
});
