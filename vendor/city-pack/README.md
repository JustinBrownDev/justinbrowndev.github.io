# Claude City Model Dump

**340 original low-poly GLB models** generated specifically for the JustinBrownDev Three.js city.

- glTF binary (`.glb`)
- meters / human scale (game eye height is ~1.65 m)
- Y-up
- model origin is intended at ground center unless `mount` says wall/roof/desk/etc.
- no image textures; PBR base-color materials only
- built from compact primitive meshes for web runtime use
- `manifest.json` includes dimensions, tags, mount type, collider suggestion and climbability
- `asset-catalog.js` is directly importable JavaScript metadata

## Counts

- `architecture`: 40
- `art_gallery`: 22
- `as400_archive`: 30
- `industrial`: 35
- `interior`: 35
- `rooftop`: 40
- `street`: 45
- `systems_workshop`: 28
- `trash_climbable`: 45
- `vegetation`: 20

## Important integration rule

Do **not** instantiate all 340 models at once. Treat this as a vocabulary. Load/cache by model ID, clone cached scenes, and use category/context weighted pools. Prefer instancing for repeated static props if the same GLB is used many times.

### Parkour / collision

Models tagged `climbable: true` are intended to participate in the game's height-aware surface/collider system. `trash_climbable/debris_ramp_*` are intentionally slope/ramp-like garbage terrain. Do not reduce all piles to one circular collider; use either compound simple colliders or derive a low-cost convex/box approximation.

### Materials

These assets intentionally avoid texture dependencies. Claude may remap/clone materials at runtime to fit the light-web/dark-web gradient and building maintenance state. Do not mutate a cached shared material globally unless that is intended.

### Signature buildings

`art_gallery`, `as400_archive`, and `systems_workshop` are explicitly intended to seed the authored landmarks. They are **props and modules**, not complete buildings. The landmark builders should still construct their own real, non-square floor plans and place these inside.

### Architectural pieces

`architecture/*` contains stairs, landings, ladders, fire escapes, catwalks, railings, awnings, portals, windows, and parapets. These should decorate/instantiate from the traversal geometry; they must not become a second independent collision truth.

## Quick loader pattern

```js
import {{ CLAUDE_CITY_ASSETS }} from './asset-catalog.js';

const byId = new Map(CLAUDE_CITY_ASSETS.map(a => [a.id, a]));
const cache = new Map();

async function loadCityAsset(id) {{
  if (cache.has(id)) return cache.get(id).clone(true);
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown asset ${{id}}`);
  const gltf = await new Promise((resolve, reject) => loader.load(def.file, resolve, undefined, reject));
  cache.set(id, gltf.scene);
  return gltf.scene.clone(true);
}}
```

## License/provenance

The GLB files in this zip are newly generated primitive geometry for this task and contain no downloaded third-party meshes or textures. `EXTERNAL_CC0_SOURCES.md` separately lists excellent third-party CC0 packs worth ingesting if more authored art is desired.
