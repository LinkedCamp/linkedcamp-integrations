'use strict';

// Shared input fields and enums (enums quoted from the live MCP input schemas).

const LEAD_STATUSES = [
  'FOUND', 'VIEWED', 'CONNECT_SENT', 'CONNECTED', 'FOLLOWUP', 'MESSAGE_SENT', 'INMAILS',
  'INMAIL_SENT', 'REPLIED', 'WITHDRAWN', 'INMAIL_CREDIT', 'FOLLOWED', 'EMAIL_SENT', 'OPENED',
  'BOUNCED', 'CLICKED', 'UNSUBSCRIBED', 'FAILED', 'INVITED', 'COMPLETED', 'NOT_QUALIFIED',
  'OUT_OF_OFFICE',
];
const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'FAILED', 'DELETED', 'COMPLETED', 'ARCHIVED', 'DRAFTED'];
const APPOINTMENT_STATUSES = ['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'COMPLETED'];
const AI_PROVIDERS = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROK', 'DEEPSEEK'];
const BLACKLIST_TYPES = ['PROFILE_URL', 'COMPANY_URL', 'KEYWORD', 'JOB_TITLE', 'EMAIL'];
const TAG_INTERESTS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'];

const campaignId = (overrides = {}) => ({
  key: 'campaignId',
  label: 'Campaign',
  required: true,
  dynamic: 'new_campaign.id.title',
  helpText: 'Pick a campaign or map a campaign ID.',
  ...overrides,
});

const linkedAccountId = (overrides = {}) => ({
  key: 'linkedAccountId',
  label: 'LinkedIn Account',
  required: true,
  dynamic: 'linkedin_account_choices.id.label',
  ...overrides,
});

const clientUserId = {
  key: 'userId',
  label: 'Client (agency owners only)',
  required: false,
  dynamic: 'client_choices.id.label',
  helpText:
    'Read a client sub-account instead of your own data. Only works with an agency owner key; leave blank otherwise.',
};

const leadId = (overrides = {}) => ({
  key: 'leadId',
  label: 'Lead',
  required: true,
  dynamic: 'lead_choices.id.label',
  search: 'find_lead.id',
  helpText: 'Pick a lead, or map the lead from a Find Lead step or a trigger.',
  ...overrides,
});

const conversationId = (overrides = {}) => ({
  key: 'conversationId',
  label: 'Conversation',
  required: true,
  dynamic: 'conversation_choices.id.label',
  search: 'find_conversation.id',
  helpText: 'Map the conversation from a Find Conversation step or a trigger, or pick one.',
  ...overrides,
});

const page = { key: 'page', label: 'Page', type: 'integer', required: false, helpText: '1-indexed page number.' };

const rangeFields = [
  { key: 'range_from', label: 'From', type: 'datetime', required: false, helpText: 'Start of the date window.' },
  { key: 'range_to', label: 'To', type: 'datetime', required: false, helpText: 'End of the date window.' },
];

const choices = (values) => values;

// Build the MCP `range` argument from range_from / range_to.
const buildRange = (input) => {
  const range = {};
  if (input.range_from) range.from = input.range_from;
  if (input.range_to) range.to = input.range_to;
  return Object.keys(range).length ? range : undefined;
};

// Zapier sends booleans from boolean fields as strings in some contexts.
const bool = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', 'yes', '1'].includes(s)) return true;
  if (['false', 'no', '0'].includes(s)) return false;
  return undefined;
};

const int = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

const pick = (input, keys) => {
  const out = {};
  for (const k of keys) if (input[k] !== undefined && input[k] !== '') out[k] = input[k];
  return out;
};

module.exports = {
  LEAD_STATUSES, CAMPAIGN_STATUSES, APPOINTMENT_STATUSES, AI_PROVIDERS, BLACKLIST_TYPES, TAG_INTERESTS,
  campaignId, linkedAccountId, clientUserId, leadId, conversationId, page, rangeFields,
  choices, buildRange, bool, int, pick,
};
