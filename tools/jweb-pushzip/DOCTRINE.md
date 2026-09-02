# JWEB Pushzip Doctrine

> **Living document.** This doctrine is intentionally not frozen. Every pushzip failure that exposes a reusable weakness in packaging, validation, application, testing, staging, or pushing should refine this document and, when appropriate, the canonical runner/template in the same checkpoint or the immediately following one. Do not preserve a known bad workflow merely for historical consistency.

The pushzip is a small, auditable transaction for moving one reviewed JWEB checkpoint from an exact `origin/main` commit to the next commit. It is not a generic installer and it must not depend on the operator's current branch or working tree.

## Canonical technology

The repository owns the deployment technology under `tools/jweb-pushzip/`.

- `runner.mjs` is the canonical transaction runner. Normally a cut copies the pinned repository version into `bootstrap/jweb-pushzip-runner.mjs`. If the checkpoint intentionally upgrades the runner, the ZIP bootstraps the candidate runner and its bytes must be identical to the `tools/jweb-pushzip/runner.mjs` payload that the checkpoint installs.
- `PUSH-TEMPLATE.cmd` is the canonical Windows launcher shape. The launcher resolves the package by `%~dp0.` and delegates transaction behavior to the bundled runner.
- A pushzip contains `manifest/pushzip.json`, `manifest/files.json`, `payload/`, and a guarded cut-specific applicator under `release/` when complete payload bytes are not practical.
- The operator may launch from any `cmd.exe` directory. Distribution instructions use the established one-line Downloads pattern: extract to a named directory, `cd /d` into it, then `call PUSH-....cmd`.
- Do not invent a fresh clone/worktree/push script per cut. If the canonical runner lacks a capability, improve the canonical runner and this doctrine.

## Transaction invariants

1. **Fresh remote truth.** Work happens in a fresh clone of `main`, never by resetting or rewriting the operator's local checkout.
2. **Pinned base.** `expectedSha` is the exact reviewed `origin/main` SHA. The runner refuses to apply after the remote moves.
3. **Repository identity.** `CNAME` remains exactly `jweb.dev` before any mutation.
4. **Base guards.** Existing mutated files carry an exact base blob SHA whenever practical. A pinned SHA plus strict unique `baseContains` preimages is an allowed guard for narrowly scoped configuration edits. Mutated files may not be unguarded.
5. **Exact file allowlist.** `manifest/files.json` is the only set of files a package may change. Unexpected working-tree changes abort the transaction.
6. **Payload hashes.** Complete payload files carry SHA-256 and are byte-verified after application. A runner-upgrade checkpoint also byte-verifies bootstrap/payload runner parity before cloning.
7. **Transactional apply.** A cut-specific applicator validates every required anchor/input before writing target files. An anchor mismatch leaves the fresh clone clean. The runner verifies cleanliness after a failed apply.
8. **Contextual anchors.** Never assume a short source fragment is unique. Anchor to the owning function/phase/authority. Repeated architecture paths mean the patch needs narrower context or explicit treatment of both paths.
9. **All configured checks, then verdict.** Within PRE or POST, failures accumulate. A phase never aborts on the first syntax/test failure.
10. **Dirty baseline is evidence, not automatically a blocker.** A test already failing on the exact pinned clean base is baseline debt. The runner records it instead of pretending the base is green.
11. **Baseline-differential gate.** Baseline tests run in PRE and POST. PRE-pass/POST-fail is a regression. PRE-fail/POST-fail is non-blocking only when no new failure assertion/message appears. Fewer failures are an improvement. New/worsened failure assertions block.
12. **Required cut tests are strict.** New and directly relevant cut-specific tests run after application and must pass regardless of baseline debt.
13. **Test cost is structural.** Do not repeatedly run every expensive broad/soak test before and after every cut. PRE should establish relevant baseline debt plus cheap syntax/anchors; POST should run the targeted required suite once plus only the baseline comparisons needed to detect regression.
14. **Applicator failure is not a candidate.** If transactional application fails, POST is intentionally not run against a nonexistent or partial candidate. PRE has already completed, and the worktree must remain clean.
15. **No push on uncertainty.** Base drift, dirty failed apply, unexpected files, hash mismatch, syntax failure, new/worsened baseline failure, required-test failure, staged allowlist mismatch, whitespace error, or remote movement blocks commit/push.
16. **Exact staging.** Stage only the manifest allowlist and verify it with NUL-delimited Git output plus `git diff --cached --check`.
17. **Remote recheck.** Fetch `origin/main` again after tests and before commit. It must still equal the pinned SHA.
18. **One commit, one push.** A successful package creates one checkpoint commit and pushes it once to `main` after the final gate.
19. **Preserve evidence on failure.** Keep the fresh work directory on failure so the operator can inspect logs/state.

## Test doctrine

A cut configures the smallest suite that is complete for the architectural seams it changes. Coverage is not measured by how many slow tests were repeated.

- **PRE syntax** is cheap and strict. Every configured syntax check runs before its verdict.
- **PRE baseline tests** fingerprint only relevant known/possible baseline debt on the exact pinned base.
- **POST syntax** is strict.
- **POST baseline tests** rerun the same baseline tests for differential comparison.
- **POST required tests** exercise the cut itself and adjacent authorities once; every one must pass.

Authoring-time test claims must distinguish **author-local executed** coverage from **clean-clone-only** coverage. A package author must run every test that can actually execute in the authoring environment and must never summarize deferred integration checks as though they already passed. When new cut logic can be isolated into a pure module without weakening architecture, prefer that shape so its real implementation can execute author-locally before delivery. The clean-clone runner remains the final integration authority.

Failure comparison is assertion-oriented, not a raw-output hash. Node assertions can dump huge source strings; changing legitimate source bytes must not manufacture a false regression when the same assertion remains the only baseline debt. The runner compares stable failure messages/assertions, permits removals, and blocks additions.

A failing test never stops its phase early. Infrastructure failures (missing test, failed process launch) remain strict because they mean there is no trustworthy comparison.

## Applicator doctrine

Prefer complete payload bytes. Use mutation scripts only when shipping the complete final file is impractical.

A mutation script must:

- take the fresh repo path explicitly;
- verify all anchors before any target write;
- use owning-context markers for repeated code paths;
- fail loudly on zero or multiple matches;
- never use "replace the first thing that looks right" as drift handling;
- copy/add new files only after all source validations have succeeded;
- produce no changes outside the manifest allowlist.

If a cut discovers two legitimate copies of a previously assumed-singleton block, first decide whether both architecture paths require the invariant. If only one path is in scope, scope the anchor to that owning path. If both are in scope, patch and test both explicitly.

## Incident-derived refinements

### 2026-09-02 — Cut 12 R2 scaffold anchor

R2 used a bespoke worktree launcher and a short singleton scaffold anchor even though Cut 11 legitimately had two scaffold planners.

Refinement: return to the repository-owned runner; require transactional apply; scope repeated anchors to owning architecture phases; test the pushzip mechanism itself; enforce bootstrap/installed-runner byte parity on runner upgrades.

### 2026-09-02 — Cut 12 R3 dirty baseline and test cost

R3 correctly ran all 33 configured PRE checks before deciding, which exposed four tests already failing on the pristine pinned base. It then incorrectly treated those baseline failures as a reason Cut 12 could not even be applied. The broad PRE/POST duplication was also unnecessarily slow.

Refinement: Runner v3 uses a baseline-differential gate. Known/relevant baseline debt remains visible and is rerun after application, but unchanged debt is a warning rather than a blocker. Any new/worsened assertion blocks. Required cut-specific tests remain strict. PRE is deliberately small and diagnostic; expensive targeted coverage runs once in POST.

### 2026-09-02 — Cut 12 R4 author-local versus clean-clone coverage

R4 correctly blocked on five new required failures, but the package author had previously described some preparation checks too broadly as "tests ran" even though the repo-integrated tests could only execute after the clean clone on the operator machine.

Refinement: every delivery distinguishes author-local executed tests from clean-clone-only integration checks. Pure cut logic should be split into directly executable modules when that improves pre-delivery coverage without duplicating authority. Clean-clone POST remains the final verdict, but it should not be the first place inexpensive new logic is ever executed.

### 2026-09-02 — Cut 12 R5 unscoped transform deleted `planFloor`

R5 added a helper containing the same `const topology = buildTopology(...)` text later used as the start of an unbounded regex replacement. The applicator then matched inside the helper and consumed forward through the real `planFloor` declaration. JavaScript syntax checks still passed because an undefined runtime symbol is syntactically valid; the first repo-integrated planner call exposed `ReferenceError: planFloor is not defined`.

Refinement: mutation regexes that operate on function internals must be bounded by explicit owning start/end markers, even when the current anchor appears unique before earlier mutations run. Applicators must validate critical transformed-source symbols/boundaries before committing their in-memory write set. When a runtime-critical declaration can disappear without a syntax error, add a cheap source-shape smoke test to POST so the failure is immediate and diagnostic.

### 2026-09-02 — Cut 12 R6 immutable collision record entered a mutable legacy registry

R6 correctly preserved exterior collision authority records as frozen values, then published those exact objects into `physics.circulationReservations`. Legacy semantic connector reconciliation annotates normal circulation reservations with `connectorId`, so broad-vertical enrichment failed when it encountered the frozen collision record. Collision-only clearance boxes also are not access connectors and should not synthesize portals merely because they share the legacy clearance registry.

Refinement: keep authoritative immutable records separate from compatibility projections. When a shared legacy registry has mutation semantics, publish a distinct mutable projection instead of weakening authority immutability. Producers may mark clearance-only projections `semanticConnectorEligible: false`; connector reconciliation must honor that explicit opt-out while preserving default behavior for ordinary reservations.

This section should continue accumulating concise reusable lessons. It is not a frozen changelog; future failures should keep refining the doctrine and canonical technology.

### 2026-09-02 — Cut 12 R7 reservation substrate stranded raster pockets

R7 fixed immutable collision ownership and moved broad-vertical execution deeper into Building Plan. A later sample then failed `unclaimedRasterCellCount`: `assignLeftovers()` flooded ordinary cells first and only afterward assigned isolated stair/apron reservation cells to circulation. A reservation band could therefore separate an ordinary pocket during the flood; once circulation finally claimed the band, the solver never revisited the newly reachable pocket.

Refinement: reservation substrate that is authoritative circulation must be claimed before leftover flood/closure. Raster closure then iterates from that semantic substrate until stable. A stair shaft or walk-around apron may divide allocation phases, but it must not strand otherwise valid floor cells. Keep `unclaimedRasterCellCount === 0` strict; fix closure order rather than weakening the authority invariant. Add a cheap pure regression for reserved-substrate bridge closure so this failure is author-local executable.
