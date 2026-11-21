# Linkedcamp tools and webhooks: single source of truth

Copied from the build brief (sections 4 and 5, docs re-read 19 Nov 2026). Input schemas were cross-checked on 21 Nov 2026 against the live MCP tool definitions; see `spec/schema-diff.md`.

## 4. Triggers, actions and searches: exact MCP tools and arguments
Source: `https://docs.linkedcamp.com/mcp/tools/<section>` (section in the last column). `*` = required. Enum values are quoted from the docs. Get the 22 lead statuses from `reference` (§7.1). Output fields aren't documented, so map them from `spec/captures/`.

### 4.1 Connection (both platforms)
- **One field:** "API Key", a password field. Help text: "Find it in Linkedcamp under Settings → Integrations → API."
- **Test:** MCP `whoami` (name, email, role, plan, entitlements; for a team-member key it reports the owner). ([core](https://docs.linkedcamp.com/mcp/tools/core))
- **Label:** `<name> (<email>)` from the captured `whoami` output. Never the key.

### 4.2 Polling triggers (MCP)
| Zapier key / Make module | MCP call | Dedupe |
|---|---|---|
| `new_appointment` / Watch Appointments | `appointment_list` `{status:"CONFIRMED", page:1}`. Status enum: CONFIRMED, CANCELLED, RESCHEDULED, NO_SHOW, COMPLETED. ([crm](https://docs.linkedcamp.com/mcp/tools/crm)) | appointment id (from capture) |
| `new_campaign` / Watch Campaigns | `campaign_list` `{page:1}`, newest first, 20 per page. ([campaigns](https://docs.linkedcamp.com/mcp/tools/campaigns)) | campaign id |
| `new_replied_lead` / Watch Replied Leads (fallback) | `lead_list` `{status:"REPLIED", pageSize:100, range:{from:<now-24h>}}` ([leads](https://docs.linkedcamp.com/mcp/tools/leads)) | lead id |

- Never use `conversation_get` in a trigger, because it marks threads as read.

### 4.3 Instant triggers (REST webhooks; see §5)
| Trigger (Zapier "New …" / Make "Watch …") | Event |
|---|---|
| New Reply / Watch New Replies | `REPLY_DETECTED` |
| New Connection Accepted / Watch Connections Accepted | `ACCEPTS_REQUEST` |
| New Connection Request Sent / Watch Connection Requests Sent | `CONNECT_INVITED` |
| New Email Sent / Watch Emails Sent | `EMAIL_SENT` |
| New Email Open / Watch Email Opens | `OPENED` |
| New Email Link Click / Watch Email Link Clicks | `CLICKED` |
| New Email Bounce / Watch Email Bounces | `BOUNCED` |
| New Unsubscribe / Watch Unsubscribes | `UNSUBSCRIBED` |

### 4.4 Actions
| Action (Zapier key / Make label) | MCP tool | Arguments | Doc |
|---|---|---|---|
| `add_lead_to_campaign` / Add a Lead to a Campaign | `lead_add` | `campaignId`* (dynamic dropdown); `profileLink` **or** `email` (one required); `firstName`, `lastName`, `fullName`, `designation` (Job Title), `location`, `phone`, `website`, `salesNavLink`, `recruiterLink`, `personalization`, `customFields` (dict) | leads |
| Make only: Add Leads to a Campaign (bulk) | `campaign_upload_leads` | `campaignId`*, `header`* (column → profileUrl, salesNavUrl, recruiterUrl, email, firstName, lastName, fullName, personalization, phone, website or customVariable), `leads`* (array), `removeDuplicates` (default true) | campaigns |
| `update_lead` / Update a Lead | `lead_update` | `leadId`* (from Find Lead), `email`, `firstName`, `lastName`, `designation`, `phone`, `website`, `personalization`, `paused`, `isExcluded`, `isInterested`, `seen`, `customFields` | leads |
| `add_note_to_lead` / Add a Note to a Lead | `lead_note_add` | `leadId`*, `content`* (internal; never sent) | leads |
| `send_message` / Send a Message | `message_send` | `conversationId`*, `content`*, `attachment{url*, name, type}`. **Delivers immediately to a real person on LinkedIn or email; cannot be recalled.** | inbox |
| `draft_ai_reply` / Draft an AI Reply | `message_draft_ai_reply` | `conversationId`*, `provider`* (OPENAI, ANTHROPIC, GEMINI, GROK, DEEPSEEK), `prompt`*. Sends nothing. | inbox |
| `update_conversation` / Update a Conversation | `conversation_update` | `conversationId`*, `isArchived`, `seen`, `assistant` (false = hand to a human), `pauseBotOnManualMessage` | inbox |
| `pause_resume_campaign` / Pause or Resume a Campaign | `campaign_set_status` | `campaignId`*, `status`* PAUSED or ACTIVE (ACTIVE only from PAUSED; it never archives, completes or deletes) | campaigns |
| `launch_campaign` / Launch a Campaign | `campaign_launch` | `campaignId`*, `skipPreflight`. **Starts real outreach.** | campaigns |
| `create_campaign` / Create a Draft Campaign | `campaign_create` | `title`*, `sourceUrl` | campaigns |
| `add_blacklist_entry` / Add a Blacklist Entry | `blacklist_add` | `linkedAccountId`* (dropdown from `linkedin_account_list`), `type`* (PROFILE_URL, COMPANY_URL, KEYWORD, JOB_TITLE, EMAIL), `keyword`* (value) | library |
| `create_tag` / Create a Tag | `tag_create` | `content`*, `interest`* (POSITIVE, NEGATIVE, NEUTRAL) | library |
| `create_task` / Create or Update a Task | `task_upsert` | `taskId` (omit to create), `title`*, `content`, `leadId`, `conversationId`, `link`, `tag`, `date`, `isCompleted` | crm |
| `create_reminder` / Create a Reminder | `reminder_create` | `title`*, `remindAt`* (epoch ms or ISO 8601), `description`, `leadId`, `conversationId`, `linkedAccountId` | crm |
| Make only: Call a Linkedcamp Tool | any tool | `name` (dropdown from `tools/list`), `arguments` (JSON) | — |
| Make only: Make an API Call (universal, mandatory) | REST | URL path (relative to `https://api.linkedcamp.com`), method, query, body; header `token` injected | [REST intro](https://docs.linkedcamp.com/introduction) |

### 4.5 Searches
| Search | MCP tool | Arguments | Doc |
|---|---|---|---|
| `find_campaign` / Search Campaigns | `campaign_list` | `keyword` (title), `status` (ACTIVE, PAUSED, FAILED, DELETED, COMPLETED, ARCHIVED, DRAFTED), `page`; `userId` for agency owners | campaigns |
| `get_campaign` / Get a Campaign | `campaign_get` | `campaignId`*, `includeFlow` | campaigns |
| `find_lead` / Search Leads | `lead_list` | `keyword` (name, email or company), `campaignId` (omit = all), `status`, `tags`, `range{from,to}`, `page`, `pageSize` 1–100 | leads |
| `get_lead` / Get a Lead | `lead_get` | `leadId`*, `includeActivities`, `includeMessages` | leads |
| `get_campaign_stats` / Get Campaign Stats | `analytics_campaign` | `campaignId`, `range{from,to}`, `includeGraph`, `userId` | analytics |
| Make: Get a Campaign Funnel | `analytics_campaign_funnel` | `campaignId`*, `range` | analytics |
| `find_conversation` / Search Conversations | `conversation_list` | `campaignId`, `keyword`, `platform`, `type`, `tags`, `linkedAccountId`, `emailAccountId`, `page` | inbox |
| `find_appointment` / Search Appointments | `appointment_list` | `leadId`, `conversationId`, `status`, `page` | crm |

- **Zapier:** pair `find_lead` with "create if not found" → `add_lead_to_campaign`.
- **Make:** every search, list trigger and RPC takes a `limit`, and pages with `page`/`pageSize`.
- **Dropdowns / RPCs:**

| Dropdown or RPC | Source |
|---|---|
| Campaigns | `campaign_list` |
| LinkedIn Accounts | `linkedin_account_list` |
| Tools | `tools/list` |
| Clients (agency owners only) | `subaccount_list` (`keyword`, `page`, `pageSize` default 50, max 200). Owner keys only, so hide the field when it errors. It fills `userId` on `campaign_list`, `analytics_campaign` and `tag_list`. ([agencies](https://docs.linkedcamp.com/mcp/agencies), [subaccounts](https://docs.linkedcamp.com/mcp/tools/subaccounts)) |

## 5. REST webhooks (instant triggers)
- Base `https://api.linkedcamp.com`, header **`token: <same API key>`**, `Content-Type: application/json`. ([authentication](https://docs.linkedcamp.com/authentication)) Throw on `success !== true`.

| Endpoint | Request | Documented response |
|---|---|---|
| [Create webhook](https://docs.linkedcamp.com/api-reference/webhooks/create-webhook) | `POST /webhooks` `{"title","callbackUrl","event"}` (one event) | 200 `{"success":true,"message":"Webhook added successfully!"}`, **no id**; 400 `{"success":false,"message":"Invalid event!"}` |
| [List webhooks](https://docs.linkedcamp.com/api-reference/webhooks/list-webhooks) | `GET /webhooks` | `data[]{_id, callbackUrl, title, events[], isValid}` |
| [Delete webhook](https://docs.linkedcamp.com/api-reference/webhooks/delete-webhook) | `DELETE /webhooks/{webhookId}` | message |

- **Subscribe:** POST, then `data._id` if present, else `GET /webhooks` and take the `_id` whose `callbackUrl` equals the URL you registered.
- **Payload schema and signing are not documented.** Pass the body through unchanged, and build samples from captured payloads only.
- Never call `GET /users/{userId}`, `GET /tokens` or `POST /users/cancel`.

### 5.1 Zapier specifics
- `authentication.js`:
  - `type: 'custom'`, field `api_key` (password).
  - `test` = `callTool('whoami')`.
  - `connectionLabel` from whoami name and email.
- `beforeRequest`: add `X-Api-Key` **only** for `mcp.linkedcamp.com`, and `token` **only** for `api.linkedcamp.com`.
- `lib/mcp.js` uses `z.request` with `skipThrowForStatus: true` and parses the raw text. Map -32001/401 to `z.errors.RefreshAuthError` and the rest to `z.errors.Error`. ([API key auth](https://docs.zapier.com/integrations/build/apikeyauth))
- **Hook triggers** ([REST hooks in CLI](https://docs.zapier.com/integrations/build/cli-hook-trigger)):
  - `performSubscribe` POSTs `{title:"Zapier – <Trigger>", callbackUrl: bundle.targetUrl, event}` and returns `{id}`.
  - `performUnsubscribe` DELETEs `bundle.subscribeData.id`.
  - `perform` returns `[ {...bundle.cleanedRequest, id: <stable id or hash>} ]`.
  - `performList`:
    - New Reply: MCP `lead_list` `{status:"REPLIED"}`
    - Connection Accepted: `{status:"CONNECTED"}`
    - Other events: the captured payload fixture
  - Zap-editor testing calls only `performList`.
- **Polling triggers** return `{id, ...}`. `new_campaign` also powers the hidden campaign dropdown.
- **Branding** goes in `package.json` per [branding in CLI](https://docs.zapier.com/integrations/publish/branding-cli).

### 5.2 Make specifics
- **Base:**
  - `baseUrl: https://mcp.linkedcamp.com`, header `X-Api-Key: {{connection.apiKey}}`.
  - Sanitize the `x-api-key` and `token` headers.
  - Errors: `body.error.message`, or `body.result.isError` → the content text.
- **Connection:** API key, password type. Validate with `tools/call whoami`. Metadata = email.
- **Module communication:**
  - Each module runs up to 3 requests (initialize → `notifications/initialized` → `tools/call`). Modules may run "a request (or several)". ([action module](https://developers.make.com/custom-apps-documentation/app-components/modules/action))
  - Before building, run the bootstrap (§7.1) and record in `DESIGN.md`:
    - whether the server returns `mcp-session-id`
    - whether `tools/call` works without `initialize`
    - whether responses are JSON or SSE
  - If it's stateless and JSON, each module is a single `tools/call` POST. If it needs sessions, carry the header between requests, checking in the Make docs/skill how IML reads response headers. If it's SSE, add the custom IML function `parseMcp`.
- **Instant triggers** use dedicated **attached** webhooks, one per event. ([attached webhooks](https://developers.make.com/custom-apps-documentation/app-components/webhooks/dedicated/attached), [instant trigger](https://developers.make.com/custom-apps-documentation/app-components/modules/instant-trigger))
  - **Attach:** POST `https://api.linkedcamp.com/webhooks` with header `token` and `callbackUrl: "{{webhook.url}}"`, then store `externalHookId`.
  - **Detach:** DELETE `/webhooks/{{webhook.externalHookId}}`.
  - These requests set their own full URL and headers.
- **Universal module "Make an API Call"** (REST, `token` injected) is **mandatory**. ([universal module](https://developers.make.com/custom-apps-documentation/app-components/modules/universal-module))
- **RPCs:** `listCampaigns`, `listLinkedInAccounts`, `listTools`, `listClients`.
- **Interfaces** come from captures. Dates are formatted. Searches, triggers and RPCs have `limit` and pagination.

