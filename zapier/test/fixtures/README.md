# Test fixtures

Files here are **synthetic protocol fixtures**. They exercise transport framing
(JSON vs SSE), JSON-RPC errors, `isError` results and REST `success:false`.
Their tool payloads are deliberately opaque placeholders (`{"ok":true}`,
`items`, `x`), not claims about Linkedcamp output fields. Real output shapes
come only from `../../spec/captures/` (written by `scripts/bootstrap.mjs`).
