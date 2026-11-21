# Zap test plan (Zapier publishing requirement)

Zapier requires **every trigger, action and search to be used in a live Zap that is turned on and has at least one successful run**. Don't delete these Zaps, because Zapier reviews them.

Use the Linkedcamp **test sub-account** connection throughout. Write steps only target the named test objects below:

| Placeholder | Meaning |
|---|---|
| `TEST_CAMPAIGN` | a PAUSED or DRAFTED test campaign |
| `TEST_LEAD` | a lead you own in that campaign |
| `TEST_CONVERSATION` | a conversation with your own second LinkedIn or email account |

Fill in the real ids before you start.

Helper apps: Schedule by Zapier (a manual or daily trigger), Formatter, and Zapier Tables or Google Sheets for logging. The Linkedcamp step under test is shown in **bold**.

## Triggers
| # | Zap | Linkedcamp step | How to cause a successful run |
|---|---|---|---|
| T1 | **New Reply** → Tables: add record | `new_reply` (REPLY_DETECTED) | Reply from your second account to a `TEST_CAMPAIGN` message |
| T2 | **New Connection Accepted** → Tables | `new_connection_accepted` | Accept a test invite from your second account |
| T3 | **New Connection Request Sent** → Tables | `new_connection_request_sent` | Let the test campaign send one invite to your second account |
| T4 | **New Email Sent** → Tables | `new_email_sent` | Test campaign email step to your own mailbox |
| T5 | **New Email Open** → Tables | `new_email_open` | Open that email |
| T6 | **New Email Link Click** → Tables | `new_email_link_click` | Click its link |
| T7 | **New Email Bounce** → Tables | `new_email_bounce` | Send to a known-bouncing test address you control |
| T8 | **New Unsubscribe** → Tables | `new_unsubscribe` | Unsubscribe from that email |
| T9 | **New Appointment** → Tables | `new_appointment` | Book a test meeting from `TEST_CONVERSATION` |
| T10 | **New Campaign** → Tables | `new_campaign` | Covered by A9 (Create Draft Campaign) |
| T11 | **New Replied Lead (Polling)** → Tables | `new_replied_lead` | Same reply as T1 |

## Actions (Schedule trigger → Linkedcamp action)
| # | Action | Input |
|---|---|---|
| A1 | **Add Lead to Campaign** | `TEST_CAMPAIGN`, your own second-account email |
| A2 | **Update Lead** | `TEST_LEAD`, personalization = "zap test" |
| A3 | **Add Note to Lead** | `TEST_LEAD`, "Zapier test note" |
| A4 | **Send Message** ⚠ delivers immediately | `TEST_CONVERSATION` only, text approved by Arslan |
| A5 | **Draft AI Reply** | `TEST_CONVERSATION`, a connected provider |
| A6 | **Update Conversation** | `TEST_CONVERSATION`, seen = true |
| A7 | **Pause or Resume Campaign** | `TEST_CAMPAIGN`, PAUSED |
| A8 | **Launch Campaign** ⚠ starts outreach | a DRAFTED test campaign whose only lead is your own second account; Arslan's explicit yes first |
| A9 | **Create Draft Campaign** | title "Zapier test draft" |
| A10 | **Add Blacklist Entry** | EMAIL, `blacklist-test@example.com` |
| A11 | **Create Tag** | "Zapier test", NEUTRAL |
| A12 | **Create or Update Task** | title "Zapier test task" |
| A13 | **Create Reminder** | tomorrow 09:00, `TEST_LEAD` |

## Searches (Schedule → Linkedcamp search → Tables)
| # | Search | Input |
|---|---|---|
| S1 | **Find Campaign** | keyword = test campaign title |
| S2 | **Get Campaign** | `TEST_CAMPAIGN` |
| S3 | **Find Lead** (+ "create if not found" → Add Lead to Campaign) | your second-account email |
| S4 | **Get Lead** | `TEST_LEAD` |
| S5 | **Get Campaign Stats** | `TEST_CAMPAIGN` |
| S6 | **Find Conversation** | keyword = second-account name |
| S7 | **Find Appointment** | lead = `TEST_LEAD` |

## After the runs
- Copy one successful output per write action into `zapier/samples/<key>.json` (anonymised: run each one through `node scripts/bootstrap.mjs --payload`-style anonymising, or edit it by hand). This clears the D012 "must have a static sample" publishing tasks for creates.
- Re-run `zapier-platform validate`.
