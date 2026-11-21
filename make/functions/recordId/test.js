it('returns _id as a string', () => {
	assert.strictEqual(recordId({ _id: '665f1c2e9b1e8a0012345678' }), '665f1c2e9b1e8a0012345678');
	assert.strictEqual(recordId({ _id: 0 }), '0');
});

it('throws when the record has no _id', () => {
	assert.throws(() => recordId({ id: 'x' }), { message: 'Linkedcamp record has no _id.' });
	assert.throws(() => recordId({ _id: '' }), { message: 'Linkedcamp record has no _id.' });
	assert.throws(() => recordId({ _id: null }), { message: 'Linkedcamp record has no _id.' });
	assert.throws(() => recordId(null), { message: 'Linkedcamp record is not an object.' });
	assert.throws(() => recordId('x'), { message: 'Linkedcamp record is not an object.' });
});
