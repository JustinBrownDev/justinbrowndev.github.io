# JWEB pushzip runner

`runner.mjs` is the canonical JWEB-only pushzip transaction runner. The governing rules are in [`DOCTRINE.md`](./DOCTRINE.md).

**The Pushzip Doctrine is a living document.** Reusable package failures refine the doctrine and canonical tooling rather than spawning one-off deployment workarounds.

A package supplies:

- `manifest/pushzip.json` — pinned SHA, commit message, apply script, cheap PRE syntax, baseline-comparison tests, strict POST syntax, and strict cut-specific POST tests.
- `manifest/files.json` — the exact repo-file allowlist, SHA-256 for packaged final bytes, and base guards for existing mutated files.
- `payload/` — complete final bytes where possible.
- `release/` — a cut-specific guarded transactional applicator only when complete final files are impractical.

Runner v3 fresh-clones `main`, pins the SHA and `jweb.dev` identity, validates base guards, then uses a **baseline-differential gate**:

1. run every configured PRE syntax/baseline check;
2. record existing baseline test debt instead of requiring a falsely perfect base;
3. apply transactionally;
4. verify exact payload and working-set bytes;
5. run every configured POST syntax check, baseline comparison, and required cut test;
6. warn on unchanged/improved baseline debt, but block new/worsened baseline assertions or any required-test failure;
7. force-stage exactly the manifest, validate the staged diff, recheck remote `main`, then commit/push once.

Test cost is part of the architecture. PRE should stay cheap and diagnostic. Expensive broad/soak tests should not be duplicated before and after a cut unless they are genuinely needed for baseline comparison.

Authoring reports must distinguish **author-local executed** checks from **clean-clone-only** integration checks. New pure cut logic should be structured so its real implementation can execute before delivery whenever practical; the clean-clone POST gate remains the final integration authority.

A failed applicator is not a candidate tree: POST is not run, and the runner verifies that the failed transactional applicator left the clone clean. Within PRE and POST, every configured check runs before that phase receives a test-derived verdict.

Runner upgrades bootstrap the candidate runner and require byte parity with the `tools/jweb-pushzip/runner.mjs` payload being installed.

`PUSH-TEMPLATE.cmd` remains the canonical root Windows `cmd.exe` launcher shape. Distribution instructions should continue using the one-line Downloads extract/`cd`/`call` pattern.

Cut 12 R8 also records the raster-closure lesson: authoritative circulation reservation substrate is claimed before leftover flood so stair/apron bands cannot strand valid floor cells. The zero-unclaimed-cell authority invariant remains strict.
