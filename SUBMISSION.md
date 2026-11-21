# Submission checklist: Zapier and Make

These rules were re-read from the live docs on 21 Nov 2026, and the sources are linked at the end. Status key:

| Mark | Meaning |
|---|---|
| ✅ | done in this repo |
| 🧪 | waits on the test key (captures) |
| 👤 | Arslan's step |
| ⚠️ | conflicts with the original brief or needs a decision |

Nothing has been registered, pushed, uploaded, published or submitted.

---

## Zapier

### Where the live docs differ from the brief
| | Brief said | Docs say | What we did |
|---|---|---|---|
| ⚠️ | Description ≤160 chars (146) | Check **M002** enforces **≤140 chars**, "1–3 sentences", starting "Linkedcamp is a" (the branding page still says 160) | Shortened to 129 chars: *"Linkedcamp is agentic LinkedIn and email outreach for lead generation agencies, with campaigns, replies and AI agents per client."* |
| ⚠️ | Search names "Get Campaign", "Get Lead", "Get Campaign Stats" | Search names start with **"Find"** and descriptions with **"Finds"** | Renamed to Find Campaign Details, Find Lead Details and Find Campaign Stats. The keys (`get_campaign`, …) stay the same |
| ⚠️ | Help text "…replies in a Linkedcamp campaign" | Descriptions should **not include the integration name** | Changed to "…replies to a campaign message.", "…sent by a campaign." and "…booked from a conversation." |
| ⚠️ | ID fields such as "Lead ID" | No input labelled "XXX ID". Use dynamic dropdowns or search-powered fields (D004) | Lead, Conversation and Tags fields now use dropdowns (`lead_list`, `conversation_list`, `tag_list`). Action lead/conversation fields also use search (Find Lead, Find Conversation). Two D004 warnings remain: Existing Task and Email Account have no §4 list tool behind them |
| ⚠️ | — | **T006**: a hook's `performList` must return the **same structure** as the webhook payload | New Reply and New Connection Accepted use `lead_list` (as the brief says), which almost certainly differs from the payload. Once payloads are captured, either map the lead into the payload shape or use the payload fixture. This blocks submission until fixed |
| ⚠️ | — | **S001**: at least **3 users** with a live Zap using the integration | Line up 3 accounts (e.g. internal team members) before submitting |
| ⚠️ | "one admin with an @linkedcamp.com email" | **M005**: the admin email domain must **match the homepage domain** (`linkedcamp.com`), and M003 says the role must be Employee or Contractor. Collaborators don't count | 👤 Add an `@linkedcamp.com` admin |
| ⚠️ | Beta for 90 days | IPR 5.1: the app must be **publicly launched**, not invite-only or beta. "Beta" is only Zapier's listing tag after approval | Linkedcamp is publicly launched, so no action needed |
| ⚠️ | Logo ≥512 | Branding page: transparent square PNG ≥512, no text. Check M004 accepts ≥256 RGBA | Supply 512 px (`assets/logo-square-512.png`, still missing; see QUESTIONS Q16) |

### App definition
| Requirement | Status |
|---|---|
| Static sample for every trigger, action and search (**D012**, blocks publishing) | 🧪 Searches and polling triggers get samples from `node scripts/bootstrap.mjs`. Hook samples need `--payload`. Create samples come from one live run of each action (`zapier/ZAP_TEST_PLAN.md`) |
| Sample: one item, keys present in every response, ISO-8601 dates with offset (D023/D024, T004) | 🧪 Review after the captures |
| Trigger descriptions start "Triggers when" and end with "." (D021) | ✅ |
| Action descriptions start with a third-person verb ("Adds…", "Sends…") | ✅ |
| Searches return `[]`, not an error, on no match | ✅ (tested) |
| At least one search field (D009) | ✅ |
| Polling: newest first, unique `id` (D010/T002) | ✅ The id key comes from `output-map.json`; 🧪 confirm it |
| Hooks have `performList` (D006); no static hooks (D016/17) | ✅ REST hooks with subscribe and unsubscribe |
| Auth: credentials only in auth config; field key isn't `api_key`-like (**D001**) | ⚠️ The auth field key is `api_key`. D001 targets trigger/action input fields, not auth fields, and validate doesn't flag it. Left as is |
| Help text links to where the key is found (D002) | ✅ |
| Connection label is identifying, not static (D003) | ✅ `name (email)` from `whoami`; 🧪 confirm the field paths |
| HTTPS only, production API, English, user-friendly errors | ✅ |
| `cleanInputData` (D028) | ✅ Off globally; `lib/mcp.js` drops blanks |
| `zapier-platform validate`: no Errors | ✅ The only Publishing Tasks left are the 31 × D012 sample items (🧪) |
| Field labels in sentence case (build guidelines) | ⚠️ Labels are Title Case ("First Name"). Low priority: change them if the reviewer asks |

### Account and listing (👤)
1. A test account on `integration-testing@zapier.com`:
   - non-expiring
   - Pro/Agency features on, no trial limits
   - password changeable by Zapier support
   - a demo video or doc for complex features
2. An admin on the Zapier team with an `@linkedcamp.com` email, role Employee/Contractor.
3. Public API docs to link:
   - https://docs.linkedcamp.com/mcp/tools
   - https://docs.linkedcamp.com/api-reference/webhooks/create-webhook
   - https://docs.linkedcamp.com/api-reference/webhooks/list-webhooks
   - https://docs.linkedcamp.com/api-reference/webhooks/delete-webhook
4. Branding form:
   - name **Linkedcamp**
   - the description above
   - logo `assets/logo-square-512.png`
   - one category (suggest *Marketing → Marketing Automation*, or *Sales & CRM*)
   - homepage `https://www.linkedcamp.com`
   - primary colour `#2CC5F4` (not `#FFFFFF`; confirm the hex, QUESTIONS Q7)

### Submit flow (👤)
1. `cd zapier && zapier-platform login && zapier-platform register "Linkedcamp" && zapier-platform push`
2. In the Platform UI (developer.zapier.com), set the branding. CLI pushes don't overwrite it.
3. Build the Zaps in `zapier/ZAP_TEST_PLAN.md`. Each must be **on, with ≥1 successful run**. Never delete them. Get **≥3 users** with live Zaps.
4. Paste the create outputs into `zapier/samples/`, run `zapier-platform validate` (0 Errors, 0 Publishing Tasks), then `push` again.
5. Integration Home → **Publish** → fill in the form → **Submit for Review**. The version becomes *Pending*.
6. Zapier replies within about **1 week**. On approval the app gets a **Beta** tag for 90 days (it ends early the next business day after a signup through a Zapier embed), then becomes Public and joins the Partner Program.

---

## Make

### Where the live docs differ from or add to the brief
| | Rule (developers.make.com best practices) |
|---|---|
| ⚠️ | **Labels in sentence case** with fixed verbs: "Watch new replies", "Add a lead to a campaign", "Create or update a task" (not "Upsert"), "Search leads" (with filters) or "List … " (no filters), "Bulk add leads to a campaign (advanced)" |
| ⚠️ | **Descriptions** in a fixed form: Watch = "Triggers when a new [item] is created."; Get = "Returns information about a specific [item] by its ID."; Search = "Returns a list of [items] filtered by …" |
| ⚠️ | Universal module description, exactly: "Sends a custom API call to Linkedcamp. You can use this to call endpoints that aren't covered by existing modules." It **must use a relative path** or it is not approved |
| ⚠️ | `limit` rules: searches have it **not required**, default 10, never advanced. Polling triggers have it **required**. RPCs: 300–500 if the page size is ≥100, else 3× the page size |
| ⚠️ | Pagination and iterate only in searches and triggers, never in actions. Platform caps: 100 requests, 50 pages, 3200 records, 40 s |
| ⚠️ | Interfaces must hold the **full API response, including nested fields** (Interface Generator). 🧪 This needs captures |
| | Connection validated against a real endpoint (`whoami`); a wrong key must fail. Sanitize the exact header names `x-api-key` and `token` |
| | The service isn't already in Make (the generic MCP Client doesn't count). Use only the credentials needed (just the API key) |

**Status of the Make build (`make/`):** ✅ Labels and descriptions follow the conventions above. ✅ The universal module matches the required wording and takes a relative path. ✅ `limit` follows the rules above. ✅ Pagination is in searches and triggers only. ✅ `mode: edit` on selectors. ✅ Exact-header sanitization. ✅ The connection is checked with `whoami`. ✅ `valid` error handling for JSON-RPC errors, `isError` and REST `success:false`. ✅ Editor-schema validation passes (211 files, 0 warnings). ✅ 32 IML function tests pass.
- 🧪 Interfaces (`[]`), samples (`{}`), output date formatting and polling start points wait on captures.
- ⚠️ **Custom IML functions need Make to enable them** (QUESTIONS Q18). Ask the Make helpdesk before the private upload.

### Test scenarios (👤, right before review)
- Every module in at least one scenario, ideally one scenario, with modules chained by object.
- Search and list modules at the ends of routes, run so the logs show pagination.
- One **separate scenario that errors** (e.g. a bad campaign id).
- No personal or sensitive data, and no other app's webhooks.
- Logs expire, so **run them right before you click Request review**, and again after every fix.

### Submit flow (👤, irreversible from step 3)
1. Ask the Make helpdesk to enable custom IML functions for the app (QUESTIONS Q18). Then `make/scripts/upload.mjs` uploads it as **private**, only with Arslan's OK.
2. Install it in the test org, run `make/TEST_SCENARIOS.md`, then fix and re-run.
3. **Remove test modules and test connections**, then **Publish**. This is **irreversible**: a published app can't be made private or deleted, and modules can't be deleted, only renamed "[DO NOT USE] …" and hidden.
4. Modules tab: set every module to **visible**.
5. **Review** tab: add the API docs link (https://docs.linkedcamp.com/mcp/tools plus the webhook pages) and the scenario links → **Request review**. The status becomes *pending approval*, with the email thread "App review: Linkedcamp".
6. Fill in the emailed form:
   - vendor relationship (we are the vendor)
   - partnership contact
   - support contact `support@linkedcamp.com`
   - categories
   - **company logo** `assets/logo-wide-1200.png`
   - **URL to the service** (QUESTIONS Q7)
   - trademark and T&C/indemnity confirmations
7. The review runs in stages: automatic review (a PDF of issues) → manual QA → planned release. No timeline is published. Avoid big code changes while the review is in progress. Use "Update review" to change links.
8. After approval, changes go through the development version and every public change needs Make's approval.

### Logo
- PNG, square, 512–2048 px, ≤500 kB. Make recolours it: white or transparent becomes the theme colour, black becomes white.
- The source is `assets/logo-make-mono-512.png`, a black silhouette, generated once `logo-square-512.png` is available.
- Theme colour: `#2CC5F4` (to confirm).

---

## Sources
**Zapier:**
- [publishing requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements)
- [public integration](https://docs.zapier.com/integrations/publish/public-integration)
- [branding guidelines](https://docs.zapier.com/integrations/publish/branding-guidelines)
- [checks reference](https://docs.zapier.com/platform/publish/integration-checks-reference)
- [build guidelines](https://docs.zapier.com/integrations/publish/integration-build-guidelines)
- [branding in CLI](https://docs.zapier.com/integrations/publish/branding-cli)

**Make:**
- [prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites)
- [request review](https://developers.make.com/custom-apps-documentation/app-review/request-app-review)
- [approved app](https://developers.make.com/custom-apps-documentation/app-review/approved-app)
- [review status](https://developers.make.com/custom-apps-documentation/app-review/review-status)
- [app logo](https://developers.make.com/custom-apps-documentation/create-your-first-app/app-logo)
- [app visibility](https://developers.make.com/custom-apps-documentation/create-your-first-app/app-visibility)
- [module labels](https://developers.make.com/custom-apps-documentation/best-practices/naming-conventions/modules/module-labels)
- [module descriptions](https://developers.make.com/custom-apps-documentation/best-practices/naming-conventions/modules/module-descriptions)
- [search modules](https://developers.make.com/custom-apps-documentation/best-practices/modules/search-modules)
- [RPCs](https://developers.make.com/custom-apps-documentation/best-practices/remote-procedure-calls)
- [interface](https://developers.make.com/custom-apps-documentation/best-practices/output-parameters/interface)
- [connections](https://developers.make.com/custom-apps-documentation/best-practices/connections)
- [universal module](https://developers.make.com/custom-apps-documentation/app-components/modules/universal-module)
