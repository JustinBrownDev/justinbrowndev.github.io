# JWEB target report

One unified way to point at a thing in the world — a TV, an intersection, a
roof topper, a trash can, whatever — and get back every data path about it in
one place: identity, physical/geometry authority, placement/semantic
authority, content authority (media), and a visual-capture plan. Base case is
**everything**: a section is never silently dropped, only marked `pending` /
`not-applicable` with the exact command to fill it in by hand.

Two modes, same shape:
- `fast` — isolated. Static catalog lookups and synthetic fixtures that
  exercise the real functions without a full city/chunk build.
- `slow` — full generation. What the target looks like as an actual instance
  inside a real streamed chunk.

## Run it

```sh
node tools/target-report/run.mjs                      # every known target, both modes
node tools/target-report/run.mjs --target spawn-tv     # one target, both modes
node tools/target-report/run.mjs --target spawn-tv --mode fast
```

Known targets today: `spawn-tv`, `intersection`, `roof-topper`, `trash-can`
(see `collectors.mjs`).

Output goes to `~/jweb-target-reports/<target>/<mode>/index.html` (+
`record.json`), plus a `~/jweb-target-reports/index.html` hub linking every
report. That folder is a personal report archive, not part of this repo.

## If a report is wrong

Every `index.html` ends with a "Paste this back if something's wrong" block —
the full record (every id, source ref, and repro command) as one JSON blob.
Paste it back verbatim; it's enough to regenerate or debug that exact report
without re-deriving anything.

## Adding a new target

Add a `collect<Name>(mode)` function to `collectors.mjs` that returns
`{ slug, label, targetType, sections }`, where each section comes from the
`section()` helper (`status` is `'real' | 'pending' | 'not-applicable'` —
never fake data to make a section look real). Register it in `COLLECTORS`.
Reuse `visualCaptureSection()` for the standard visual-harness repro block.

## What's real vs. not yet wired (updated 2026-09-07)

- Catalog/authority lookups (asset bounds, placement metadata, media
  resolution, junction geometry on a synthetic fixture) are real — they
  import and call actual JWEB source modules.
- Pixel capture is now automated for real via `tools/visual-harness/capture.mjs`
  + `headless-driver.mjs` — a from-scratch CDP client (no puppeteer/playwright
  dependency) driving the system's own chromium-browser/google-chrome. It
  actually attempts the capture and reports a real `visual-capture` section:
  `real` (with files written under `visual/`) on success, `pending` (with the
  literal error and a manual fallback command) on failure. See
  `tools/visual-harness/README` update below for validated proof-of-life.
- `tools/geometry-harness`'s Python side (numpy/Pillow) is confirmed
  installable but not installed in this pass, so those audit/silhouette
  sections are still `pending` with the exact command.

### Known limitation: full-world (slow mode) settle speed

Headless Chrome here has no real GPU — WebGL runs through SwiftShader
(software rendering), which renders a full streamed city at only ~2-3 fps
("potato" quality). The harness's own settle-wait (`waitForSettled`) can
legitimately take longer than that to see "local render ring complete" under
this framerate; in the first full run, `trash-can` and `roof-topper` slow-mode
captures still timed out at a 150s wait budget. This is a real environmental
constraint, not a bug in the wiring - the honest `pending` + timeout message
is the correct result, not something to silently paper over. Options to push
further: raise `wait.timeoutMs` again, or add a `wait: null` best-effort
fallback (grab whatever's rendered right now instead of waiting for a full
settle) - not implemented yet.
