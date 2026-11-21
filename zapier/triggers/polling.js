'use strict';

const { callTool } = require('../lib/mcp');
const { listWithIds, toList, pickId } = require('../lib/hydrate');

const DAY_MS = 24 * 60 * 60 * 1000;

const newAppointment = {
  key: 'new_appointment',
  noun: 'Appointment',
  display: {
    label: 'New Appointment',
    description: 'Triggers when a meeting is booked from a conversation.',
  },
  operation: {
    perform: async (z) =>
      listWithIds(await callTool(z, 'appointment_list', { status: 'CONFIRMED', page: 1 }), 'appointment_list'),
  },
};

const newCampaign = {
  key: 'new_campaign',
  noun: 'Campaign',
  display: { label: 'New Campaign', description: 'Triggers when a campaign is created.' },
  operation: {
    // campaign_list is newest first, 20 per page. Also powers the campaign dropdown.
    perform: async (z, bundle) => {
      const page = bundle.meta && bundle.meta.isFillingDynamicDropdown ? (bundle.meta.page || 0) + 1 : 1;
      return listWithIds(await callTool(z, 'campaign_list', { page }), 'campaign_list');
    },
    canPaginate: true,
  },
};

const newRepliedLead = {
  key: 'new_replied_lead',
  noun: 'Lead',
  display: {
    label: 'New Replied Lead (Polling)',
    description:
      'Triggers when a lead moves to Replied. Checks on a schedule; use New Reply for instant replies.',
  },
  operation: {
    perform: async (z) =>
      listWithIds(
        await callTool(z, 'lead_list', {
          status: 'REPLIED',
          pageSize: 100,
          range: { from: Date.now() - DAY_MS },
        }),
        'lead_list'
      ),
  },
};

// Hidden dropdown sources.
const labelFrom = (item, keys) => {
  for (const k of keys) if (item && typeof item[k] === 'string' && item[k].trim()) return item[k].trim();
  return undefined;
};

const leadChoices = {
  key: 'lead_choices',
  noun: 'Lead',
  display: { label: 'Leads', description: 'Lists recent leads.', hidden: true },
  operation: {
    perform: async (z, bundle) => {
      const page = (bundle.meta && bundle.meta.page ? bundle.meta.page : 0) + 1;
      const out = await callTool(z, 'lead_list', { page, pageSize: 100 });
      return toList(out, 'lead_list').map((l) => {
        const id = pickId(l, 'lead_list');
        return { id, label: labelFrom(l, ['fullName', 'email']) || id };
      });
    },
    canPaginate: true,
  },
};

const conversationChoices = {
  key: 'conversation_choices',
  noun: 'Conversation',
  display: { label: 'Conversations', description: 'Lists recent conversations.', hidden: true },
  operation: {
    perform: async (z, bundle) => {
      const page = (bundle.meta && bundle.meta.page ? bundle.meta.page : 0) + 1;
      const out = await callTool(z, 'conversation_list', { page });
      return toList(out, 'conversation_list').map((c) => ({ id: pickId(c, 'conversation_list'), label: pickId(c, 'conversation_list') }));
    },
    canPaginate: true,
  },
};

const tagChoices = {
  key: 'tag_choices',
  noun: 'Tag',
  display: { label: 'Tags', description: 'Lists tags.', hidden: true },
  operation: {
    perform: async (z) => {
      const out = await callTool(z, 'tag_list', {});
      return toList(out, 'tag_list').map((t) => {
        const id = pickId(t, 'tag_list');
        return { id, label: labelFrom(t, ['content']) || id };
      });
    },
  },
};

const linkedinAccountChoices = {
  key: 'linkedin_account_choices',
  noun: 'LinkedIn Account',
  display: { label: 'LinkedIn Accounts', description: 'Lists connected LinkedIn accounts.', hidden: true },
  operation: {
    perform: async (z) => {
      const out = await callTool(z, 'linkedin_account_list', {});
      return toList(out, 'linkedin_account_list').map((a) => {
        const id = pickId(a, 'linkedin_account_list');
        return { id, label: labelFrom(a, ['name', 'email']) || id };
      });
    },
  },
};

const clientChoices = {
  key: 'client_choices',
  noun: 'Client',
  display: { label: 'Clients', description: 'Lists agency client sub-accounts.', hidden: true },
  operation: {
    perform: async (z, bundle) => {
      const page = (bundle.meta && bundle.meta.page ? bundle.meta.page : 0) + 1;
      let out;
      try {
        out = await callTool(z, 'subaccount_list', { page, pageSize: 50 });
      } catch (err) {
        // Owner keys only: any other key gets an empty list instead of an error.
        if (err && err.name === 'RefreshAuthError') throw err;
        return [];
      }
      return toList(out, 'subaccount_list').map((c) => {
        const id = pickId(c, 'subaccount_list');
        const name = labelFrom(c, ['name']);
        const email = labelFrom(c, ['email']);
        return { id, label: name && email ? `${name} (${email})` : name || email || id };
      });
    },
    canPaginate: true,
  },
};

module.exports = {
  newAppointment, newCampaign, newRepliedLead, leadChoices, conversationChoices, tagChoices,
  linkedinAccountChoices, clientChoices,
};
