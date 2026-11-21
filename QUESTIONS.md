# Open questions

These are gaps the docs don't answer. Each one says what the code does in the meantime. Items marked **(capture)** are settled by running `node scripts/bootstrap.mjs` with the test key; the rest need an answer from Linkedcamp.

## From the build brief (§11)
1. **Response format and sessions (capture).** Does `tools/call` return JSON or SSE? Is `Mcp-Session-Id` issued, and for how long? Does `tools/call` work without `initialize`?
   - Now: Zapier always runs the full handshake and parses both JSON and SSE. Make: see `make/DESIGN.md`.
   - Known so far: unauthenticated calls return `application/json`, and CORS exposes `mcp-session-id`.
2. **Output shapes.** No `outputSchema` or `structuredContent` is documented. Could the server add `outputSchema` for the §4 tools?
   - Now: `zapier/lib/output-map.json` holds the list property and id field for each list tool. The bootstrap fills it from captures.
   - Until then the fallback is: the output itself or its only array property; id = `_id`, then `id`, then a content hash.
   - Static samples (Zapier D012) and Make interfaces wait on captures.
3. **Webhooks.** We need:
   - the payload for each of the 8 events
   - the signing header, if there is one
   - whether `POST /webhooks` can return `data._id`
   - Now: subscribe uses `data._id` if present, else `GET /webhooks` matched by `callbackUrl`. Payloads pass through unchanged.
4. **Rate limits** per key, on MCP and on REST. Now: no client-side throttling, and no automatic retries except one session re-init for reads.
5. **Agency webhooks.** Do an owner key's webhooks fire for client sub-accounts?
6. **Reply tags.** `lead_update` says reply tags change via `conversation_update`, but the live `conversation_update` schema has no tag argument (only `isArchived`, `seen`, `assistant`, `pauseBotOnManualMessage`). Which tool sets them? Now: no tag action is offered.
7. **Brand hex** (`#2CC5F4`?) and Make's "URL to the service" (homepage or `/integrations/make`).
8. **Make verified MCP list.** Is it OK to ask Make to add `https://mcp.linkedcamp.com/mcp` to the MCP Client's verified servers?
9. **Test accounts.**
   - The Zapier test account (`integration-testing@zapier.com`, non-expiring, paid features).
   - A **test sub-account API key** for development. Nothing was captured yet because none was available.

## Found while building (21 Nov 2026)
10. **`customFields` schema.** `lead_add.customFields` and `lead_update.customFields` are declared `{type: "object", additionalProperties: false}` with no `properties`. A strict validator would reject every key, including the documented `{ "recentPost": "..." }`. Is that intended? It should probably be `additionalProperties: {type: "string"}`. Now: the apps send the dict as entered.
11. **Webhook event id.** The payload is undocumented, so Zapier dedupes instant triggers by hashing the whole body. If a redelivery has a different timestamp it will trigger twice. Is there a stable event id field?
12. **`lead_list` `range` semantics.** Which date does `range.from` filter on: created, status change, or last activity? New Replied Lead (polling) assumes the window catches leads that changed to REPLIED in the last 24 h.
13. **`appointment_list` order.** Is it newest first? New Appointment polls only page 1, with CONFIRMED.
14. **`whoami` field paths (capture).** The connection label reads top-level `name` and `email`, because the tool description lists them. Confirm they aren't nested.
15. **Campaign dropdown label (capture).** The Zapier dropdown uses `new_campaign.id.title`, assuming a list item has `title` (the field `campaign_create` takes). Confirm.
16. **Logos.** `/workspace/linkedcamp/seo/backlinks/assets/` (from §8) doesn't exist on this machine. `logo-square-512.png`, `logo-wide-1200.png` and `screenshot-mcp.png` are needed in `assets/`, and then `logo-make-mono-512.png` can be generated.
17. **REST auth error text.** Without a token, REST returns HTTP 200 `{"success":false,"message":"Token is required!"}`. What does it return for a wrong or revoked token? Now: any `success:false` message that mentions the token and required/invalid/expired is mapped to "reconnect".

## From the Make build
18. **Custom IML functions must be enabled by Make.** Make says custom IML functions are "not available by default" and are enabled through the Make helpdesk. Every MCP module uses them: `parseMcp`, `mcpResult`, `mcpError`, `mcpList`, `recordId`, `optionLabel` and `pickWebhookId`. Request enablement for the app before the private upload. This is the biggest Make blocker.
19. **Basic connection check and sessions.** The Basic connection check allows only one request. If `tools/call` needs a session, `whoami` must work without `initialize`, or the connection check won't work. Each module would also become 3 requests (see `make/DESIGN.md`).
20. **List paging (capture).** Do list tools report totals? Does a page past the end return an empty list? Make pagination stops on an empty page.
21. **REST success wrapper.** Are `GET /webhooks` and `DELETE /webhooks/{id}` wrapped in `success: true`, like create is? The Make and Zapier error checks assume yes.
22. **Inherited header on REST calls.** Make's base adds `x-api-key` to every request, so REST calls to `api.linkedcamp.com` carry it next to `token`. Both hold the same key and go to the same provider. Is that acceptable, or should REST calls strip it?
23. **Universal module URL.** The base points at the MCP host, so "Make an API call" uses a fixed `https://api.linkedcamp.com` prefix plus the user's relative path. That should satisfy Make's relative-path rule. Confirm with the reviewer if they ask.
24. **Make upload values.** The app `audience` value and the dedicated-webhook `type` value aren't listed in Make's API docs. `make/scripts/upload.mjs` requires both as flags and never defaults them.
25. **Capture source.** An already-connected Linkedcamp MCP client could read real output shapes. Can it be used for captures on a named test sub-account, or should captures only use `LINKEDCAMP_TEST_API_KEY`?
