#!/usr/bin/env node
// Generates every Make component file of the Linkedcamp app from the single definition table below.
// Run: node scripts/generate.mjs   (writes base.imljson, groups.json, connections/, rpcs/, webhooks/,
// modules/ and app.manifest.json under make/). No network. Edit this file, then regenerate;
// do not hand-edit the generated files.
//
// Sources of truth: ../spec/tools.md (sections 4 and 5) and ../spec/mcp-client.md (section 3), with the
// live MCP input schemas cross-checked on 21 Nov 2026. Output shapes are NOT captured yet: every
// interface is `[]` and every sample is `{}` (TODO(capture), see DESIGN.md).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const REST = 'https://api.linkedcamp.com';
const RPC_ID = 1; // the JSON-RPC id of the single tools/call request each module sends

// ---------------------------------------------------------------------------------------------
// Shared request fragments
// ---------------------------------------------------------------------------------------------
const rpcBody = (tool, args) => ({
	jsonrpc: '2.0', id: RPC_ID, method: 'tools/call', params: { name: tool, arguments: args },
});
const mcpRequest = (tool, args, extra = {}) => ({ url: '/mcp', method: 'POST', type: 'json', body: rpcBody(tool, args), ...extra });

const REST_SANITIZE = ['request.headers.token', 'request.headers.x-api-key'];
// REST endpoints report errors as HTTP 200 + "success": false, so success !== true is an error.
const restResponse = (extra = {}) => ({
	type: 'json',
	valid: '{{body.success === true}}',
	error: {
		message: "{{ifempty(body.message, 'Linkedcamp API error')}}",
		401: { message: 'Reconnect Linkedcamp: the API key was rejected.', type: 'InvalidAccessTokenError' },
		403: { message: 'Not allowed for this Linkedcamp key (plan, permission or server-side block).' },
	},
	...extra,
});
const restHeaders = { token: '{{connection.apiKey}}' };

// ---------------------------------------------------------------------------------------------
// Parameter helpers (Make parameter syntax)
// ---------------------------------------------------------------------------------------------
const p = (name, type, label, opts = {}) => ({ name, type, label, ...opts });
const text = (name, label, opts) => p(name, 'text', label, opts);
const bool = (name, label, opts) => p(name, 'boolean', label, opts);
const date = (name, label, opts) => p(name, 'date', label, opts);
const select = (name, label, values, opts = {}) => p(name, 'select', label, {
	options: values.map((v) => (typeof v === 'string' ? { label: humanize(v), value: v } : v)), ...opts,
});
const rpcSelect = (name, label, rpc, opts = {}) => p(name, 'select', label, { options: `rpc://${rpc}`, ...opts });
const humanize = (v) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');

const campaignId = (required, help) => rpcSelect('campaignId', 'Campaign', 'listCampaigns', {
	required, mode: 'edit', ...(help ? { help } : {}),
});
const leadId = (help = 'Lead ID, for example from **Search leads**.') => text('leadId', 'Lead ID', { required: true, help });
const conversationId = (required = true) => text('conversationId', 'Conversation ID', {
	required, help: 'Conversation ID, for example from **Search conversations**.',
});
const userId = () => rpcSelect('userId', 'Client (sub-account)', 'listClients', {
	mode: 'edit',
	help: 'Agency owners only: read a client sub-account instead of your own data. Leave empty for your own account. The list stays empty for keys that are not an agency owner.',
});
const range = () => p('range', 'collection', 'Date range', {
	help: 'Optional date window. Leave empty for the Linkedcamp default.',
	spec: [date('from', 'From'), date('to', 'To')],
});
const limit = (required, def = 10, max = 1000) => p('limit', 'uinteger', 'Limit', {
	required, default: def, validate: { min: 1, max },
	help: 'Maximum number of bundles to return during one execution cycle.',
});
const keyValue = (name, label, keyLabel, valueLabel, help) => p(name, 'array', label, {
	help, spec: [text('key', keyLabel, { required: true }), text('value', valueLabel)],
});

const LEAD_STATUSES = ['FOUND', 'VIEWED', 'CONNECT_SENT', 'CONNECTED', 'FOLLOWUP', 'MESSAGE_SENT', 'INMAILS', 'INMAIL_SENT',
	'REPLIED', 'WITHDRAWN', 'INMAIL_CREDIT', 'FOLLOWED', 'EMAIL_SENT', 'OPENED', 'BOUNCED', 'CLICKED', 'UNSUBSCRIBED',
	'FAILED', 'INVITED', 'COMPLETED', 'NOT_QUALIFIED', 'OUT_OF_OFFICE'];
const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'FAILED', 'DELETED', 'COMPLETED', 'ARCHIVED', 'DRAFTED'];
const APPOINTMENT_STATUSES = ['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'COMPLETED'];
const UPLOAD_TARGETS = ['profileUrl', 'salesNavUrl', 'recruiterUrl', 'email', 'firstName', 'lastName', 'fullName',
	'personalization', 'phone', 'website', 'customVariable'];

const arg = (name) => `{{parameters.${name}}}`;
const args = (...names) => Object.fromEntries(names.map((n) => [n, arg(n)]));
const customFieldsArg = "{{if(parameters.customFields, toCollection(parameters.customFields, 'key', 'value'), undefined)}}";

// ---------------------------------------------------------------------------------------------
// Module kinds
// ---------------------------------------------------------------------------------------------
const TYPE = { trigger: 1, action: 4, search: 9, instant: 10, universal: 12 }; // Make API "Create module" typeId enum

// An action/get module: one tools/call, output = MCP result (contract step 6).
function action(name, label, description, tool, expect, argMap) {
	return {
		name, label, description, kind: 'action', tool,
		api: mcpRequest(tool, argMap, { response: { output: `{{mcpResult(body, ${RPC_ID})}}` } }),
		parameters: [], expect, interface: [], samples: {},
	};
}

// A paginated list (search, polling trigger or RPC). `pageArgs` adds page (and pageSize) arguments.
function listRequest(tool, argMap, { pageSize } = {}) {
	const first = { ...argMap, page: 1, ...(pageSize ? { pageSize } : {}) };
	const next = { ...argMap, page: '{{pagination.page}}', ...(pageSize ? { pageSize } : {}) };
	return {
		...mcpRequest(tool, first),
		// The whole body is restated so page 2+ cannot lose arguments, whichever way Make merges bodies.
		pagination: { body: rpcBody(tool, next) },
	};
}

function search(name, label, description, tool, expect, argMap, opts) {
	const req = listRequest(tool, argMap, opts);
	req.response = { iterate: `{{mcpList(body, ${RPC_ID})}}`, output: '{{item}}', limit: '{{parameters.limit}}' };
	return { name, label, description, kind: 'search', tool, api: req, parameters: [], expect: [...expect, limit(false)], interface: [], samples: {} };
}

function polling(name, label, description, tool, argMap, { order, pageSize } = {}) {
	const req = listRequest(tool, argMap, { pageSize });
	req.response = {
		iterate: `{{mcpList(body, ${RPC_ID})}}`,
		output: '{{item}}',
		limit: '{{parameters.limit}}',
		trigger: { id: '{{recordId(item)}}', type: 'id', order },
	};
	return { name, label, description, kind: 'trigger', tool, api: req, parameters: [limit(true)], expect: [], interface: [], samples: {} };
}

// ---------------------------------------------------------------------------------------------
// Instant triggers: one attached webhook per event (spec 4.3 / 5)
// ---------------------------------------------------------------------------------------------
const EVENTS = [
	['watchNewReplies', 'Watch new replies', 'REPLY_DETECTED', 'Triggers when a prospect replies in a Linkedcamp campaign.'],
	['watchConnectionsAccepted', 'Watch new connections accepted', 'ACCEPTS_REQUEST', 'Triggers when a prospect accepts a connection request sent by a Linkedcamp campaign.'],
	['watchConnectionRequestsSent', 'Watch new connection requests sent', 'CONNECT_INVITED', 'Triggers when a campaign sends a connection request.'],
	['watchEmailsSent', 'Watch new emails sent', 'EMAIL_SENT', 'Triggers when a campaign email is sent.'],
	['watchEmailOpens', 'Watch new email opens', 'OPENED', 'Triggers when a campaign email is opened.'],
	['watchEmailLinkClicks', 'Watch new email link clicks', 'CLICKED', 'Triggers when a campaign email has a link clicked.'],
	['watchEmailBounces', 'Watch new email bounces', 'BOUNCED', 'Triggers when a campaign email bounces.'],
	['watchUnsubscribes', 'Watch new unsubscribes', 'UNSUBSCRIBED', 'Triggers when a prospect unsubscribes from campaign emails.'],
];

const webhooks = EVENTS.map(([moduleName, label, event]) => ({
	name: `hook${event.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join('')}`,
	label: `${label.replace(/^Watch new /, '').replace(/^./, (c) => c.toUpperCase())} (${event})`,
	event,
	moduleName,
	// Receiver: the payload schema is not documented (spec 5), so the body is passed through unchanged.
	api: { output: '{{body}}' },
	parameters: [],
	attach: [
		{
			url: `${REST}/webhooks`,
			method: 'POST',
			type: 'json',
			headers: restHeaders,
			body: { title: `Make: ${label}`, callbackUrl: '{{webhook.url}}', event },
			response: restResponse({ temp: { createdId: '{{body.data._id}}' } }),
			log: { sanitize: REST_SANITIZE },
		},
		{
			// The create response documents no id, so read the list and match the URL just registered.
			url: `${REST}/webhooks`,
			method: 'GET',
			headers: restHeaders,
			response: restResponse({
				valid: "{{body.success === true && pickWebhookId(temp.createdId, body.data, webhook.url) !== ''}}",
				error: {
					message: "{{if(body.success === true, 'The Linkedcamp webhook was created, but its id was not found in GET /webhooks. Remove it in Linkedcamp before retrying.', ifempty(body.message, 'Linkedcamp API error'))}}",
					401: { message: 'Reconnect Linkedcamp: the API key was rejected.', type: 'InvalidAccessTokenError' },
					403: { message: 'Not allowed for this Linkedcamp key (plan, permission or server-side block).' },
				},
				data: { externalHookId: '{{pickWebhookId(temp.createdId, body.data, webhook.url)}}' },
			}),
			log: { sanitize: REST_SANITIZE },
		},
	],
	detach: {
		url: `${REST}/webhooks/{{webhook.externalHookId}}`,
		method: 'DELETE',
		headers: restHeaders,
		response: restResponse(),
		log: { sanitize: REST_SANITIZE },
	},
}));

const instantTriggers = EVENTS.map(([name, label, event, description], i) => ({
	name, label, description, kind: 'instant', webhook: webhooks[i].name, event,
	api: {}, parameters: [], expect: [], interface: [], samples: {},
}));

// ---------------------------------------------------------------------------------------------
// Polling triggers (spec 4.2)
// ---------------------------------------------------------------------------------------------
const pollingTriggers = [
	polling('watchAppointments', 'Watch new appointments', 'Triggers when a meeting is booked from a Linkedcamp conversation.',
		'appointment_list', { status: 'CONFIRMED' }, { order: 'unordered' }),
	polling('watchCampaigns', 'Watch new campaigns', 'Triggers when a new campaign is created.',
		'campaign_list', {}, { order: 'desc' }),
	polling('watchRepliedLeads', 'Watch new replied leads', 'Triggers when a lead reaches the Replied status. Checks leads that replied in the last 24 hours; each lead triggers once.',
		'lead_list', { status: 'REPLIED', range: { from: '{{addDays(now, -1)}}' } }, { order: 'unordered', pageSize: 100 }),
];

// ---------------------------------------------------------------------------------------------
// Actions (spec 4.4)
// ---------------------------------------------------------------------------------------------
const leadContactFields = [
	text('firstName', 'First name'),
	text('lastName', 'Last name'),
	text('fullName', 'Full name', { help: 'Use instead of first and last name when you only have one string.' }),
	text('designation', 'Job title'),
	text('location', 'Location', { help: 'City, region or country.' }),
	text('phone', 'Phone'),
	text('website', 'Website'),
	text('salesNavLink', 'Sales Navigator profile URL'),
	text('recruiterLink', 'LinkedIn Recruiter profile URL'),
	text('personalization', 'Personalization', { help: 'Free-text hook available in campaign copy as the personalization merge field.' }),
	keyValue('customFields', 'Custom fields', 'Field name', 'Value', 'Extra merge fields for this lead, usable in campaign copy by field name.'),
];

const actions = [
	action('addLeadToCampaign', 'Add a lead to a campaign', 'Adds a prospect to a Linkedcamp campaign by LinkedIn profile URL or email.', 'lead_add', [
		campaignId(true),
		text('profileLink', 'LinkedIn profile URL', { help: 'A linkedin.com/in/... URL. Required if **Email** is empty.' }),
		p('email', 'email', 'Email', { help: 'Required if **LinkedIn profile URL** is empty.' }),
		...leadContactFields,
	], {
		...args('campaignId', 'profileLink', 'email', 'firstName', 'lastName', 'fullName', 'designation', 'location', 'phone',
			'website', 'salesNavLink', 'recruiterLink', 'personalization'),
		customFields: customFieldsArg,
	}),

	action('addLeadsToCampaign', 'Bulk add leads to a campaign (advanced)', 'Adds up to 5,000 prospect rows to a Linkedcamp campaign in one request. The import runs in the background.', 'campaign_upload_leads', [
		campaignId(true),
		p('header', 'array', 'Column mapping', {
			required: true,
			help: 'Map each column name used in **Leads** to a Linkedcamp field. Use **Custom variable** to keep a column as a merge field. Rows with neither a profile URL nor an email are skipped.',
			spec: [
				text('column', 'Column name', { required: true }),
				select('field', 'Linkedcamp field', UPLOAD_TARGETS.map((v) => ({ label: v === 'customVariable' ? 'Custom variable' : v, value: v })), { required: true }),
			],
		}),
		p('leads', 'any', 'Leads', {
			required: true,
			help: 'An array of row objects (for example from an array aggregator), each keyed by the column names in **Column mapping**. Maximum 5,000 rows.',
		}),
		bool('removeDuplicates', 'Remove duplicates', { default: true, help: 'Skip prospects already enrolled in another active or paused campaign on this account.' }),
	], {
		campaignId: arg('campaignId'),
		header: "{{toCollection(parameters.header, 'column', 'field')}}",
		leads: arg('leads'),
		removeDuplicates: arg('removeDuplicates'),
	}),

	action('updateLead', 'Update a lead', "Updates a lead's details, personalization or custom fields, or pauses, excludes or marks it interested.", 'lead_update', [
		leadId('Lead ID, for example from **Search leads**.'),
		p('email', 'email', 'Email'),
		text('firstName', 'First name'),
		text('lastName', 'Last name'),
		text('designation', 'Job title'),
		text('phone', 'Phone'),
		text('website', 'Website'),
		text('personalization', 'Personalization', { help: 'Free-text hook available in campaign copy as the personalization merge field.' }),
		bool('paused', 'Paused', { help: "Freeze this lead's sequence without removing it." }),
		bool('isExcluded', 'Excluded', { help: 'Remove the lead from sending while keeping the record.' }),
		bool('isInterested', 'Interested', { help: 'Mark the reply as positive intent.' }),
		bool('seen', 'Seen', { help: 'Mark as read.' }),
		keyValue('customFields', 'Custom fields', 'Field name', 'Value', 'Extra merge-field data for this lead.'),
	], {
		...args('leadId', 'email', 'firstName', 'lastName', 'designation', 'phone', 'website', 'personalization', 'paused',
			'isExcluded', 'isInterested', 'seen'),
		customFields: customFieldsArg,
	}),

	action('addNoteToLead', 'Add a note to a lead', 'Adds an internal note to a lead. Nothing is sent.', 'lead_note_add', [
		leadId(),
		p('content', 'text', 'Note', { required: true, multiline: true, help: 'Internal only; never sent to the prospect.' }),
	], args('leadId', 'content')),

	action('sendMessage', 'Send a message',
		'Sends a message in an existing conversation. It is delivered immediately and cannot be recalled. Warning: this delivers to a real person on LinkedIn or by email as soon as the module runs.',
		'message_send', [
			conversationId(),
			p('content', 'text', 'Message', { required: true, multiline: true, help: 'Delivered exactly as written, immediately, and it cannot be edited or recalled.' }),
			p('attachment', 'collection', 'Attachment', {
				help: 'Optional file that is already hosted at a publicly reachable URL.',
				spec: [
					text('url', 'File URL', { required: true }),
					text('name', 'File name', { help: 'Shown to the recipient, for example case-study.pdf.' }),
					text('type', 'MIME type', { help: 'For example application/pdf.' }),
				],
			}),
		], {
			...args('conversationId', 'content'),
			attachment: '{{if(parameters.attachment.url, parameters.attachment, undefined)}}',
		}),

	action('draftAiReply', 'Draft an AI reply', 'Drafts a reply with your connected AI provider. Nothing is sent.', 'message_draft_ai_reply', [
		conversationId(),
		select('provider', 'AI provider', [
			{ label: 'OpenAI', value: 'OPENAI' }, { label: 'Anthropic', value: 'ANTHROPIC' }, { label: 'Gemini', value: 'GEMINI' },
			{ label: 'Grok', value: 'GROK' }, { label: 'DeepSeek', value: 'DEEPSEEK' },
		], { required: true, help: 'The provider must be connected in Linkedcamp under Settings → Integrations.' }),
		p('prompt', 'text', 'Prompt', { required: true, multiline: true, help: 'What the reply should do, for example: propose three times next week for a 20-minute call.' }),
	], args('conversationId', 'provider', 'prompt')),

	action('updateConversation', 'Update a conversation', 'Archives a conversation, marks it read, or hands it between the AI agent and a human.', 'conversation_update', [
		conversationId(),
		bool('isArchived', 'Archived', { help: 'Move out of the main list without deleting.' }),
		bool('seen', 'Seen', { help: 'Mark as read.' }),
		bool('assistant', 'AI agent handles this conversation', { help: 'Set to **No** to hand the conversation to a human.' }),
		bool('pauseBotOnManualMessage', 'Pause the AI agent on a manual message', { help: 'Stand the AI agent down as soon as a human sends a message here.' }),
	], args('conversationId', 'isArchived', 'seen', 'assistant', 'pauseBotOnManualMessage')),

	action('pauseResumeCampaign', 'Pause or resume a campaign', 'Pauses a running campaign or resumes a paused one.', 'campaign_set_status', [
		campaignId(true),
		select('status', 'Status', [{ label: 'Pause', value: 'PAUSED' }, { label: 'Resume (active)', value: 'ACTIVE' }], {
			required: true,
			help: '**Resume** works only on a paused campaign and restarts its outreach. This never archives, completes or deletes a campaign.',
		}),
	], args('campaignId', 'status')),

	action('launchCampaign', 'Launch a campaign',
		'Launches a drafted campaign so it starts sending. Warning: this starts real outreach to real people from the connected LinkedIn account and mailboxes.',
		'campaign_launch', [
			campaignId(true, 'A drafted campaign whose readiness check passes (see **Get a campaign**). Launching starts real outreach.'),
			bool('skipPreflight', 'Skip the readiness check', { default: false, help: 'Let the Linkedcamp backend decide instead of the local readiness check. Only useful if that check is wrong.' }),
		], args('campaignId', 'skipPreflight')),

	action('createDraftCampaign', 'Create a draft campaign', 'Creates a new draft campaign. Nothing is sent until the campaign is launched.', 'campaign_create', [
		text('title', 'Title', { required: true }),
		text('sourceUrl', 'Source URL', { help: 'Optional LinkedIn search, Sales Navigator, Recruiter, group, event or post URL to take prospects from. Leave empty for a campaign you fill with **Bulk add leads to a campaign (advanced)**.' }),
	], args('title', 'sourceUrl')),

	action('addBlacklistEntry', 'Add a blacklist entry', 'Creates a new account-wide blacklist rule that excludes prospects by profile URL, company URL, keyword, job title or email.', 'blacklist_add', [
		rpcSelect('linkedAccountId', 'LinkedIn account', 'listLinkedInAccounts', { required: true, mode: 'edit' }),
		select('type', 'Type', [
			{ label: 'Profile URL', value: 'PROFILE_URL' }, { label: 'Company URL', value: 'COMPANY_URL' }, { label: 'Keyword', value: 'KEYWORD' },
			{ label: 'Job title', value: 'JOB_TITLE' }, { label: 'Email', value: 'EMAIL' },
		], { required: true }),
		text('keyword', 'Value', { required: true, help: 'A URL, an email, or a substring for **Keyword** and **Job title**. Keep keywords specific: they match as substrings.' }),
	], args('linkedAccountId', 'type', 'keyword')),

	action('createTag', 'Create a tag', 'Creates a new tag.', 'tag_create', [
		text('content', 'Tag', { required: true }),
		select('interest', 'Interest', ['POSITIVE', 'NEGATIVE', 'NEUTRAL'], { required: true, help: 'Which reply-sentiment bucket the tag feeds.' }),
	], args('content', 'interest')),

	action('createUpdateTask', 'Create or update a task', 'Creates a new task, or updates an existing task by its ID. Nothing is sent to the prospect.', 'task_upsert', [
		text('title', 'Title', { required: true }),
		text('taskId', 'Task ID', { help: 'Leave empty to create a new task.' }),
		p('content', 'text', 'Details', { multiline: true }),
		text('leadId', 'Lead ID'),
		text('conversationId', 'Conversation ID'),
		text('link', 'Link'),
		text('tag', 'Label', { help: 'Free-text label for grouping.' }),
		date('date', 'Due date'),
		bool('isCompleted', 'Completed'),
	], args('taskId', 'title', 'content', 'leadId', 'conversationId', 'link', 'tag', 'date', 'isCompleted')),

	action('createReminder', 'Create a reminder', 'Creates a new follow-up reminder for you on a lead or conversation. Nothing is sent to the prospect.', 'reminder_create', [
		text('title', 'Title', { required: true }),
		date('remindAt', 'Remind at', { required: true }),
		p('description', 'text', 'Description', { multiline: true }),
		text('leadId', 'Lead ID'),
		text('conversationId', 'Conversation ID'),
		rpcSelect('linkedAccountId', 'LinkedIn account', 'listLinkedInAccounts', { mode: 'edit' }),
	], args('title', 'remindAt', 'description', 'leadId', 'conversationId', 'linkedAccountId')),

	{
		...action('callTool', 'Call a Linkedcamp tool', 'Calls any Linkedcamp MCP tool your API key can use, with JSON arguments. Some tools send messages or start outreach; check the tool before you run it.', '(any)', [
			rpcSelect('name', 'Tool', 'listTools', { required: true, mode: 'edit', help: 'Tools your key cannot use are not listed. Reference: https://docs.linkedcamp.com/mcp/tools' }),
			p('arguments', 'text', 'Arguments (JSON)', { required: true, default: '{}', multiline: true, help: 'A JSON object with the tool arguments, for example `{"campaignId": "..."}`.' }),
		], null),
		api: {
			url: '/mcp', method: 'POST', type: 'json',
			body: { jsonrpc: '2.0', id: RPC_ID, method: 'tools/call', params: { name: arg('name'), arguments: '{{parseJSON(parameters.arguments)}}' } },
			response: { output: `{{mcpResult(body, ${RPC_ID})}}` },
		},
	},
];

// Universal REST module (mandatory for review). Relative path only; `token` injected.
const makeApiCall = {
	name: 'makeApiCall', label: 'Make an API call', kind: 'universal', tool: 'REST',
	description: "Sends a custom API call to Linkedcamp. You can use this to call endpoints that aren't covered by existing modules.",
	api: {
		url: `${REST}{{parameters.url}}`,
		method: '{{parameters.method}}',
		type: 'text',
		headers: { '{{...}}': "{{toCollection(parameters.headers, 'key', 'value')}}", token: '{{connection.apiKey}}' },
		qs: { '{{...}}': "{{toCollection(parameters.qs, 'key', 'value')}}" },
		body: '{{parameters.body}}',
		response: {
			type: 'json',
			valid: '{{body.success === true}}',
			error: {
				message: "{{ifempty(body.message, 'Linkedcamp API error')}}",
				401: { message: 'Reconnect Linkedcamp: the API key was rejected.', type: 'InvalidAccessTokenError' },
			},
			output: { body: '{{body}}', headers: '{{headers}}', statusCode: '{{statusCode}}' },
		},
		log: { sanitize: REST_SANITIZE },
	},
	parameters: [],
	expect: [
		text('url', 'URL', {
			required: true, validate: { pattern: '^/[^/]' },
			help: 'A path relative to `https://api.linkedcamp.com`, starting with `/`. For example: `/webhooks`. API reference: https://docs.linkedcamp.com/introduction',
		}),
		select('method', 'Method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((v) => ({ label: v, value: v })), { required: true, default: 'GET' }),
		keyValue('headers', 'Headers', 'Key', 'Value', 'You do not need to add the `token` header; it is added for you.'),
		keyValue('qs', 'Query string', 'Key', 'Value'),
		p('body', 'any', 'Body', { help: 'Request body, usually JSON text. Ignored for GET.' }),
	],
	interface: [
		p('body', 'any', 'Body'),
		p('headers', 'collection', 'Headers'),
		p('statusCode', 'number', 'Status code'),
	],
	samples: {},
};
makeApiCall.expect[2].default = [{ key: 'Content-Type', value: 'application/json' }];

// ---------------------------------------------------------------------------------------------
// Searches and gets (spec 4.5)
// ---------------------------------------------------------------------------------------------
const searches = [
	search('searchCampaigns', 'Search campaigns', 'Returns a list of campaigns filtered by title, status or client sub-account, newest first.', 'campaign_list', [
		text('keyword', 'Title contains'),
		select('status', 'Status', CAMPAIGN_STATUSES),
		userId(),
	], args('keyword', 'status', 'userId')),

	action('getCampaign', 'Get a campaign', 'Returns information about a specific campaign by its ID, including settings, schedule, limits, accounts, lead source, counters and readiness.', 'campaign_get', [
		campaignId(true),
		bool('includeFlow', 'Include the sequence outline', { default: true }),
	], args('campaignId', 'includeFlow')),

	search('searchLeads', 'Search leads', 'Returns a list of leads filtered by name, email or company, campaign, status, tags or date range.', 'lead_list', [
		text('keyword', 'Keyword', { help: 'Searches name, email or company.' }),
		campaignId(false, 'Leave empty to search every campaign.'),
		select('status', 'Status', LEAD_STATUSES),
		p('tags', 'array', 'Tag IDs', { spec: { type: 'text', label: 'Tag ID' }, help: 'Leads must carry at least one of these tags.' }),
		range(),
	], args('keyword', 'campaignId', 'status', 'tags', 'range'), { pageSize: 100 }),

	action('getLead', 'Get a lead', 'Returns information about a specific lead by its ID, with its activity history and position in the campaign.', 'lead_get', [
		leadId(),
		bool('includeActivities', 'Include activities', { default: true }),
		bool('includeMessages', 'Include messages', { default: false, help: 'Includes the full message thread, which can be long.' }),
	], args('leadId', 'includeActivities', 'includeMessages')),

	action('getCampaignStats', 'Get campaign stats', 'Returns headline performance for a specific campaign by its ID, or for the whole account when no campaign is chosen.', 'analytics_campaign', [
		campaignId(false, 'Leave empty for a roll-up across the whole account.'),
		range(),
		bool('includeGraph', 'Include the day-by-day series', { default: false }),
		userId(),
	], args('campaignId', 'range', 'includeGraph', 'userId')),

	action('getCampaignFunnel', 'Get a campaign funnel', 'Returns stage-by-stage conversion for a specific campaign by its ID. It can be slow on campaigns with many leads.', 'analytics_campaign_funnel', [
		campaignId(true),
		range(),
	], args('campaignId', 'range')),

	search('searchConversations', 'Search conversations', 'Returns a list of LinkedIn and email conversations filtered by campaign, keyword, channel, tags or account, newest activity first. It does not mark them as read.', 'conversation_list', [
		campaignId(false),
		text('keyword', 'Keyword', { help: 'Searches names and message bodies.' }),
		text('platform', 'Platform', { help: 'For example `linkedin` or `email`.' }),
		text('type', 'Conversation type', { help: 'For example `email`.' }),
		text('tags', 'Tag IDs', { help: 'Comma-separated tag IDs.' }),
		rpcSelect('linkedAccountId', 'LinkedIn account', 'listLinkedInAccounts', { mode: 'edit' }),
		text('emailAccountId', 'Mailbox ID', { help: 'Only conversations on this mailbox.' }),
	], args('campaignId', 'keyword', 'platform', 'type', 'tags', 'linkedAccountId', 'emailAccountId')),

	search('searchAppointments', 'Search appointments', 'Returns a list of meetings booked from conversations, filtered by lead, conversation or status.', 'appointment_list', [
		text('leadId', 'Lead ID'),
		text('conversationId', 'Conversation ID'),
		select('status', 'Status', APPOINTMENT_STATUSES),
	], args('leadId', 'conversationId', 'status')),
];

// ---------------------------------------------------------------------------------------------
// RPCs (spec 4.5 dropdowns)
// ---------------------------------------------------------------------------------------------
function optionsRpc(name, label, tool, kind, argMap, { paged, pageSize, limitCount }) {
	const req = paged ? listRequest(tool, argMap, { pageSize }) : mcpRequest(tool, argMap);
	req.response = {
		iterate: `{{mcpList(body, ${RPC_ID})}}`,
		output: { label: `{{optionLabel(item, '${kind}')}}`, value: '{{recordId(item)}}' },
		limit: limitCount,
	};
	return { name, label, tool, api: req, parameters: [] };
}

const rpcs = [
	optionsRpc('listCampaigns', 'List campaigns', 'campaign_list', 'campaign', {}, { paged: true, limitCount: 60 }),
	optionsRpc('listLinkedInAccounts', 'List LinkedIn accounts', 'linkedin_account_list', 'linkedinAccount', {}, { paged: false, limitCount: 300 }),
	optionsRpc('listClients', 'List clients (sub-accounts)', 'subaccount_list', 'client', {}, { paged: true, pageSize: 200, limitCount: 500 }),
	{
		name: 'listTools', label: 'List tools', tool: 'tools/list', parameters: [],
		api: {
			url: '/mcp', method: 'POST', type: 'json',
			body: { jsonrpc: '2.0', id: RPC_ID, method: 'tools/list', params: {} },
			response: {
				// tools/list result shape is defined by the MCP specification: result.tools[].name, result.nextCursor.
				iterate: `{{parseMcp(body, ${RPC_ID}).result.tools}}`,
				output: { label: '{{item.name}}', value: '{{item.name}}' },
				limit: 500,
			},
			pagination: {
				condition: `{{if(parseMcp(body, ${RPC_ID}).result.nextCursor, true, false)}}`,
				body: { jsonrpc: '2.0', id: RPC_ID, method: 'tools/list', params: { cursor: `{{parseMcp(body, ${RPC_ID}).result.nextCursor}}` } },
			},
		},
	},
];

// ---------------------------------------------------------------------------------------------
// Base and connection
// ---------------------------------------------------------------------------------------------
const base = {
	baseUrl: 'https://mcp.linkedcamp.com',
	headers: {
		'x-api-key': '{{connection.apiKey}}',
		accept: 'application/json, text/event-stream',
		'mcp-protocol-version': '2025-06-18',
	},
	response: {
		// Read the raw text so JSON and SSE (text/event-stream) bodies are parsed the same way by parseMcp.
		type: 'text',
		valid: `{{mcpError(body, ${RPC_ID}, statusCode) === ''}}`,
		error: {
			message: `{{mcpError(body, ${RPC_ID}, statusCode)}}`,
			401: { message: `{{mcpError(body, ${RPC_ID}, statusCode)}}`, type: 'InvalidAccessTokenError' },
		},
	},
	log: { sanitize: ['request.headers.x-api-key', 'request.headers.token'] },
};

const connection = {
	name: 'linkedcamp',
	label: 'Linkedcamp',
	parameters: [p('apiKey', 'password', 'API Key', {
		required: true,
		help: 'Find it in Linkedcamp under Settings → Integrations → API ([open](https://app.linkedcamp.com/settings/integrations?type=api)). It needs a plan with Pro features and the Integrations permission.',
	})],
	// Connection communication does not inherit Base and may not have custom IML functions,
	// so this check uses plain IML and expects a JSON body (see DESIGN.md, transport).
	api: {
		url: 'https://mcp.linkedcamp.com/mcp',
		method: 'POST',
		type: 'json',
		headers: {
			'x-api-key': '{{parameters.apiKey}}',
			accept: 'application/json, text/event-stream',
			'mcp-protocol-version': '2025-06-18',
		},
		body: rpcBody('whoami', {}),
		response: {
			type: 'json',
			valid: '{{statusCode === 200 && !body.error && !!body.result && body.result.isError !== true}}',
			error: {
				message: "{{if(body.error, body.error.message, if(body.result.isError, 'Linkedcamp rejected the whoami check.', 'Unexpected response from the Linkedcamp MCP server.'))}}",
				401: { message: 'The Linkedcamp API key was rejected.', type: 'InvalidAccessTokenError' },
				403: { message: 'This Linkedcamp key is not allowed to use the MCP server (plan, Integrations permission or access tier).' },
			},
			// TODO(capture): whoami documents name and email; the exact path is pending capture.
			metadata: { type: 'text', value: '{{body.result.structuredContent.email}}' },
		},
		log: { sanitize: ['request.headers.x-api-key'] },
	},
};

// ---------------------------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------------------------
const json = (v) => `${JSON.stringify(v, null, '\t')}\n`;
const write = (rel, value) => {
	const path = join(APP, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, typeof value === 'string' ? value : json(value));
};

for (const dir of ['connections', 'rpcs', 'webhooks', 'modules']) rmSync(join(APP, dir), { recursive: true, force: true });

write('base.imljson', base);
write(`connections/${connection.name}/api.imljson`, connection.api);
write(`connections/${connection.name}/parameters.imljson`, connection.parameters);

for (const r of rpcs) {
	write(`rpcs/${r.name}/api.imljson`, r.api);
	write(`rpcs/${r.name}/parameters.imljson`, r.parameters);
}
for (const w of webhooks) {
	for (const s of ['api', 'parameters', 'attach', 'detach']) write(`webhooks/${w.name}/${s}.imljson`, w[s]);
}

const modules = [...instantTriggers, ...pollingTriggers, ...actions, makeApiCall, ...searches];
const names = new Set();
for (const m of modules) {
	if (names.has(m.name)) throw new Error(`duplicate module ${m.name}`);
	names.add(m.name);
	for (const s of ['api', 'parameters', 'expect', 'interface', 'samples']) write(`modules/${m.name}/${s}.imljson`, m[s]);
}

const groups = [
	{ label: 'Triggers', modules: [...instantTriggers, ...pollingTriggers].map((m) => m.name) },
	{ label: 'Leads', modules: ['addLeadToCampaign', 'addLeadsToCampaign', 'updateLead', 'addNoteToLead', 'getLead', 'searchLeads'] },
	{ label: 'Campaigns', modules: ['createDraftCampaign', 'launchCampaign', 'pauseResumeCampaign', 'getCampaign', 'searchCampaigns', 'getCampaignStats', 'getCampaignFunnel'] },
	{ label: 'Inbox', modules: ['sendMessage', 'draftAiReply', 'updateConversation', 'searchConversations'] },
	{ label: 'CRM and library', modules: ['createUpdateTask', 'createReminder', 'searchAppointments', 'addBlacklistEntry', 'createTag'] },
	{ label: 'Other', modules: ['callTool', 'makeApiCall'] },
];
const grouped = groups.flatMap((g) => g.modules);
for (const n of names) if (!grouped.includes(n)) throw new Error(`module ${n} is in no group`);
for (const n of grouped) if (!names.has(n)) throw new Error(`group lists unknown module ${n}`);
write('groups.json', groups);

// Component metadata for scripts/upload.mjs (not a Make section).
write('app.manifest.json', {
	app: {
		name: 'linkedcamp',
		label: 'Linkedcamp',
		description: 'Linkedcamp is agentic LinkedIn and email outreach for lead generation agencies.',
		theme: '#2CC5F4',
		language: 'en',
	},
	connection: { name: connection.name, label: connection.label, type: 'basic' },
	functions: ['parseMcp', 'mcpResult', 'mcpError', 'mcpList', 'recordId', 'optionLabel', 'pickWebhookId'],
	rpcs: rpcs.map((r) => ({ name: r.name, label: r.label, tool: r.tool })),
	webhooks: webhooks.map((w) => ({ name: w.name, label: w.label, event: w.event })),
	modules: modules.map((m) => ({
		name: m.name, label: m.label, description: m.description, kind: m.kind, typeId: TYPE[m.kind],
		tool: m.tool ?? null, event: m.event ?? null, webhook: m.webhook ?? null,
	})),
});

console.log(`Generated base, 1 connection, ${rpcs.length} RPCs, ${webhooks.length} webhooks, ${modules.length} modules, ${groups.length} groups.`);
