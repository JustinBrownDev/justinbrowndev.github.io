# JWEB pushzip runner

`runner.mjs` is the canonical JWEB-only pushzip transaction runner.

A package supplies:

- `manifest/pushzip.json` — pinned SHA, commit message, apply script, syntax checks, and ordered test list.
- `manifest/files.json` — the single exact repo-file allowlist, with SHA-256 for packaged final bytes.
- `payload/` — complete final bytes where possible.
- `release/` — a cut-specific guarded apply script only for files that cannot reasonably ship as complete final bytes.

The runner fresh-clones `main`, pins the SHA and `jweb.dev` identity, applies the payload, runs every configured syntax/test check before deciding whether to abort, force-stages the exact manifest, validates the staged index, rechecks remote `main`, gives a 5..1 Ctrl+C-only escape window, then commits and pushes once.

Future JWEB pushzips should copy this exact runner from the repository rather than rewriting deployment logic per cut.

`PUSH-TEMPLATE.cmd` is the canonical root Windows launcher template. Copy it to a new package root and rename it for the cut; it delegates all transaction behavior to the runner.
