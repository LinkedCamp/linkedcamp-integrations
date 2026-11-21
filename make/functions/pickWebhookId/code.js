function pickWebhookId(createdId, hooks, callbackUrl) {
	// Attach fallback from spec section 5: use `data._id` from POST /webhooks if present, else the `_id`
	// of the GET /webhooks entry whose callbackUrl equals the URL just registered.
	// Returns '' when no id can be found, so the attach request fails visibly.
	if (createdId !== undefined && createdId !== null && String(createdId) !== '') return String(createdId);
	if (!Array.isArray(hooks) || typeof callbackUrl !== 'string' || callbackUrl === '') return '';
	var match = '';
	for (var i = 0; i < hooks.length; i += 1) {
		var hook = hooks[i];
		if (hook && hook.callbackUrl === callbackUrl && hook._id !== undefined && hook._id !== null && String(hook._id) !== '') {
			match = String(hook._id); // keep the last match: the list order is not documented
		}
	}
	return match;
}
