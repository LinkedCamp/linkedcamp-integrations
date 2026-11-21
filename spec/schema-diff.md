# §4 vs live MCP input schemas

Checked on 21 Nov 2026 against the live Linkedcamp MCP tool definitions, which
were read through an authenticated MCP client. Only the input schemas were read;
no tool was called. `scripts/bootstrap.mjs` repeats this diff against `tools/list`
for the test key and writes `spec/captures/schema-diff-live.md`.

**Result:** every tool name and argument used in §4 exists, with the documented
names, required flags and enums. Details §4 doesn't spell out:

| Tool | Detail from the live schema | Used in the apps |
|---|---|---|
| `lead_list` | `status` enum has 22 values: FOUND, VIEWED, CONNECT_SENT, CONNECTED, FOLLOWUP, MESSAGE_SENT, INMAILS, INMAIL_SENT, REPLIED, WITHDRAWN, INMAIL_CREDIT, FOLLOWED, EMAIL_SENT, OPENED, BOUNCED, CLICKED, UNSUBSCRIBED, FAILED, INVITED, COMPLETED, NOT_QUALIFIED, OUT_OF_OFFICE | status dropdowns |
| `lead_list` | `pageSize` default 25, max 100; `tags` is an **array** of tag ids | Find Lead |
| `lead_list`, `analytics_*` | `range` = `{from, to}` (aliases `startDate`, `endDate`), each epoch ms or ISO 8601 | From/To fields |
| `conversation_list` | `tags` is a **comma-separated string** | Find Conversation |
| `lead_add` | `email` has `format: email`; `customFields` is `{type: object, additionalProperties: false}` with no declared properties | see QUESTIONS.md Q10 |
| `lead_update` | `customFields` is declared the same way | see QUESTIONS.md Q10 |
| `campaign_upload_leads` | `leads` maxItems 5000 | Make bulk module |
| `linkedin_account_list` | also accepts `keyword`, `status` (free text, e.g. "active"), `userId` | dropdown sends no filter |
| `campaign_get` | `includeFlow` default true | Get Campaign |
| `lead_get` | `includeActivities` default true, `includeMessages` default false | Get Lead |
| `campaign_launch` | `skipPreflight` default false | Launch Campaign |
| `subaccount_list` | `pageSize` default 50, max 200 | client dropdown |
