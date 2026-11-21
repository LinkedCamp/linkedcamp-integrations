'use strict';

const { callTool } = require('../lib/mcp');
const { asObject } = require('../lib/hydrate');
const F = require('../lib/fields');

const write = (tool, buildArgs) => async (z, bundle) =>
  asObject(await callTool(z, tool, buildArgs(bundle.inputData || {}), { write: true }));

const str = (key, label, extra = {}) => ({ key, label, required: false, ...extra });

const addLeadToCampaign = {
  key: 'add_lead_to_campaign',
  noun: 'Lead',
  display: {
    label: 'Add Lead to Campaign',
    description: 'Adds a prospect to a Linkedcamp campaign by LinkedIn profile URL or email.',
  },
  operation: {
    inputFields: [
      F.campaignId(),
      str('profileLink', 'LinkedIn Profile URL', { helpText: 'linkedin.com/in/... URL. Required if there is no email.' }),
      str('email', 'Email', { helpText: 'Required if there is no LinkedIn profile URL.' }),
      str('firstName', 'First Name'),
      str('lastName', 'Last Name'),
      str('fullName', 'Full Name', { helpText: 'Use instead of first/last name when you only have one string.' }),
      str('designation', 'Job Title'),
      str('location', 'Location'),
      str('phone', 'Phone'),
      str('website', 'Website'),
      str('salesNavLink', 'Sales Navigator Profile URL'),
      str('recruiterLink', 'LinkedIn Recruiter Profile URL'),
      str('personalization', 'Personalization', { type: 'text', helpText: 'Available in copy as {{personalization}}.' }),
      str('customFields', 'Custom Fields', { dict: true, helpText: 'Extra merge fields, usable in copy as {{fieldName}}.' }),
    ],
    perform: async (z, bundle) => {
      const i = bundle.inputData || {};
      if (!i.profileLink && !i.email) {
        throw new z.errors.Error('Provide a LinkedIn profile URL or an email.', 'InvalidInput', 400);
      }
      return write('lead_add', (input) =>
        F.pick(input, ['campaignId', 'profileLink', 'email', 'firstName', 'lastName', 'fullName', 'designation',
          'location', 'phone', 'website', 'salesNavLink', 'recruiterLink', 'personalization', 'customFields'])
      )(z, bundle);
    },
  },
};

const updateLead = {
  key: 'update_lead',
  noun: 'Lead',
  display: {
    label: 'Update Lead',
    description: "Updates a lead's details, personalization or custom fields, or pauses, excludes or marks it interested.",
  },
  operation: {
    inputFields: [
      F.leadId(),
      str('email', 'Email'),
      str('firstName', 'First Name'),
      str('lastName', 'Last Name'),
      str('designation', 'Job Title'),
      str('phone', 'Phone'),
      str('website', 'Website'),
      str('personalization', 'Personalization', { type: 'text' }),
      str('paused', 'Paused', { type: 'boolean', helpText: "Freeze this lead's sequence without removing it." }),
      str('isExcluded', 'Excluded', { type: 'boolean', helpText: 'Remove from sending while keeping the record.' }),
      str('isInterested', 'Interested', { type: 'boolean', helpText: 'Mark the reply as positive intent.' }),
      str('seen', 'Seen', { type: 'boolean', helpText: 'Mark as read.' }),
      str('customFields', 'Custom Fields', { dict: true }),
    ],
    perform: write('lead_update', (i) => ({
      ...F.pick(i, ['leadId', 'email', 'firstName', 'lastName', 'designation', 'phone', 'website',
        'personalization', 'customFields']),
      paused: F.bool(i.paused),
      isExcluded: F.bool(i.isExcluded),
      isInterested: F.bool(i.isInterested),
      seen: F.bool(i.seen),
    })),
  },
};

const addNoteToLead = {
  key: 'add_note_to_lead',
  noun: 'Note',
  display: { label: 'Add Note to Lead', description: 'Adds an internal note to a lead. Nothing is sent.' },
  operation: {
    inputFields: [F.leadId(), { key: 'content', label: 'Note', type: 'text', required: true }],
    perform: write('lead_note_add', (i) => F.pick(i, ['leadId', 'content'])),
  },
};

const sendMessage = {
  key: 'send_message',
  noun: 'Message',
  display: {
    label: 'Send Message',
    description: 'Sends a message in an existing conversation. It is delivered immediately and cannot be recalled.',
  },
  operation: {
    inputFields: [
      {
        key: 'warning',
        type: 'copy',
        helpText:
          '**This delivers immediately to a real person on LinkedIn or by email and cannot be recalled or edited.** Test with your own conversation first.',
      },
      F.conversationId(),
      { key: 'content', label: 'Message', type: 'text', required: true, helpText: 'Delivered exactly as written.' },
      str('attachment_url', 'Attachment URL', { helpText: 'Publicly reachable URL of a file to attach.' }),
      str('attachment_name', 'Attachment Name', { helpText: 'File name shown to the recipient, e.g. case-study.pdf.' }),
      str('attachment_type', 'Attachment MIME Type', { helpText: 'e.g. application/pdf.' }),
    ],
    perform: write('message_send', (i) => ({
      conversationId: i.conversationId,
      content: i.content,
      attachment: i.attachment_url
        ? { url: i.attachment_url, name: i.attachment_name, type: i.attachment_type }
        : undefined,
    })),
  },
};

const draftAiReply = {
  key: 'draft_ai_reply',
  noun: 'Draft',
  display: { label: 'Draft AI Reply', description: 'Drafts a reply with your connected AI provider. Nothing is sent.' },
  operation: {
    inputFields: [
      F.conversationId(),
      { key: 'provider', label: 'AI Provider', required: true, choices: F.AI_PROVIDERS,
        helpText: 'Must be connected in Linkedcamp under Settings → Integrations.' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: true,
        helpText: 'What the reply should do, e.g. "propose three times next week for a 20-min call".' },
    ],
    perform: write('message_draft_ai_reply', (i) => F.pick(i, ['conversationId', 'provider', 'prompt'])),
  },
};

const updateConversation = {
  key: 'update_conversation',
  noun: 'Conversation',
  display: {
    label: 'Update Conversation',
    description: 'Archives a conversation, marks it read, or hands it between the AI agent and a human.',
  },
  operation: {
    inputFields: [
      F.conversationId(),
      str('isArchived', 'Archived', { type: 'boolean' }),
      str('seen', 'Seen', { type: 'boolean' }),
      str('assistant', 'AI Agent Handles Thread', { type: 'boolean', helpText: 'No = hand the thread to a human.' }),
      str('pauseBotOnManualMessage', 'Pause AI Agent on Manual Message', { type: 'boolean' }),
    ],
    perform: write('conversation_update', (i) => ({
      conversationId: i.conversationId,
      isArchived: F.bool(i.isArchived),
      seen: F.bool(i.seen),
      assistant: F.bool(i.assistant),
      pauseBotOnManualMessage: F.bool(i.pauseBotOnManualMessage),
    })),
  },
};

const pauseResumeCampaign = {
  key: 'pause_resume_campaign',
  noun: 'Campaign',
  display: { label: 'Pause or Resume Campaign', description: 'Pauses a running campaign or resumes a paused one.' },
  operation: {
    inputFields: [
      F.campaignId(),
      { key: 'status', label: 'Status', required: true, choices: { PAUSED: 'Pause', ACTIVE: 'Resume (only from Paused)' } },
    ],
    perform: write('campaign_set_status', (i) => F.pick(i, ['campaignId', 'status'])),
  },
};

const launchCampaign = {
  key: 'launch_campaign',
  noun: 'Campaign',
  display: { label: 'Launch Campaign', description: 'Launches a drafted campaign so it starts sending.' },
  operation: {
    inputFields: [
      {
        key: 'warning',
        type: 'copy',
        helpText:
          '**This starts real outreach** from the connected LinkedIn account and mailboxes on the campaign schedule.',
      },
      F.campaignId(),
      str('skipPreflight', 'Skip Preflight Check', { type: 'boolean', default: 'false',
        helpText: 'Skip the readiness check and let Linkedcamp decide. Only useful if the check is wrong.' }),
    ],
    perform: write('campaign_launch', (i) => ({ campaignId: i.campaignId, skipPreflight: F.bool(i.skipPreflight) })),
  },
};

const createCampaign = {
  key: 'create_campaign',
  noun: 'Campaign',
  display: { label: 'Create Draft Campaign', description: 'Creates a drafted campaign. Nothing sends until it is launched.' },
  operation: {
    inputFields: [
      { key: 'title', label: 'Title', required: true },
      str('sourceUrl', 'Source URL', {
        helpText: 'Optional LinkedIn search, Sales Navigator, Recruiter, group, event or post URL.' }),
    ],
    perform: write('campaign_create', (i) => F.pick(i, ['title', 'sourceUrl'])),
  },
};

const addBlacklistEntry = {
  key: 'add_blacklist_entry',
  noun: 'Blacklist Entry',
  display: {
    label: 'Add Blacklist Entry',
    description: 'Excludes prospects by profile URL, company URL, keyword, job title or email.',
  },
  operation: {
    inputFields: [
      F.linkedAccountId(),
      { key: 'type', label: 'Type', required: true, choices: F.BLACKLIST_TYPES },
      { key: 'keyword', label: 'Value', required: true,
        helpText: 'A URL, an email, or a substring for KEYWORD / JOB_TITLE. Keep substrings specific.' },
    ],
    perform: write('blacklist_add', (i) => F.pick(i, ['linkedAccountId', 'type', 'keyword'])),
  },
};

const createTag = {
  key: 'create_tag',
  noun: 'Tag',
  display: { label: 'Create Tag', description: 'Creates a tag for classifying leads and replies.' },
  operation: {
    inputFields: [
      { key: 'content', label: 'Tag Label', required: true },
      { key: 'interest', label: 'Interest', required: true, choices: F.TAG_INTERESTS },
    ],
    perform: write('tag_create', (i) => F.pick(i, ['content', 'interest'])),
  },
};

const createTask = {
  key: 'create_task',
  noun: 'Task',
  display: { label: 'Create or Update Task', description: 'Creates an internal to-do, or updates one when a task ID is given.' },
  operation: {
    inputFields: [
      str('taskId', 'Existing Task', { helpText: 'Map a task to update it. Leave blank to create a new task.' }),
      { key: 'title', label: 'Title', required: true },
      str('content', 'Details', { type: 'text' }),
      F.leadId({ required: false }),
      F.conversationId({ required: false }),
      str('link', 'Link'),
      str('tag', 'Label'),
      str('date', 'Due Date', { type: 'datetime' }),
      str('isCompleted', 'Completed', { type: 'boolean' }),
    ],
    perform: write('task_upsert', (i) => ({
      ...F.pick(i, ['taskId', 'title', 'content', 'leadId', 'conversationId', 'link', 'tag', 'date']),
      isCompleted: F.bool(i.isCompleted),
    })),
  },
};

const createReminder = {
  key: 'create_reminder',
  noun: 'Reminder',
  display: { label: 'Create Reminder', description: 'Sets a follow-up reminder for you on a lead or conversation. Nothing is sent.' },
  operation: {
    inputFields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'remindAt', label: 'Remind At', type: 'datetime', required: true },
      str('description', 'Description', { type: 'text' }),
      F.leadId({ required: false }),
      F.conversationId({ required: false }),
      F.linkedAccountId({ required: false }),
    ],
    perform: write('reminder_create', (i) =>
      F.pick(i, ['title', 'remindAt', 'description', 'leadId', 'conversationId', 'linkedAccountId'])
    ),
  },
};

const creates = [
  addLeadToCampaign, updateLead, addNoteToLead, sendMessage, draftAiReply, updateConversation,
  pauseResumeCampaign, launchCampaign, createCampaign, addBlacklistEntry, createTag, createTask, createReminder,
];

module.exports = { creates };
