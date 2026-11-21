'use strict';

const { authentication, addApiKey } = require('./authentication');
const polling = require('./triggers/polling');
const { hooks } = require('./triggers/hooks');
const { creates } = require('./creates');
const { searches } = require('./searches');

const fs = require('fs');
const path = require('path');

// Static samples come only from real, anonymised captures: scripts/bootstrap.mjs
// writes samples/<key>.json. Nothing is attached until a capture exists.
const withSample = (def) => {
  const file = path.join(__dirname, 'samples', `${def.key}.json`);
  if (!fs.existsSync(file)) return def;
  const sample = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...def, operation: { ...def.operation, sample } };
};

const byKey = (list) => Object.fromEntries(list.map((x) => [x.key, withSample(x)]));

const triggers = [
  ...hooks,
  polling.newAppointment,
  polling.newCampaign,
  polling.newRepliedLead,
  polling.leadChoices,
  polling.conversationChoices,
  polling.tagChoices,
  polling.linkedinAccountChoices,
  polling.clientChoices,
];

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  beforeRequest: [addApiKey],
  // lib/mcp.js drops blank values itself, so platform input cleaning is off (D028).
  flags: { cleanInputData: false },
  triggers: byKey(triggers),
  creates: byKey(creates),
  searches: byKey(searches),
  searchOrCreates: {
    find_lead: {
      key: 'find_lead',
      display: {
        label: 'Find or Add Lead',
        description: 'Finds a lead by name, email or company, and adds it to a campaign if it is not found.',
      },
      search: 'find_lead',
      create: 'add_lead_to_campaign',
    },
  },
};
