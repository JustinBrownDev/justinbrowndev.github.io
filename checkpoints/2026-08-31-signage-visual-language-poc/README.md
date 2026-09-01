# JWEB generated-signage visual identity POC pack

Purpose: give any signage-adjacent LLM agent a complete, low-risk proof-of-concept it can incorporate while doing other work.

The pack turns existing jweb semantics into cheap but coherent visual design without requiring more 3D models or a heavier generation algorithm.

## Core idea

`semantic context -> 8 display vectors -> 12 display dialects -> surface-appropriate layout -> Canvas2D`

Eight vectors:

- authority
- commerce
- machine
- human
- urgency
- locality
- spectacle
- information density

Twelve supplied dialects:

- civic-authority
- machine-terminal
- market-blast
- transit-wayfinding
- scientific-instrument
- editorial-human
- luxury-sparse
- industrial-warning
- broadcast-spectacle
- network-protocol
- street-handmade
- archive-manifesto

Twelve supplied compositions:

- hero-word
- hero-number
- split-rail
- stacked-index
- terminal-grid
- boxed-notice
- poster-editorial
- warning-field
- broadcast-ticker
- ledger-cells
- quiet-mark
- vertical-code

The renderer uses only Canvas2D rectangles, rules, text, arcs, and a few procedural marks. No additional models or images are required.

## Fastest use

Hand the entire ZIP to another jweb agent with its existing task and tell it to read `AGENT-INSTRUCTION.md` first.

For a human/browser visual check, serve the directory over HTTP and open `demo/sign-display-proof.html` (ES module imports usually will not run from `file://`).

For a code check:

```sh
node tests/sign-visual-language-selftest.mjs
node --check content/sign-visual-language.js
node --check systems/sign-display-renderer.js
```

## Strongest proof point

The current live semantic-media assembly already assigns one `campaignKey` and normalized `mediaSegment.u0/u1` ranges to coordinated megascreen faces. This renderer directly consumes that: a corner megascreen can finally be one continuous composition seen through multiple physical faces instead of two identical billboards touching at a corner.

## Repository status

This pack is intentionally parked under `checkpoints/2026-08-31-signage-visual-language-poc/` by the root push launcher. The push does **not** wire the POC into the live runtime. A later signage-adjacent agent can copy/adapt the supplied modules while doing its actual task.

Still intentionally absent from the POC itself:

- no new GLTFs;
- no content corpus;
- no new semantic authority;
- no per-frame rendering loop.

The distribution ZIP includes `PUSH-JWEB-SIGNAGE-VISUAL-LANGUAGE-POC.cmd` at ZIP root for the standard JWEB fresh-main push workflow.
