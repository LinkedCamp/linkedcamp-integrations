# Linkedcamp Make app: test scenarios for app review

These scenarios are written for Make's app-review prerequisites, and also follow §7.3 of the build brief. None has been run yet: they need the uploaded private app, a Linkedcamp **test sub-account** key, and Arslan's go-ahead.

## Ground rules

- **Coverage.** Every one of the 35 modules appears in at least one scenario (see the checklist at the end). Scenario 8 is a separate error scenario.
- **Ordering.** Search and list modules sit at the **end** of a route, so their bundles cannot repeat writes downstream. Run each one with data or a limit that spans **more than one page**, so the execution log shows pagination (`page` 1, 2, 3 in the request bodies).
- **No personal data.** Use only the test sub-account and synthetic leads such as `Test Lead 01`, `lead01@example.com` and a placeholder profile URL agreed with Arslan. Before you share a log, check it for names, emails and URLs.
- **No other app's webhook or module.** Scenarios use Linkedcamp modules and Make's built-in tools only (Set variable, Iterator, Array aggregator, Router, Sleep).
- **Real-world side effects need a named target and Arslan's explicit OK:**
  - Send a message: one named test conversation he owns.
  - Launch a campaign, Pause or resume a campaign: one DRAFTED or PAUSED test campaign.
- **When to run.** Run every scenario **right before** requesting review, and again **after every fix**, because review logs expire.
- **Before Publish.** Remove the test scenarios, the test connections and any test modules or components. Publishing is irreversible.
- **Clean up after each run.** Remove the test webhooks: deactivate the instant-trigger scenarios so detach runs, then check `GET /webhooks` with Make an API call. Archive the test tasks, reminders, tags and blacklist rules by hand in Linkedcamp. Some of them have no delete tool.

Placeholders are in `<angle brackets>`. Every scenario uses the one connection, "Linkedcamp (test sub-account)".

---

## 1. Connection and setup (run first)

1. Create the connection with the test key. **Expected:** it is saved, and its label shows the account email (TODO(capture) 8).
2. Create a second connection with a deliberately wrong key, `invalid-key-000`. **Expected:** it fails with "The Linkedcamp API key was rejected." (HTTP 401). Delete that connection afterwards.
3. Open the dropdowns in any module:
   - Campaign (`listCampaigns`)
   - LinkedIn account (`listLinkedInAccounts`)
   - Tool (`listTools`)
   - Client (`listClients`)

   **Expected:**
   - Campaign, LinkedIn account and Tool have options.
   - Client is empty or shows an error for a key that is not an agency owner.
   - With more than 20 campaigns, listCampaigns shows options from page 2.

## 2. Lead lifecycle

Trigger: **Watch new campaigns** (limit 3). Use **Run once**: the trigger is only here so it appears in a scenario; the route doesn't depend on it.

Route:
1. **Create a draft campaign**: title `Make review test <date>`, no source URL.
2. **Add a lead to a campaign**:
   - campaign = 1.id (map the id once captured; until then pick it from the dropdown)
   - email `lead01@example.com`, first name `Test`, last name `Lead 01`
   - custom fields `segment = review`
3. **Bulk add leads to a campaign (advanced)**:
   - same campaign
   - column mapping `Email → email`, `First → firstName`
   - leads: an array of 3 synthetic rows built with Set variable and Array aggregator
   - remove duplicates = Yes
4. **Get a campaign**: same campaign, include flow = Yes. Check `_readiness` in the output.
5. **Get campaign stats**: same campaign, no date range.
6. **Get a campaign funnel**: same campaign, range = the last 7 days.
7. **Search leads** (end of route): keyword `example.com`, the same campaign, limit **30**. **Expected:** 4 bundles. Page size is 100, so add a second run with no campaign filter and limit 150 on an account with more than 100 leads to show page 2 in the log.

## 3. Lead updates and CRM

Trigger: **Watch new replied leads** (limit 2, Run once).

Route:
1. **Get a lead**: lead ID = `<a test lead id from scenario 2>`. Include activities = Yes, include messages = No.
2. **Update a lead**:
   - the same lead
   - personalization `Make review`
   - paused = Yes, then run again with paused = No
   - interested = No (shows that `false` is sent)
3. **Add a note to a lead**: the same lead, note `Internal test note`.
4. **Create or update a task**: title `Review follow-up`, lead = the same lead, due date = tomorrow 10:00. Then a second **Create or update a task** with task ID = 4.id (once captured) and completed = Yes.
5. **Create a reminder**: title `Check reply`, remind at = tomorrow 09:00, lead = the same lead.
6. **Create a tag**: tag `make-review-test`, interest Neutral.
7. **Add a blacklist entry**: LinkedIn account = the test account, type Email, value `blocked-test@example.com`.
8. **Search appointments** (end of route): status Confirmed, limit 25.

## 4. Inbox

Trigger: **Watch new appointments** (limit 2, Run once).

Route:
1. **Draft an AI reply**: conversation = `<named test conversation>`, provider = the one connected on the test account, prompt `Suggest two meeting times next week.` **Expected:** a draft. Nothing is sent.
2. **Update a conversation**: the same conversation, seen = Yes, AI agent handles this conversation = No.
3. **Send a message**. ONLY with Arslan's explicit OK and his named test conversation. Content `Test message from the Make review scenario.`
4. **Search conversations** (end of route): no filters, limit **45**. Conversations come 20 per page, so the log shows pages 1–3.

## 5. Campaign controls (needs Arslan's explicit OK)

Run once manually, with no trigger.

1. **Search campaigns**: status Drafted, keyword `Make review test`, limit **45**. This covers 20 per page. With fewer drafts, add a second instance with no filter to show page 2.
2. **Launch a campaign**: the named DRAFTED test campaign only. Skip the readiness check = No.
3. **Pause or resume a campaign**: the same campaign, Pause.
4. **Pause or resume a campaign**: the same campaign, Resume, only if Arslan wants it to keep sending. Otherwise leave it paused.

To avoid the launch, run steps 1, 3 and 4 against an existing PAUSED test campaign and record that Launch was not exercised.

## 6. Generic modules

Run once manually.

1. **Call a Linkedcamp tool**: tool `whoami`, arguments `{}`.
2. **Call a Linkedcamp tool**: tool `campaign_list`, arguments `{"page": 1}`.
3. **Make an API call**: URL `/webhooks`, method GET. **Expected:** `statusCode` 200, and a body with `success: true` and `data[]`.

## 7. Instant triggers (8 scenarios, one per module)

For each of the modules below:

1. Create a scenario with only that trigger, plus a Set variable module that stores the bundle.
2. Activate it. **Expected:** attach runs `POST /webhooks`, then `GET /webhooks`. Check with scenario 6, step 3 that the hook URL is listed.
3. Cause one real event on the test account. Wait for the scenario to run, then save the payload (anonymised) to `spec/captures/payload-<EVENT>.json`.
4. Deactivate it. **Expected:** detach runs `DELETE /webhooks/<id>`, and the URL is gone from `GET /webhooks`.

| Module | Event to cause |
| --- | --- |
| Watch new replies | A reply from a test lead |
| Watch new connections accepted | A test profile accepts a connection request |
| Watch new connection requests sent | The test campaign sends a request |
| Watch new emails sent | The test campaign sends an email |
| Watch new email opens | The test email is opened |
| Watch new email link clicks | A link in the test email is clicked |
| Watch new email bounces | An email to a bouncing test address |
| Watch new unsubscribes | The test lead unsubscribes |

## 8. Error scenario (separate)

Run once manually.

1. **Get a campaign** with campaign ID `000000000000000000000000` (mapped, not picked). **Expected:** the module fails with the tool's `isError` text, for example "Campaign not found". It is not a silent empty result.
2. Add a second instance: **Make an API call**, URL `/webhooks/does-not-exist`, method DELETE. **Expected:** it fails with Linkedcamp's `success:false` message.

Keep the failed execution log for the review form.

## Coverage checklist (35 modules)

| Module | Scenario |
| --- | --- |
| Watch new replies, Watch new connections accepted, Watch new connection requests sent, Watch new emails sent, Watch new email opens, Watch new email link clicks, Watch new email bounces, Watch new unsubscribes | 7 |
| Watch new campaigns | 2 |
| Watch new replied leads | 3 |
| Watch new appointments | 4 |
| Create a draft campaign, Add a lead to a campaign, Bulk add leads to a campaign (advanced), Get a campaign, Get campaign stats, Get a campaign funnel, Search leads | 2 |
| Get a lead, Update a lead, Add a note to a lead, Create or update a task, Create a reminder, Create a tag, Add a blacklist entry, Search appointments | 3 |
| Draft an AI reply, Update a conversation, Send a message, Search conversations | 4 |
| Search campaigns, Launch a campaign, Pause or resume a campaign | 5 |
| Call a Linkedcamp tool, Make an API call | 6 |
| Error case (Get a campaign, Make an API call) | 8 |
