function recordId(item) {
	// THE single place that defines a record's id: polling-trigger dedupe and RPC option values use it.
	// TODO(capture): provisional `_id`. Evidence: REST GET /webhooks returns `_id`, and the backend is
	// Mongo-style. Confirm against captured campaign_list, appointment_list and lead_list items.
	if (item === null || item === undefined || typeof item !== 'object') {
		throw new Error('Linkedcamp record is not an object.');
	}
	var value = item._id;
	if (value === undefined || value === null || value === '') {
		throw new Error('Linkedcamp record has no _id.');
	}
	return String(value);
}
