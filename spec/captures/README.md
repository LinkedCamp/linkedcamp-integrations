# Captures

Written by `node scripts/bootstrap.mjs`, which needs the **test sub-account** key in the environment. All values are anonymised: names, emails, URLs, phone numbers and free text are replaced with tokens. Review the files before committing.

| File | Content |
|---|---|
| `server-behaviour.md` | session id presence, Content-Type (JSON or SSE), protocol version, whether `tools/call` works without `initialize` |
| `tools-list.json` | `tools/list` result for the test key |
| `schema-diff-live.md` | live `inputSchema` compared with §4 |
| `reference-leads.json`, `reference-campaign.json` | enums |
| `<tool>.json` | one read-only result per tool |
| `payload-<EVENT>.json` | one real webhook delivery per event (`--payload` import) |

**Status (21 Nov 2026):** not captured yet, because no test key was available. Unauthenticated probes showed:
- `POST mcp.linkedcamp.com/mcp` without a key returns HTTP 401, `application/json`, JSON-RPC error `-32001`. CORS exposes `mcp-session-id`.
- `GET api.linkedcamp.com/webhooks` without a token returns HTTP 200 `{"success":false,"message":"Token is required!"}`.
