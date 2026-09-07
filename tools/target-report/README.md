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

## What's real vs. not yet wired (as of first pass, 2026-09-07)

- Catalog/authority lookups (asset bounds, placement metadata, media
  resolution, junction geometry on a synthetic fixture) are real — they
  import and call actual JWEB source modules.
- Pixel capture (`tools/visual-harness`) is not automated yet — no
  headless-browser driver is wired in, so those sections are `pending` with
  the exact URL/console script to run by hand.
- `tools/geometry-harness`'s Python side (numpy/Pillow) is confirmed
  installable but not installed in this pass, so those audit/silhouette
  sections are also `pending` with the exact command.

The obvious next step is a headless-Chrome (CDP) driver so the visual-capture
sections become real automated output instead of a manual command — chromium
is already present on this machine, no new repo dependency needed.
