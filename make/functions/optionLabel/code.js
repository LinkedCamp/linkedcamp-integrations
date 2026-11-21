function optionLabel(item, kind) {
	// Dropdown label for an RPC option. TODO(capture): field names are provisional and come only from
	// documented inputs: campaign_create takes `title`; linkedin_account_list filters "by name or email";
	// subaccount_list documents "id, name, email". Falls back to the record id.
	var keys = { campaign: ['title'], linkedinAccount: ['name', 'email'], client: ['name', 'email'] }[kind] || [];
	var parts = [];
	for (var i = 0; i < keys.length; i += 1) {
		var value = item ? item[keys[i]] : undefined;
		if (typeof value === 'string' && value.trim() !== '') parts.push(value.trim());
	}
	if (parts.length === 2) return parts[0] + ' (' + parts[1] + ')';
	if (parts.length === 1) return parts[0];
	return iml.recordId(item);
}
