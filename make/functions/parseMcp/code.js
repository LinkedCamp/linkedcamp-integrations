function parseMcp(body, id) {
	// Returns the JSON-RPC message for request `id` from an MCP Streamable HTTP response,
	// whether the server answered with a JSON body or a text/event-stream (SSE) body.
	// Returns null when no JSON-RPC message can be found.
	if (body === null || body === undefined) return null;
	if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) body = body.toString('utf8');

	function isMessage(m) {
		return m !== null && typeof m === 'object' && !Array.isArray(m) && ('result' in m || 'error' in m);
	}

	function pick(list) {
		var messages = list.filter(isMessage);
		var wanted = id === undefined || id === null ? null : String(id);
		var i;
		if (wanted !== null) {
			for (i = 0; i < messages.length; i += 1) {
				if (messages[i].id !== undefined && messages[i].id !== null && String(messages[i].id) === wanted) return messages[i];
			}
		}
		// A server-level failure (for example HTTP 401, -32001) is sent with "id": null.
		for (i = 0; i < messages.length; i += 1) {
			if (messages[i].error && (messages[i].id === null || messages[i].id === undefined)) return messages[i];
		}
		return null;
	}

	if (typeof body === 'object') return pick(Array.isArray(body) ? body : [body]);
	if (typeof body !== 'string') return null;

	var text = body.trim();
	if (text === '') return null;

	if (text.charAt(0) === '{' || text.charAt(0) === '[') {
		try {
			var parsed = JSON.parse(text);
			return pick(Array.isArray(parsed) ? parsed : [parsed]);
		} catch (e) {
			// Not a JSON document: fall through to SSE parsing.
		}
	}

	var found = [];
	var events = text.split(/\r?\n\r?\n/);
	for (var e = 0; e < events.length; e += 1) {
		var data = [];
		var lines = events[e].split(/\r?\n/);
		for (var l = 0; l < lines.length; l += 1) {
			var line = lines[l];
			if (line.indexOf('data:') === 0) {
				var value = line.slice(5);
				if (value.charAt(0) === ' ') value = value.slice(1);
				data.push(value);
			}
		}
		if (data.length === 0) continue;
		try {
			var message = JSON.parse(data.join('\n'));
			if (Array.isArray(message)) found = found.concat(message);
			else found.push(message);
		} catch (err) {
			// Ignore a data payload that is not JSON (for example a keep-alive).
		}
	}
	return pick(found);
}
