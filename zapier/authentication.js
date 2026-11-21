'use strict';

const { callTool } = require('./lib/mcp');

const test = (z) => callTool(z, 'whoami', {});

// Label: "<name> (<email>)" from whoami. Never the key.
const connectionLabel = (z, bundle) => {
  const me = bundle.inputData || {};
  const name = typeof me.name === 'string' ? me.name.trim() : '';
  const email = typeof me.email === 'string' ? me.email.trim() : '';
  if (name && email) return `${name} (${email})`;
  return name || email || 'Linkedcamp';
};

const authentication = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Find it in Linkedcamp under Settings → Integrations → API ([open](https://app.linkedcamp.com/settings/integrations?type=api)). Needs a Pro or Agency plan and the Integrations permission.',
    },
  ],
  test,
  connectionLabel,
};

// Add credentials only to the Linkedcamp host that expects them.
const addApiKey = (request, z, bundle) => {
  const key = bundle.authData && bundle.authData.api_key;
  if (!key || !request.url) return request;
  let host;
  try {
    host = new URL(request.url).hostname;
  } catch (err) {
    return request;
  }
  request.headers = request.headers || {};
  if (host === 'mcp.linkedcamp.com') request.headers['X-Api-Key'] = key;
  if (host === 'api.linkedcamp.com') request.headers.token = key;
  return request;
};

module.exports = { authentication, addApiKey };
