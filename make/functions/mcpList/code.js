function mcpList(body, id) {
	// Returns the array of records from a list tool's result, for `response.iterate`.
	// TODO(capture): list result shapes are not captured yet. This picks the result itself when it
	// is an array, or its ONLY array-valued top-level property. Any other shape throws, so a wrong
	// guess fails loudly instead of silently emitting nothing. Replace with exact paths after capture.
	var result = iml.mcpResult(body, id);
	if (result === null || result === undefined) return [];
	if (Array.isArray(result)) return result;
	if (typeof result !== 'object') throw new Error('Unexpected Linkedcamp list result (' + typeof result + ').');
	var keys = Object.keys(result);
	var arrays = keys.filter(function (k) { return Array.isArray(result[k]); });
	if (arrays.length === 1) return result[arrays[0]];
	// A tool that found nothing may answer with plain text only (wrapped as { text } by mcpResult).
	if (arrays.length === 0 && (keys.length === 0 || (keys.length === 1 && keys[0] === 'text'))) return [];
	throw new Error('Unexpected Linkedcamp list result shape (keys: ' + keys.join(', ') + '). Please report it to Linkedcamp support.');
}
