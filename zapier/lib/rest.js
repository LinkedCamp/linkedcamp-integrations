'use strict';

// Linkedcamp REST API (webhooks only). Base https://api.linkedcamp.com,
// header `token` is added by beforeRequest for api.linkedcamp.com only.
// REST reports errors as HTTP 200 with "success": false, so every response
// is checked for success === true.

const REST_BASE = 'https://api.linkedcamp.com';

const restRequest = async (z, method, path, body) => {
  const response = await z.request({
    url: `${REST_BASE}${path}`,
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    skipThrowForStatus: true,
    timeout: 60000,
  });
  let data;
  try {
    data = JSON.parse(response.content);
  } catch (err) {
    data = undefined;
  }
  if (response.status === 401) {
    throw new z.errors.RefreshAuthError('Reconnect Linkedcamp: the API key was rejected');
  }
  if (!data || data.success !== true) {
    const message = (data && data.message) || `HTTP ${response.status}`;
    if (/token/i.test(message) && /(required|invalid|expired)/i.test(message)) {
      throw new z.errors.RefreshAuthError(`Reconnect Linkedcamp: ${message}`);
    }
    throw new z.errors.Error(`Linkedcamp API error: ${message}`, 'RestError', response.status);
  }
  return data;
};

const createWebhook = async (z, { title, callbackUrl, event }) => {
  const created = await restRequest(z, 'POST', '/webhooks', { title, callbackUrl, event });
  // The documented create response has no id; prefer data._id if it ever appears,
  // else look the hook up by the callback URL we registered.
  if (created.data && created.data._id) return { id: created.data._id };
  const listed = await restRequest(z, 'GET', '/webhooks');
  const hooks = Array.isArray(listed.data) ? listed.data : [];
  const match = hooks.filter((h) => h && h.callbackUrl === callbackUrl).pop();
  if (!match || !match._id) {
    throw new z.errors.Error(
      'Linkedcamp created the webhook but it could not be found in the webhook list',
      'WebhookNotFound'
    );
  }
  return { id: match._id };
};

const deleteWebhook = (z, webhookId) =>
  restRequest(z, 'DELETE', `/webhooks/${encodeURIComponent(webhookId)}`);

module.exports = { REST_BASE, restRequest, createWebhook, deleteWebhook };
