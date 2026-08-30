# Streaming World Architecture

This file records the contracts that should survive the next major pickup of the project.
The shipping implementation is intentionally a single-player browser runtime. It contains no
speculative networking framework, but deterministic world identity and explicit ownership stay
separate from rendering so a later authoritative server does not require a world rewrite.

## Primary invariant

The world is never a boot phase.

Startup may block on exactly one logical unit: authored spawn chunk `0,0`. That chunk must be
complete enough for the normal runtime before the startup overlay leaves: visuals, collision,
interaction registrations, local optimization, and every regular control. Everything outside
`0,0` is permanent runtime streaming work selected around the current player.

There is one interactive runtime route: `/`. `/old/` is the regular portfolio/escape target.
There is deliberately no `/test/` or `/synchronous/` runtime to drift out of date.

## World identity

`world-contract.js` is renderer-independent and is the durable identity seam.

- `WORLD_FORMAT_VERSION` versions deterministic world identity.
- Chunk identity is integer-coordinate based and avoids 32-bit coordinate coercion.
- Stable IDs exist for chunks, chunk owners, ordinary entities, and singular entities.
- Scheduling order is not part of world identity.
- A chunk may be unloaded completely and regenerated later from the same seed/coordinate contract.

If procedural rules change incompatibly, bump the world format version rather than silently
changing the meaning of existing IDs.

## Singular authored world

World-singular content is confined to the authored spawn neighborhood around `(0,0)`:

- Art Gallery
- AS/400 Archive
- Justin Index
- Systems Workshop
- Lore Shrine
- one reserved `futurePlaceholder` area

`createSpawnSingularManifest()` records their stable identities. Chunk `0,0` is pinned while
the runtime is active, so the authored district stays resident while procedural chunks churn.
No generic chunk may manufacture another copy of a singular.

## Repeatable district landmarks

The infinite city also has disposable district landmarks. They are **not** singulars. Exactly one
landmark chunk is chosen deterministically per small macrocell (currently 3x3 chunks), yielding
recurring spires/stacks/gatehouses/archives/beacons without crowding every block. They unload,
regenerate, and retain the same stable identity like ordinary chunk content.

This is the correct place to add future non-unique visual anchors. Do not expand the singular
manifest merely because something is large or visually important.

## Chunk lifecycle

The streaming lifecycle is:

`PLANNED -> QUEUED -> BUILDING -> COMMITTING -> READY -> UNLOADING -> deleted`

Generic chunk construction happens off-scene. Commit is the atomic publication boundary: render
objects and owned physics become authoritative together. Unloading removes owned scene and physics
state, then the scheduler record itself is deleted. Queue/planned/failed metadata outside retention
is also pruned. Resident memory therefore depends on local retention distance, not distance traveled.

## Runtime loading policy

Control handoff does **not** reduce loader intensity. Once spawn is READY, the runtime continuously
maintains a local READY neighborhood:

- 5x5 render ring (`renderRadiusChunks = 2`);
- 7x7 warm prefetch ring (`prefetchRadiusChunks = 3`);
- larger retention ring only to prevent churn while crossing boundaries.

The browser keeps one cooperative multi-chunk pump in flight. Missing render-ring chunks get the
highest work budget, then prefetch chunks. Generation yields when the main-thread frame/input budget
requires it; there is no fixed 120 ms gap between chunks. Queue selection refreshes between chunks,
so a moving player pulls the stream with them. Current view/movement heading is a priority bias among
similarly-near chunks, never part of deterministic world identity.

Do not replace this with a whole-world loading phase.

## Ownership

A chunk owns what it creates. Chunk-owned render and physics data must be removable by owner ID.
Do not add future procedural features that can only be found by traversing the entire scene on
unload. If a new subsystem creates per-chunk state (audio, interactions, AI, particles, saves),
give it the same explicit owner lifecycle.

## Boundary contract

Adjacent procedural chunks independently derive matching road portals from shared boundary keys.
The four boundaries touching authored spawn are centered to line up with the spawn district's
cardinal gateways. New cross-chunk systems should follow the same rule: derive a shared contract
from coordinates, then let each chunk realize its own side.

Do not make one chunk's deterministic plan depend on which neighboring chunk happened to build first.

## Weirdness gradient

`worldWeirdnessAt()` is a permanent extension seam. It exposes a deterministic distance-from-spawn
trend from conventional near spawn toward increasingly strange far-world generation, plus a small
coordinate-stable local grain. Future architecture, signage, topology, props, physics oddities,
lore density, etc. can consume the same value without changing chunk identity or save addressing.

## Startup performance contract

The large archival noise corpora are not static startup imports. Spawn uses the compact bootstrap
corpus. Full noise data hydrates only after the normal runtime is already live and should affect only
future/unloaded work where practical.

Traversal audits and other QA checks are not startup gates. There is no whole-world static
optimization phase: procedural chunks optimize locally before READY; authored spawn is optimized
as its own startup chunk.

The startup GUI is observation + escape, not another gate: one unified fast terminal with stream
filters and one `Escape to regular website` link. Do not reintroduce a redundant "load/continue" button.

## Future multiplayer seam (deliberately minimal)

No multiplayer framework is implemented. Useful preparation already present is:

- deterministic/versioned world identity separate from render scheduling;
- stable chunk/entity/owner IDs;
- off-scene build separated from atomic client commit;
- explicit removable ownership;
- singular identity in a small manifest.

A future server can therefore become authoritative for descriptors/state/deltas without making
Three.js object identity the network protocol. Do not prematurely turn the current client into an
ECS or add network abstractions until there is an actual multiplayer design.

## Deliberately not implemented yet

- floating-origin/render-origin rebasing (identity is safe; renderer rebasing seam remains reserved);
- persistence of player-modified chunk deltas;
- server authority/network replication;
- infinite authored singular placement outside spawn.

These are extensions, not prerequisites for the shipping client.

## Post-handoff CPU policy

Generic infinite chunks are intentionally atomic off-scene builds. Do not add
`requestAnimationFrame`/idle sleeps inside the generic chunk factory merely to
make it "cooperative": a normal generic chunk is millisecond-scale work and
nested yielding can cost orders of magnitude more wall-clock time than the work
itself. The live world streamer owns the single scheduling budget and yields
only between complete chunks.

Current runtime policy keeps the local render ring urgent, then fills the
prefetch ring. A pump is bounded by both a chunk cap and a millisecond budget;
a fast client therefore builds several chunks per rendered frame while a slow
client naturally completes fewer. Visual and physics publication remain one
atomic commit per chunk.

## Render authority: one owner, no nesting

Infinite streamed roots carry `userData.worldChunkRoot = true` and
`userData.renderAuthority = 'WorldChunkStreamer'`. They are committed with the raw scene add
function, bypassing the authored-spawn `scene.add()` interception entirely. Both legacy static
optimizer variants also explicitly reject these roots as a defensive invariant.

For an infinite chunk, `READY` is published only after all of the following are true:

- the chunk root is attached directly to the real scene;
- world matrices have been updated after attachment;
- chunk-owned physics is registered;
- `WorldChunkStreamer` has applied the current render-ring visibility state;
- the READY verifier confirms no legacy `perf-chunk:*` group owns the root.

The streamer is therefore the sole visibility authority for infinite chunks. The legacy optimizer
remains a compatibility/performance system for authored spawn content only. Do not route streamed
roots back through it, even if a future feature uses ordinary `scene.add()` for other content.

## Non-structural network/adornment policy

Structural infinite chunks contain no `fetch`, `Image`, or GLTF dependency. Roads, ground,
buildings, walls, floors, stairs, ramps, collision, basic props, and repeatable district landmarks
are built entirely from resident geometry/materials and can reach READY offline.

All decorative model/photo loading is routed through one bounded priority queue. The queue starts
paused while spawn and the nearby structural world are being prepared. It is released only after
the current 7x7 structural prefetch neighborhood is READY, then uses a small concurrency cap and
re-evaluates spatial priority against the current camera before starting queued work. Failed assets
are marked failed after one attempt so they cannot create retry storms; structural world state is
unaffected.

Live Wikipedia poster enrichment is also deferred until the structural prefetch neighborhood is
warm. It is optional decoration, never a world-generation dependency.

## Scheduler API rule

There is one shipping chunk scheduler API: `createWorldChunkStreamer()`. The obsolete finite
`createWorldChunkScheduler()` compatibility wrapper was removed. Do not reintroduce a second
scheduler abstraction for streamed terrain; specialized producers should feed descriptors/payloads
into the streamer ownership lifecycle instead.
