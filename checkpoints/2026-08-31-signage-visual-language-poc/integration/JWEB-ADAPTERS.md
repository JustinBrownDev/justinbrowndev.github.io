# JWEB integration adapters — exact intended use

Live baseline used to author this pack: `main` @ `42586936fb89d9870fc0ab4f3acabe8207f253f8`.

This is not a replacement exterior planner. Keep Building Semantic Truth, frontage binding, Exterior Composition Authority, media assembly grouping, spatial claims, and the current streaming order.

## 1. Import the two modules

```js
import {
  recipeContextFromExteriorTask,
  recipeContextFromSemanticMedia,
  resolveDisplayRecipe,
} from '../content/sign-visual-language.js';
import { renderDisplayCanvas } from '../systems/sign-display-renderer.js';
```

Adjust relative paths only.

## 2. Existing semantic megascreen / billboard placements

The live media descriptor already carries `campaignKey`, `campaignSeed`, `semanticProgram`, `districtFamily`, `frontageRole`, `publicRole`, `landmark`, `assemblyKind`, title/subtitle/family/value, and each placement gets `mediaSegment.u0/u1`.

Where the megascreen Canvas texture is currently drawn, replace only the draw body:

```js
const media = placement.media;
const recipe = resolveDisplayRecipe(recipeContextFromSemanticMedia(media, placement));
renderDisplayCanvas(ctx, canvas.width, canvas.height, {
  recipe,
  title: media.title,
  subtitle: media.subtitle,
  family: media.family,
  value: media.value?.label,
  serial: media.id,
  segment: placement.mediaSegment,
});
```

**Do not render a separate full composition per corner face.** Passing `placement.mediaSegment` makes each face a viewport into one shared normalized composition. That is the proof-of-concept fix for “same billboard on both faces” instead of a true wraparound graphic.

## 3. Existing `world/signage.js` blade/facade signs

Do not delete geometry/brackets/lights. Replace only the Canvas texture drawing logic inside `addSign`.

Add an optional final argument:

```js
function addSign(x, y, z, rotY, title, subtitle, colorHex, flicker = false,
  widthOverride = null, shapeOverride = null, armLengthOverride = null,
  displayContext = null) {
```

Then:

```js
const recipe = resolveDisplayRecipe({
  ...(displayContext ?? {}),
  campaignKey: displayContext?.campaignKey ?? `legacy-sign:${title}:${subtitle}`,
  surfaceKind: 'blade-sign',
});

const tex = makePixelTexture((ctx, w, h) => {
  renderDisplayCanvas(ctx, w, h, {
    recipe,
    title,
    subtitle,
    family: displayContext?.family ?? 'JWEB',
    value: displayContext?.value ?? null,
    serial: displayContext?.serial ?? `${title}:${subtitle}`,
  });
}, shape.w, shape.h);
```

The consuming task should pass the task's existing `semanticContentContext` / district/building data when it has it. Legacy call sites can use the fallback and remain deterministic.

## 4. Exterior Composition tasks that are not semantic-media descriptors

Use:

```js
const recipe = resolveDisplayRecipe(recipeContextFromExteriorTask(task, {
  surfaceKind: task.semanticOpportunityRole ?? task.kind,
}));
```

Then send the existing content pair into the renderer. Do not create a new content generator.

## 5. Posters / flyers / stickers

Keep their existing geometry and content selection. Replace their fixed font/paper layout with the same resolver/renderer:

- poster -> `surfaceKind: 'poster'`
- flyer -> `surfaceKind: 'flyer'`
- sticker -> `surfaceKind: 'sticker'`

The same campaign can therefore appear as a megascreen, sign, poster, and sticker while retaining one dialect/palette but using surface-appropriate layout families.

## 6. Campaign consistency rule

Use existing `semanticContentContext.campaignKey` whenever present.

Fallback order:

1. `campaignKey`
2. frontage binding key
3. entity/building id
4. deterministic content identity

Never use `Math.random()` to choose a display recipe.

## 7. Performance rule

The POC is deliberately constant-cost:

- no GLTF/model loads
- no images required
- no shader
- no per-frame layout
- no DOM measurement
- no text corpus expansion
- no iterative semantic planner
- fixed small number of Canvas2D primitives
- deterministic recipe is resolved once when the texture is created

Cache Canvas textures exactly as current jweb signage does. Do not rerender every frame.

## 8. What NOT to change in a signage-adjacent task

Do not:

- replace Exterior Composition Authority;
- invent another district semantic system;
- alter spatial claims/reservations;
- change sign geometry merely to prove the visual language;
- add new 3D signage models;
- duplicate content generators;
- remove existing title/subtitle noise/content machinery;
- make corner faces independent campaigns;
- make every district a totally unrelated art style.

The proof is successful when the same existing sign boxes and screens read as materially different designed objects solely from cheap Canvas composition driven by existing semantics.
