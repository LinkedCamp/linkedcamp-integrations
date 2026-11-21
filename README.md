# Linkedcamp integrations for Zapier and Make

Linkedcamp is agentic LinkedIn and email outreach for lead generation agencies. Each client runs as its own sub-account, and every LinkedIn account gets a country-matched dedicated IP, free on every plan. Use this integration to:
- add leads to campaigns from any form, CRM or enrichment tool
- react instantly when a prospect accepts a connection or replies
- write enrichment data back to leads
- log notes and tasks
- pause, resume or launch campaigns

Actions run on the Linkedcamp MCP server, so the same API key also works in AI assistants. Plans start from $79/mo with a 14-day trial.

- Website: https://www.linkedcamp.com
- MCP docs: https://docs.linkedcamp.com/mcp/overview
- Support: support@linkedcamp.com

| Folder | What it is |
|---|---|
| `zapier/` | Zapier Platform CLI integration (Node 22) |
| `make/` | Make custom app (built with the official `make-custom-apps` skill) |
| `spec/` | Tool contract (`tools.md`), MCP client contract (`mcp-client.md`), live schema diff, and anonymised captures |
| `scripts/` | `bootstrap.mjs` (read-only capture) and `webhook-cycle.mjs` (webhook lifecycle check) |
| `assets/` | Logos |

## Connect
1. In Linkedcamp, go to **Settings → Integrations → API** (`https://app.linkedcamp.com/settings/integrations?type=api`) and copy your API key. API keys need a Pro or Agency plan and the Integrations permission.
2. In Zapier or Make, add a Linkedcamp connection and paste the key.
3. The connection is checked with `whoami` and labelled with your name and email.

## How it works
- **Actions, searches and polling triggers** call the Linkedcamp MCP server at `https://mcp.linkedcamp.com/mcp`. The transport is Streamable HTTP with JSON-RPC `tools/call`, and requests carry the `X-Api-Key` header. See `spec/mcp-client.md`.
- **Instant triggers** use Linkedcamp REST webhooks (`https://api.linkedcamp.com/webhooks`, header `token`). Each trigger subscribes to one event.

## Triggers
| Trigger | Type | Source |
|---|---|---|
| New Reply | instant | webhook `REPLY_DETECTED` |
| New Connection Accepted | instant | webhook `ACCEPTS_REQUEST` |
| New Connection Request Sent | instant | webhook `CONNECT_INVITED` |
| New Email Sent / Open / Link Click / Bounce | instant | webhooks `EMAIL_SENT`, `OPENED`, `CLICKED`, `BOUNCED` |
| New Unsubscribe | instant | webhook `UNSUBSCRIBED` |
| New Appointment | polling | `appointment_list` (CONFIRMED) |
| New Campaign | polling | `campaign_list` |
| New Replied Lead | polling | `lead_list` (REPLIED, last 24 h) |

## Actions
| Action | MCP tool |
|---|---|
| Add Lead to Campaign | `lead_add` |
| Add Leads to a Campaign (bulk, Make only) | `campaign_upload_leads` |
| Update Lead | `lead_update` |
| Add Note to Lead | `lead_note_add` |
| Send Message (delivers immediately and cannot be recalled) | `message_send` |
| Draft AI Reply (sends nothing) | `message_draft_ai_reply` |
| Update Conversation | `conversation_update` |
| Pause or Resume Campaign | `campaign_set_status` |
| Launch Campaign (starts real outreach) | `campaign_launch` |
| Create Draft Campaign | `campaign_create` |
| Add Blacklist Entry | `blacklist_add` |
| Create Tag | `tag_create` |
| Create or Update Task | `task_upsert` |
| Create Reminder | `reminder_create` |
| Call a Linkedcamp Tool (Make only) | any tool from `tools/list` |
| Make an API Call (Make only) | Linkedcamp REST API |

## Searches
| Search | MCP tool |
|---|---|
| Find Campaign | `campaign_list` |
| Find Campaign Details (Make: Get a campaign) | `campaign_get` |
| Find Lead (Zapier: find or add) | `lead_list` |
| Find Lead Details (Make: Get a lead) | `lead_get` |
| Find Campaign Stats | `analytics_campaign` |
| Get a Campaign Funnel (Make only) | `analytics_campaign_funnel` |
| Find Conversation | `conversation_list` |
| Find Appointment | `appointment_list` |

Agency owners can point Find Campaign and Find Campaign Stats at a client sub-account with the **Client** field, which is filled from `subaccount_list`.

## Development
- See [TESTING.md](TESTING.md) for testing and [QUESTIONS.md](QUESTIONS.md) for open questions, and [SUBMISSION.md](SUBMISSION.md) for the Zapier and Make submission checklists.
- Secrets live only in the git-ignored `.env.local`. Start from `.env.example`.

## License
MIT
