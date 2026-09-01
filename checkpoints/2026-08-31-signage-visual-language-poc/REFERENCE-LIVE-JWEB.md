# Live JWEB contracts used by this pack

Repository: `JustinBrownDev/justinbrowndev.github.io`

Baseline inspected: `main` @ `42586936fb89d9870fc0ab4f3acabe8207f253f8` (`diag: stress signage visibility`).

## Existing style bottleneck

`content/text-style.js` currently exposes small shared arrays of fonts, sign shapes, paper/ink colors, and near-black sign backings. `world/signage.js::addSign()` chooses a shape/font/backing/border and then largely draws centered title/subtitle copy. The pack intentionally replaces only this low-cost graphic-composition layer.

## Existing semantic contract — do not duplicate it

`world/exterior-composition-authority.js::requestContract()` already derives content context from frontage binding and carries:

- building semantic truth id;
- style/program preference;
- frontage binding;
- `contentContext`;
- semantic program;
- semantic destination;
- frontage role;
- public role.

`annotateTaskContract()` places these back onto exterior tasks as `semanticContentContext`, `semanticProgram`, `semanticDestinationId`, building truth id, semantic opportunity role, etc.

## Existing semantic-media contract — ideal POC integration point

`attachSpectacleMedia()` already emits one media descriptor per assembly with:

- `campaignSeed` / `contentSeed`;
- `campaignKey`;
- title / subtitle / family / value;
- entity / host building id;
- building semantic truth id;
- building plan identity/fingerprint;
- semantic program / destination;
- district id / district family;
- frontage binding key / frontage role / public role;
- landmark flag;
- assembly kind;
- surface ids;
- layout metadata.

Every physical placement in a multi-surface assembly gets `mediaSegment` with:

- `index` / `count`;
- `span`;
- normalized `u0` / `u1`;
- continuation-before / continuation-after flags.

That means true wraparound graphic composition requires no new geometry and no new semantic planner: render one normalized design and treat each face as a viewport from `u0` to `u1`.

## Compatibility doctrine

This POC sits downstream of semantic planning:

`existing semantic truth -> cheap display vectors -> campaign dialect -> surface layout -> Canvas2D texture`

It must not become:

`another signage planner -> another semantic truth -> another geometry generator`.
