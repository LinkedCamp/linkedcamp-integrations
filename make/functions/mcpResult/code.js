function mcpResult(body, id) {
	// MCP client contract step 6: result.structuredContent, else JSON.parse(result.content[0].text)
	// when it is valid JSON, else { text }. Errors are handled by Base `valid`/`error` (mcpError),
	// so this only shapes a successful result. Returns null when there is no result.
	var message = iml.parseMcp(body, id);
	if (!message || message.result === undefined || message.result === null) return null;
	var result = message.result;
	if (result.structuredContent !== undefined && result.structuredContent !== null) return result.structuredContent;
	var content = Array.isArray(result.content) ? result.content : [];
	if (content.length === 0) return {};
	var first = content[0];
	if (!first || typeof first.text !== 'string') return {};
	try {
		return JSON.parse(first.text);
	} catch (e) {
		return { text: first.text };
	}
}
