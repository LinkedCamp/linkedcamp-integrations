'use strict';

const { callTool } = require('../lib/mcp');
const { listWithIds, asObject } = require('../lib/hydrate');
const F = require('../lib/fields');

// Search-powered fields are for actions; inside a search use the dropdown only.
const noSearch = ({ search, ...field }) => field;

// Empty tool results are an empty list, not an error (§3).
const list = (tool, buildArgs) => async (z, bundle) =>
  listWithIds(await callTool(z, tool, buildArgs(bundle.inputData || {})), tool);

const one = (tool, buildArgs) => async (z, bundle) => {
  const out = await callTool(z, tool, buildArgs(bundle.inputData || {}));
  if (out === null || out === undefined) return [];
  return [asObject(out)];
};

const findCampaign = {
  key: 'find_campaign',
  noun: 'Campaign',
  display: { label: 'Find Campaign', description: 'Finds a campaign by title or status.' },
  operation: {
    inputFields: [
      { key: 'keyword', label: 'Title Contains', required: false },
      { key: 'status', label: 'Status', required: false, choices: F.CAMPAIGN_STATUSES },
      F.page,
      F.clientUserId,
    ],
    perform: list('campaign_list', (i) => ({ ...F.pick(i, ['keyword', 'status', 'userId']), page: F.int(i.page) })),
  },
};

const getCampaign = {
  key: 'get_campaign',
  noun: 'Campaign',
  display: { label: 'Find Campaign Details', description: 'Finds one campaign with its settings, counters and launch readiness.' },
  operation: {
    inputFields: [
      F.campaignId(),
      { key: 'includeFlow', label: 'Include Sequence Outline', type: 'boolean', required: false, default: 'true' },
    ],
    perform: one('campaign_get', (i) => ({ campaignId: i.campaignId, includeFlow: F.bool(i.includeFlow) })),
  },
};

const findLead = {
  key: 'find_lead',
  noun: 'Lead',
  display: { label: 'Find Lead', description: 'Finds a lead by name, email or company.' },
  operation: {
    inputFields: [
      { key: 'keyword', label: 'Name, Email or Company', required: true },
      F.campaignId({ required: false, helpText: 'Leave blank to search every campaign.' }),
      { key: 'status', label: 'Status', required: false, choices: F.LEAD_STATUSES },
      { key: 'tags', label: 'Tags', required: false, list: true, dynamic: 'tag_choices.id.label', helpText: 'Leads must carry at least one.' },
      ...F.rangeFields,
      F.page,
      { key: 'pageSize', label: 'Page Size', type: 'integer', required: false, helpText: '1–100. Default 25.' },
    ],
    perform: list('lead_list', (i) => ({
      ...F.pick(i, ['keyword', 'campaignId', 'status']),
      tags: Array.isArray(i.tags) && i.tags.length ? i.tags : undefined,
      range: F.buildRange(i),
      page: F.int(i.page),
      pageSize: F.int(i.pageSize),
    })),
  },
};

const getLead = {
  key: 'get_lead',
  noun: 'Lead',
  display: { label: 'Find Lead Details', description: "Finds one lead's full profile, activity history and position in the sequence." },
  operation: {
    inputFields: [
      F.leadId(),
      { key: 'includeActivities', label: 'Include Activities', type: 'boolean', required: false, default: 'true' },
      { key: 'includeMessages', label: 'Include Messages', type: 'boolean', required: false, default: 'false' },
    ],
    perform: one('lead_get', (i) => ({
      leadId: i.leadId,
      includeActivities: F.bool(i.includeActivities),
      includeMessages: F.bool(i.includeMessages),
    })),
  },
};

const getCampaignStats = {
  key: 'get_campaign_stats',
  noun: 'Campaign Stats',
  display: {
    label: 'Find Campaign Stats',
    description: 'Finds headline performance for one campaign, or for the whole account when no campaign is chosen.',
  },
  operation: {
    inputFields: [
      F.campaignId({ required: false, helpText: 'Leave blank for an account-wide roll-up.' }),
      ...F.rangeFields,
      { key: 'includeGraph', label: 'Include Day-by-Day Series', type: 'boolean', required: false, default: 'false' },
      F.clientUserId,
    ],
    perform: one('analytics_campaign', (i) => ({
      ...F.pick(i, ['campaignId', 'userId']),
      range: F.buildRange(i),
      includeGraph: F.bool(i.includeGraph),
    })),
  },
};

const findConversation = {
  key: 'find_conversation',
  noun: 'Conversation',
  display: { label: 'Find Conversation', description: 'Finds an inbox conversation by person, campaign or account.' },
  operation: {
    inputFields: [
      { key: 'keyword', label: 'Keyword', required: false, helpText: 'Search names and message bodies.' },
      F.campaignId({ required: false }),
      { key: 'platform', label: 'Platform', required: false, helpText: 'e.g. linkedin or email.' },
      { key: 'type', label: 'Thread Type', required: false, helpText: 'e.g. email.' },
      { key: 'tags', label: 'Tags', required: false, list: true, dynamic: 'tag_choices.id.label' },
      F.linkedAccountId({ required: false }),
      { key: 'emailAccountId', label: 'Email Account', required: false, helpText: 'Only threads on this mailbox.' },
      F.page,
    ],
    perform: list('conversation_list', (i) => ({
      ...F.pick(i, ['keyword', 'campaignId', 'platform', 'type', 'linkedAccountId', 'emailAccountId']),
      // conversation_list takes tags as a comma-separated string
      tags: Array.isArray(i.tags) ? (i.tags.length ? i.tags.join(',') : undefined) : i.tags,
      page: F.int(i.page),
    })),
  },
};

const findAppointment = {
  key: 'find_appointment',
  noun: 'Appointment',
  display: { label: 'Find Appointment', description: 'Finds a meeting booked from a lead or conversation.' },
  operation: {
    inputFields: [
      noSearch(F.leadId({ required: false })),
      noSearch(F.conversationId({ required: false })),
      { key: 'status', label: 'Status', required: false, choices: F.APPOINTMENT_STATUSES },
      F.page,
    ],
    perform: list('appointment_list', (i) => ({
      ...F.pick(i, ['leadId', 'conversationId', 'status']),
      page: F.int(i.page),
    })),
  },
};

const searches = [findCampaign, getCampaign, findLead, getLead, getCampaignStats, findConversation, findAppointment];

module.exports = { searches };
