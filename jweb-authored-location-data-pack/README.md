# JWEB authored location data pack - spearhead

This is **content**, not a runtime patch.

It assumes the infrastructure/supercut underneath it will continue moving. Nothing here imports Three.js, `QP`, fabric code, placement code, or current builders. Another integration pass can hold these files against the eventual runtime.

## What is new

### 1. The first real authored progressive location

`locations/spawn-rooftop-reality-leak.json` fully describes the rooftop spawn as an authored **memory** rather than a prefab.

The invariant is emotional/semantic: safe rooftop refuge, live-news television, recent human presence, warm/cool light split, believable roof machinery, visible giant vacuum-tube landmark, and a clear descent into the city.

The evidence varies. A seed can choose a motel CRT on cinderblocks with a lawn chair and green wine bottle, or an office monitor on a filing cabinet with a car seat and thermos, without losing the place's identity.

### 2. A dedicated spawn asset corpus

`assets/spawnpoint-asset-families.json` contains small buildable asset chunks: televisions, support surfaces, seating, soft goods, bottles/drinks, ash/snack clutter, personal residue, lights, power/cables, roof utilities, small electronics, plants, and multiple fictionalized giant vacuum-tube landmark silhouettes.

The recipes are deliberately abstract primitive descriptions. The eventual renderer may realize them with cheap geometry first, richer procedural geometry later, or selected GLBs without changing semantic identity.

### 3. The old singular landmarks are now location data

The six legacy singular concepts are represented separately under `locations/singular/` so they can survive retirement of the bespoke builder:

- Art Gallery
- AS/400 Archive
- Records / Justin Index
- Systems Workshop
- Lore Museum
- intentionally empty future reserved site

The data captures rooms, required beats, real content, variation boundaries, and progressive priorities rather than old coordinates or builder calls.

### 4. Generated places are the same kind of thing

`locations/generated/generated-location-families.json` defines recurring exterior/location families and explicitly treats the existing semantic room-recipe corpus as already data-native.

The end state should have **one conceptual model for places**. `singular` means the world guarantees identity/placement; it does not mean a separate geometry engine.

## Integration doctrine

- Fabric truth wins.
- Connectors own circulation/apertures.
- Location data consumes spaces and reservations; it does not invent topology.
- Required beats beat exact props.
- Progressive realization may replace proxies; semantic identity may not move.
- External live media never blocks generation or boot.
- Do not “port” legacy builders line-for-line. Consume the location data and let the new runtime realize it.

## The spawn test

Generate several seeds and take screenshots from the arrival zone.

They should clearly be **different arrangements**.

They should also be obviously **the same remembered place**.

If object-for-object sameness is required to recognize it, the authored grammar is too weak. If the location becomes unrecognizable when the chair or TV model changes, the integrator has implemented a prefab instead of an authored procedural place.
