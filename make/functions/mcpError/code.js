function mcpError(body, id, statusCode) {
	// Returns '' when the MCP response is a successful tool result, otherwise a user-facing message.
	// Used by Base `response.valid` and `response.error.message` (MCP client contract step 5).
	var message = iml.parseMcp(body, id);
	var status = Number(statusCode) || 0;

	if (status === 401 || (message && message.error && message.error.code === -32001)) {
		return 'Reconnect Linkedcamp: the API key was rejected.';
	}
	if (status === 403) {
		var detail = message && message.error && message.error.message ? ' ' + message.error.message : '';
		return 'Not allowed for this Linkedcamp key (plan, permission, access tier or server-side block).' + detail;
	}
	if (message && message.error) {
		var code = message.error.code !== undefined ? '[' + message.error.code + '] ' : '';
		return code + (message.error.message || 'Linkedcamp MCP error.');
	}
	if (message && message.result && message.result.isError === true) {
		var texts = (Array.isArray(message.result.content) ? message.result.content : [])
			.filter(function (c) { return c && typeof c.text === 'string' && c.text !== ''; })
			.map(function (c) { return c.text; });
		return texts.length ? texts.join(' ') : 'The Linkedcamp tool reported an error.';
	}
	if (status >= 400) return 'Linkedcamp MCP request failed with HTTP ' + status + '.';
	if (!message) return 'Unexpected response from the Linkedcamp MCP server: no JSON-RPC message with id ' + id + '.';
	return '';
}
