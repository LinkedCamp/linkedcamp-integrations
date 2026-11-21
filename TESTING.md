# Testing

## Secrets
Copy `.env.example` to `.env.local` (git-ignored) and fill in `LINKEDCAMP_TEST_API_KEY`. Use the **test sub-account** key, never a client account's key. For Make, also fill in `MAKE_API_KEY` (scopes `sdk-apps:read`, `sdk-apps:write`) and `MAKE_ZONE`. Scripts read these variables from the environment and never print them.

## 1. Capture bootstrap (read-only)
```bash
set -a; source .env.local; set +a
node scripts/bootstrap.mjs
```
This writes anonymised files to `spec/captures/`, `zapier/lib/output-map.json` (the list key and id key for each list tool) and `zapier/samples/*.json` (Zapier static samples). Review it all before committing. Afterwards:
- Copy any mismatches from `spec/captures/schema-diff-live.md` into `QUESTIONS.md`.
- Note in `make/DESIGN.md` what `server-behaviour.md` says about sessions, SSE and calling `tools/call` without `initialize`.

The script only calls tools in its read-only allowlist. It refuses anything else.

## 2. Zapier
```bash
cd zapier
npm ci
zapier-platform test       # Jest + nock, offline; the live smoke suite runs only if LINKEDCAMP_TEST_API_KEY is set
zapier-platform validate   # schema + integration checks
```
- The offline suite covers JSON and SSE framing, session headers, `-32001` → reconnect, 403, `isError`, other JSON-RPC errors, one 404 retry for reads only (writes are never retried), REST `success:false` on HTTP 200, webhook subscribe/list/unsubscribe, header scoping (`X-Api-Key` only to the MCP host, `token` only to the REST host) and exact argument building.
- The live smoke suite (`test/live.test.js`) calls `whoami`, `campaign_list` and `lead_list`, all read-only.
- Write actions against real objects happen only in the live Zaps of `zapier/ZAP_TEST_PLAN.md`, on Arslan's named test campaign, lead and conversation. Send Message and Launch Campaign need his explicit yes each time.

## 3. Make
See `make/DESIGN.md` and `make/TEST_SCENARIOS.md`. Uploading (always private) happens only when Arslan approves it.

## 4. Webhooks (both platforms)
```bash
node scripts/webhook-cycle.mjs --event REPLY_DETECTED --callback-url https://<inbox you control> --confirm
node scripts/bootstrap.mjs --payload REPLY_DETECTED ./delivered.json
```
The script subscribes, checks that `GET /webhooks` lists the URL, waits while you cause one real event, then unsubscribes and checks the hook is gone. The `--payload` step anonymises the delivered body into `spec/captures/payload-<EVENT>.json` and the Zapier sample. Repeat for all 8 events.
