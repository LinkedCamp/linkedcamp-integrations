# Linkedcamp Make app: design

Status on 21 Nov 2026: the app is defined and passes local validation. It has **not** been uploaded to Make, run in a scenario, or called against the Linkedcamp API, because there is no test key yet. Output shapes are not captured, so every item marked `TODO(capture)` below is still open.

Sources: `../spec/tools.md` (§4, §5), `../spec/mcp-client.md` (§3), the live MCP input schemas (checked 21 Nov 2026), and the `make-custom-apps` skill (`.agents/skills/make-custom-apps/`).

## Layout

| Path | Make component |
| --- | --- |
| `base.imljson` | App Base |
| `groups.json` | Module groups |
| `connections/linkedcamp/{api,parameters}.imljson` | Connection (type `basic`: one API-key field) |
| `functions/<name>/{code.js,test.js}` | Custom IML functions and their editor tests |
| `rpcs/<name>/{api,parameters}.imljson` | Dynamic-option RPCs |
| `webhooks/<name>/{api,parameters,attach,detach}.imljson` | Dedicated attached webhooks, one per event |
| `modules/<name>/{api,parameters,expect,interface,samples}.imljson` | Modules |
| `app.manifest.json` | Labels, descriptions, type ids and bindings, read by the upload script. This is not a Make section |
| `scripts/generate.mjs` | **Single source of truth.** It writes all the files above. Edit it, then run `npm run generate` |
| `scripts/test-functions.mjs` | Local harness for the function tests |
| `scripts/upload.mjs` | SDK upload as a private app. Dry run by default; **never run live so far** |

Commands: `npm install`, `npm run generate`, `npm run validate` (the skill's editor-schema validator), `npm test` (function tests), `npm run upload:dry-run`.

## Transport decision

**Each MCP-backed module sends exactly one HTTP request:** `POST https://mcp.linkedcamp.com/mcp` with `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":…,"arguments":…}}`. There is no `initialize` and no `notifications/initialized`.

- **Headers (Base):** `x-api-key: {{connection.apiKey}}`, `accept: application/json, text/event-stream`, `mcp-protocol-version: 2025-06-18`. JSON content type comes from `type: json`.
- **The body is read as raw text** (`response.type: "text"` in Base). The custom function `parseMcp(body, id)` then finds the JSON-RPC message with the matching id in either:
  - a JSON body, or
  - an SSE body: `data:` lines, multi-line data, CRLF line endings, batches, and the `id: null` error message.

  JSON and SSE responses therefore go through the same code path.
- **Errors (Base):** `response.valid = mcpError(body, 1, statusCode) === ''`, and `response.error.message` uses the same function. It implements contract step 5:
  - 401 or -32001 → "Reconnect Linkedcamp: the API key was rejected." (type `InvalidAccessTokenError`)
  - 403 → the access-tier message
  - other JSON-RPC errors → `[code] message`
  - `result.isError` → the joined `content[].text`
  - anything without a matching message → a clear error

  429 and 5xx keep Make's default error types.
- **Output:** `mcpResult(body, 1)` implements contract step 6:
  1. `structuredContent`
  2. otherwise `JSON.parse(content[0].text)`
  3. otherwise `{text}`
- **Lists:** `mcpList(body, 1)` returns the array to iterate (see TODO(capture) 2).
- **REST calls** (webhook attach and detach, Make an API call) use absolute `https://api.linkedcamp.com` URLs with the header `token: {{connection.apiKey}}`. They override `response.type` (`json`), `valid` (`body.success === true`, because REST reports errors as HTTP 200 + `success:false`) and `error`.
- **Sanitization:** Base masks `request.headers.x-api-key` and `request.headers.token`. The connection and every REST request also mask the headers they send.
- **Connection check:** `tools/call whoami`. Connection communication does not inherit Base, and the docs don't say whether custom IML functions run there, so this check uses plain IML only. It requires a JSON body: an SSE answer fails the check with "Unexpected response", rather than passing without being checked.

Note: the REST requests inherit the Base headers. That means `x-api-key`, `accept` and `mcp-protocol-version` are also sent to `api.linkedcamp.com`. It is the same key and the same provider. If Linkedcamp objects, give those requests a whole-expression `headers` override.

### What changes if the server turns out to need sessions

The verified facts are that CORS exposes `mcp-session-id` and the server accepts that header. Whether a session is required is unknown. If `tools/call` without `initialize` is refused (expect a 400 or 404 JSON-RPC error that names the session), change `scripts/generate.mjs` as follows:

1. **`mcpRequest()` becomes a 3-request array:**
   1. `POST /mcp` `initialize` with `{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"linkedcamp-make","version":"1.0.0"}}`, `id: 0`, and `response.temp: { "sid": "{{headers.`mcp-session-id`}}", "pv": "{{parseMcp(body, 0).result.protocolVersion}}" }`. Response headers are readable in IML as `headers`.
   2. `POST /mcp` `{"jsonrpc":"2.0","method":"notifications/initialized"}` with headers `mcp-session-id: {{temp.sid}}` and `mcp-protocol-version: {{temp.pv}}`. Override `response.valid` to `{{statusCode < 300}}`, because this notification returns 202 with no JSON-RPC body.
   3. The current `tools/call`, plus the same two headers.

   Only the last request's output is the module output.
2. **Searches, polling triggers and RPCs** paginate on the last request. Make's pagination repeats only that request, so `temp.sid` must still be valid on page 2+. That holds if the session lives for the module run. Confirm it.
3. **The connection check** has to make the same calls, but a Basic connection allows only one request. The options are: ask Linkedcamp to allow `whoami` without a session, or move to an `other` connection type that allows several requests (to be verified in the Make docs).
4. **Optional:** add a final `DELETE /mcp` with the session header and `valid: {{true}}`.
5. **404 with a session** (contract: "re-initialize once and retry once") cannot be expressed in declarative IML. A module fails and Make's own retry handles it.

Each module would then cost 3 requests instead of 1.

## Make review rules applied (developers.make.com best practices, read 21 Nov 2026)

- **Labels are sentence case.** Triggers are "Watch new …": "Watch new replies", "Watch new appointments", "Watch new campaigns", "Watch new replied leads". Actions are "Add a lead to a campaign", "Create or update a task", and so on. The bulk module is "Bulk add leads to a campaign (advanced)". Searches with filters are "Search …". "Linkedcamp", "LinkedIn" and "AI" keep their capitals.
- **Descriptions are third person.** They use the Make templates ("Triggers when a new campaign is created.", "Creates a new …", "Returns information about a specific … by its ID.", "Returns a list of … filtered by …"). Where the §6 copy already fits that form, the §6 copy is kept, for example "Triggers when a prospect replies in a Linkedcamp campaign.". The universal module's description is Make's exact sentence.
- **Universal module path.** The user types a relative path only (validated `^/[^/]`), and the fixed prefix `https://api.linkedcamp.com` is put in front of it in the module. Base cannot provide that prefix, because Base points at the MCP host, and a module request cannot set its own `baseUrl` (that key is not in the editor schema). This is the "fixed prefix + relative input" form that the skill documents as compliant. Flagged as an open question in case a reviewer wants something else.
- **Limits.** Searches: optional, default 10. Polling triggers: required. RPCs: 60 for the 20-per-page campaign list, 500 for subaccounts and tools, and 300 for LinkedIn accounts (page size unknown). Page sizes are the maximums the tools allow: `lead_list` 100, `subaccount_list` 200.
- **Pagination and iterate** appear only in searches, polling triggers and RPCs, never in actions or gets.
- **Selectors.** Every RPC is bound to the same `linkedcamp` connection by the upload script. Every RPC-backed ID field uses `mode: "edit"`.
- **Errors.** `valid` handles 2xx bodies that carry an error: REST `success:false`, JSON-RPC `error` and `result.isError`.
- **Sanitization.** The exact header names `request.headers.x-api-key` and `request.headers.token` are masked.
- **Connection check.** A wrong key makes `whoami` return HTTP 401 with -32001 (verified without a key), so the connection fails.

## Custom IML functions

| Function | Used by | Purpose |
| --- | --- | --- |
| `parseMcp(body, id)` | the other functions, and `listTools` | JSON or SSE → JSON-RPC message |
| `mcpError(body, id, statusCode)` | Base `valid`/`error` | contract step 5 |
| `mcpResult(body, id)` | action and get modules, `callTool` | contract step 6 |
| `mcpList(body, id)` | searches, polling triggers, RPCs | the array to iterate |
| `recordId(item)` | polling-trigger dedupe, RPC option values | **the one place the id path lives** (`_id`, provisional) |
| `optionLabel(item, kind)` | RPC option labels | provisional label fields, falling back to the id |
| `pickWebhookId(createdId, hooks, url)` | webhook attach | the §5 GET-and-match fallback |

**Blocker:** Make documents that custom IML functions are "not available by default" and must be enabled through the Make helpdesk. All MCP modules depend on them, so ask Make to enable them for the account before uploading.

There are 32 local tests (`npm test`). They are local JavaScript tests: they are not proof of how the Make runtime behaves.

## Coverage matrix

Notes on the arguments:
- Arguments are passed under the exact MCP names. Empty optional fields are left out by Make (platform v2), and `false`/`0` are kept.
- `customFields` is a Make key/value array, sent as an object.
- `range` is a collection of `from`/`to` dates, sent as ISO 8601 (formatted dates on input).

### Instant triggers (type 10, attached webhooks)

Each webhook works like this:
- **Attach:** `POST /webhooks {title:"Make: <label>", callbackUrl:"{{webhook.url}}", event}`. If the response has `data._id`, that is the id. Otherwise attach runs `GET /webhooks` and takes the `_id` whose `callbackUrl` equals `webhook.url`. The id is saved as `externalHookId`. If no id is found, attach fails visibly.
- **Detach:** `DELETE /webhooks/{{webhook.externalHookId}}`.
- **Receiver:** `output: {{body}}`, passed through unchanged.

| Module | Webhook | Event |
| --- | --- | --- |
| watchNewReplies | hookReplyDetected | REPLY_DETECTED |
| watchConnectionsAccepted | hookAcceptsRequest | ACCEPTS_REQUEST |
| watchConnectionRequestsSent | hookConnectInvited | CONNECT_INVITED |
| watchEmailsSent | hookEmailSent | EMAIL_SENT |
| watchEmailOpens | hookOpened | OPENED |
| watchEmailLinkClicks | hookClicked | CLICKED |
| watchEmailBounces | hookBounced | BOUNCED |
| watchUnsubscribes | hookUnsubscribed | UNSUBSCRIBED |

### Polling triggers (type 1)

All three dedupe with `trigger.type: id` and `id = recordId(item)`. Each has a required static `limit` parameter (default 10, max 1000).

| Module | MCP tool | Fixed arguments | Order |
| --- | --- | --- | --- |
| watchAppointments | appointment_list | `status:"CONFIRMED"`, `page` | `unordered` (order undocumented) |
| watchCampaigns | campaign_list | `page` (20 per page, newest first) | `desc` |
| watchRepliedLeads | lead_list | `status:"REPLIED"`, `pageSize:100`, `range:{from: addDays(now,-1)}`, `page` | `unordered` |

`watchRepliedLeads` fires once per lead, because the dedupe is by lead id. A second reply from the same lead does not fire again. Use "Watch new replies" for every reply.

### Actions (type 4)

| Module | MCP tool | Arguments |
| --- | --- | --- |
| addLeadToCampaign | lead_add | campaignId* (listCampaigns), profileLink, email (one of the two), firstName, lastName, fullName, designation, location, phone, website, salesNavLink, recruiterLink, personalization, customFields |
| addLeadsToCampaign (bulk) | campaign_upload_leads | campaignId*, header* (column → field, the 11 targets), leads* (array, ≤5000), removeDuplicates (default true) |
| updateLead | lead_update | leadId*, email, firstName, lastName, designation, phone, website, personalization, paused, isExcluded, isInterested, seen, customFields |
| addNoteToLead | lead_note_add | leadId*, content* |
| sendMessage (**warning in description**) | message_send | conversationId*, content*, attachment{url*, name, type} (sent only when url is set) |
| draftAiReply | message_draft_ai_reply | conversationId*, provider* (OPENAI, ANTHROPIC, GEMINI, GROK, DEEPSEEK), prompt* |
| updateConversation | conversation_update | conversationId*, isArchived, seen, assistant, pauseBotOnManualMessage |
| pauseResumeCampaign | campaign_set_status | campaignId*, status* (PAUSED, ACTIVE) |
| launchCampaign (**warning in description**) | campaign_launch | campaignId*, skipPreflight (default false) |
| createDraftCampaign | campaign_create | title*, sourceUrl |
| addBlacklistEntry | blacklist_add | linkedAccountId* (listLinkedInAccounts), type* (PROFILE_URL, COMPANY_URL, KEYWORD, JOB_TITLE, EMAIL), keyword* |
| createTag | tag_create | content*, interest* (POSITIVE, NEGATIVE, NEUTRAL) |
| createUpdateTask | task_upsert | title*, taskId, content, leadId, conversationId, link, tag, date (date → ISO), isCompleted |
| createReminder | reminder_create | title*, remindAt* (date → ISO), description, leadId, conversationId, linkedAccountId |
| callTool | any tool | name* (listTools, editable), arguments* (JSON text → `parseJSON`) |
| getCampaign | campaign_get | campaignId*, includeFlow (default true) |
| getLead | lead_get | leadId*, includeActivities (default true), includeMessages (default false) |
| getCampaignStats | analytics_campaign | campaignId, range, includeGraph, userId (listClients) |
| getCampaignFunnel | analytics_campaign_funnel | campaignId*, range |

### Universal module (type 12)

| Module | Request |
| --- | --- |
| makeApiCall | Description, verbatim from Make's rule: "Sends a custom API call to Linkedcamp. You can use this to call endpoints that aren't covered by existing modules." Request: `https://api.linkedcamp.com{{url}}`. `url` must match `^/[^/]`, so the host cannot change. Inputs: method, headers (spread, then `token` injected last), query string and a raw body. Output is `{body, headers, statusCode}`. `success !== true` counts as an error |

### Searches (type 9)

All four take an optional `limit` (not required, default 10, max 1000, never advanced, always the last field) and page with `page = {{pagination.page}}`. The whole JSON-RPC body is restated on every page, so no argument is lost.

| Module | MCP tool | Arguments |
| --- | --- | --- |
| searchCampaigns | campaign_list | keyword, status (7), userId (listClients) |
| searchLeads | lead_list | keyword, campaignId, status (22), tags (array of tag ids), range; pageSize fixed at 100 |
| searchConversations | conversation_list | campaignId, keyword, platform, type, tags (comma-separated string), linkedAccountId, emailAccountId |
| searchAppointments | appointment_list | leadId, conversationId, status (5) |

No module calls `conversation_get`.

### RPCs

| RPC | Source | Paging and limit |
| --- | --- | --- |
| listCampaigns | campaign_list | page (20 per page), limit 60 (3× the page size) |
| listLinkedInAccounts | linkedin_account_list | none (the tool has no page argument; its page size is undocumented), limit 300 |
| listTools | MCP `tools/list` → `result.tools[].name` | `nextCursor` (MCP spec), limit 500 |
| listClients | subaccount_list | page, pageSize 200 (the maximum), limit 500. Owner keys only. The field is optional, and the help text says it stays empty for other keys |

## Open TODO(capture) list

Fill these from `spec/captures/` once `scripts/bootstrap.mjs` has run with a test key. Each fix goes in `scripts/generate.mjs` or the named function.

1. **Transport:** does `tools/call` work without `initialize`? JSON or SSE? Is `mcp-session-id` issued? See "What changes if the server turns out to need sessions" above.
2. **List shapes** (`mcpList`): campaign_list, lead_list, conversation_list, appointment_list, linkedin_account_list and subaccount_list. Today the function takes the result array, or the only array-valued property. Any other shape throws. Replace this with exact paths per tool, and add a stop condition if the tools report totals.
3. **Record id** (`recordId`): the provisional choice is `_id`, from the REST webhook list and the Mongo-style backend. Confirm it for appointments, campaigns and leads.
4. **Polling order:** check the real order of appointment_list and lead_list. If either is newest-first, switch to `desc`. Also check that a page past the end returns an empty list (pagination stops on an empty page).
5. **Interfaces and samples:** every MCP module and instant trigger has `interface: []` and `samples: {}` today. Add the captured fields, with date fields typed `date` and parsed with `parseDate` (formatted dates on output). The only interface that exists today is the universal module's documented `{body, headers, statusCode}`.
6. **Webhook payloads:** for each of the 8 events, the payload, a stable event id, and any signing header. The receiver passes the body through until these are known. No verification is implemented, because none is documented.
7. **Webhook attach:** does `POST /webhooks` return `data._id`? Is `GET /webhooks` wrapped in `success: true`? Does `DELETE` return `success: true`? Detach treats anything else as an error.
8. **Connection label:** the whoami path. Today it uses `body.result.structuredContent.email`, and the label stays empty if that is absent. Spec §4.1 wants `<name> (<email>)`.
9. **RPC labels** (`optionLabel`): campaign `title`, and account/client `name` + `email`. These are inferred from tool inputs and descriptions. Confirm them.
10. **Epochs:** polling triggers have no epoch (choose-where-to-start), because no date field is known yet. Add one after capture.
11. **watchRepliedLeads:** confirm which date the `range` filters on for leads.

## Not done here

- The logo (`assets/logo-make-mono-512.png`, handled separately).
- Upload, RPC tests and scenario runs. These need `MAKE_API_KEY`, a Linkedcamp test key and approval.
