# Drop this pack into any unrelated JWEB signage task

You are already doing some signage-related work in `JustinBrownDev/justinbrowndev.github.io`.

Treat this directory as **implementation raw material for a proof of concept**, not as a new architecture proposal.

## Mandatory intent

While completing your primary task, integrate the smallest clean slice of this pack that proves the following:

> Existing jweb semantic truth can create dramatically different visual signage identities using cheap Canvas2D composition, without adding a new model corpus or expensive generation pass.

There are no design decisions to make. Use the supplied implementation as the default.

## Required behavior

1. Preserve fresh live `main` as authority.
2. Preserve Building Semantic Truth, district/block composition, frontage binding, Exterior Composition Authority, media assembly grouping, spatial claims, and streaming behavior.
3. Add/adapt `content/sign-visual-language.js` and `systems/sign-display-renderer.js` from this pack.
4. Route at least the signage surface you are already touching through `resolveDisplayRecipe()` + `renderDisplayCanvas()`.
5. If your task touches corner megascreens, **use `mediaSegment.u0/u1` so all faces are viewports into one continuous composition**. Do not render identical independent faces.
6. Use the live semantic fields already present (`campaignKey`, `campaignSeed`, `districtFamily`, `semanticProgram`, `frontageRole`, `publicRole`, `landmark`, building/entity identity).
7. Keep the current content/title/subtitle source. This pack changes visual language, not meaning generation.
8. Keep rendering creation-time only; never introduce per-frame canvas generation.
9. Run the included self-test after adapting imports/paths.
10. Do not push unless your parent task explicitly requires pushing.

## Success evidence

Show or test at least three deterministic contexts that visibly/structurally choose different dialect/layout recipes, e.g.:

- market/retail storefront;
- network/mechanical service facade;
- public/institutional or transport frontage;
- spectacle megascreen.

The POC should be obvious from the recipe output even before visual inspection.

## Files in this pack

- `content/sign-visual-language.js` — deterministic semantic vectors + 12 coherent display dialects.
- `systems/sign-display-renderer.js` — fixed-cost Canvas2D renderer + 12 composition families.
- `integration/JWEB-ADAPTERS.md` — exact integration snippets for current jweb paths.
- `tests/sign-visual-language-selftest.mjs` — deterministic contract test.
- `demo/sign-display-proof.html` — zero-build visual proof page.
- `REFERENCE-LIVE-JWEB.md` — the live contracts this pack was built against.

Do not spend time redesigning this pack. Adapt names/import paths as required by the fresh live tree, preserve its semantic intent, and continue your primary task.
