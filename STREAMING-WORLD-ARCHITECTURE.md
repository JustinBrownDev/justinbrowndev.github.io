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

## Two-plane cavern invariant — Cut 16

The macro geometry is intentionally simple and must stay legible underneath procedural accumulation:

- The world is bounded by **two exact flat parallel planes**: a black lower plane and a white upper plane.
- The nominal plane separation is **34.02 m**, exactly 60% of the Cut 15 56.7 m separation. Do not manufacture richness by deforming either macro plane.
- Ground architecture grows upward. Ceiling architecture grows downward. **Growth direction is not gravity direction**: the player, camera, furniture, doors, rooms, stairs and props all remain in the one ordinary world-down gravity frame.
- The ceiling city is not a registered mirror of the ground city. It samples the **same deterministic infinite generator and world seed at one fixed far-away chunk phase** and rebases that sampled topology over the visible chunk. Neighboring ceiling chunks sample neighboring remote chunks so roads and compounds stay continuous without visibly repeating the lower topology.
- Ceiling compounds remain ordinary upright buildings internally. Their modules are top-aligned to the white macro-roof: every module roof shares the same ceiling datum, while each module keeps its own story depth and therefore terminates independently downward. No filler/root column is permitted merely to bridge a short module to the roof.
- The exposed low end of a ceiling compound receives a downward-facing roof/crown vocabulary. This is a boundary treatment, not a second inverted building engine.
- Opposing city fields reconcile **architectural claim volumes before realization**. Claims include conservative horizontal growth allowance and underside/crown reserve; a ceiling building is height-budgeted or omitted before geometry exists. Do not clip two finished buildings after collision.
- Ladders are a preferred vertical stitch through near-miss gaps. Ordinary stairs remain ordinary stairs.
- Structural color is a world-height composition: black near the lower plane, strongest color/visual density through the middle band, and white near the upper plane. This should preserve batching and must not require macro terrain deformation.
- The visual throughline is therefore: **simple computational macro geometry -> increasingly organic architectural generation -> granular authored/procedural detail**. The planes remain geometric; the mess comes from what grows off them.

## Ceiling module anchoring refinement — Cut 17

Cut 16 established the two-plane cavern but rooted a multi-module ceiling compound by translating the whole compound to the roof and filling the shorter module gaps. That produced broad gray root columns and erased the intended stalactite taper. Cut 17 replaces that approximation with **top-aligned module bands**:

- Every module in a ceiling compound owns its original story count. Its `floorBase` is `compoundMaxFloors - moduleFloors`, so every module roof lands on the same white plane while short modules terminate sooner downward.
- The fused compound is still translated once as one architectural owner; the per-module floor bases are part of the structural plan before shell realization, not a post-render mesh shift.
- Shared internal faces are evaluated in global/top-aligned floor bands. A short wing's local floor 0 therefore aligns with the corresponding upper floor of a taller neighbor instead of the taller neighbor's local floor 0.
- Ceiling compounds do **not** grow filler/root columns between a short module roof and the white plane. The white plane is the base datum itself; breadth is greatest there and the occupied mass tapers downward.
- The primary/tall module remains the Building Plan interior spine for this refinement. Side modules fuse through their overlapping structural floor bands; expanding the room allocator to multi-base modules is a separate authority change and must not weaken raster closure invariants.
- Every module's exposed low-end floor-0 slab publishes a `ceiling-building-tip` physics platform with zero support forgiveness. A rendered hanging tip may never be visual-only collision.
- Ordinary upward rooftop clutter/topper/antenna tasks stay suppressed on `ceilingRooted` entities. The only skyline treatment on the exposed end is the deliberately downward-facing low-end roof/crown vocabulary.

## Cavern circulation authority — Cut 19

Cut 19 turns cross-level circulation into an explicit hierarchy instead of treating every vertical connection as the same primitive:

- **Popular-node wall stairs** are the heavy, legible circulation trunks within each city field. Compounds are ranked from existing circulation evidence (bridge portals, scaffold landings, exterior street-layer routes, reservations, module/floor scale), and only the highest-ranked compounds receive extra trunks.
- At most two Cut-19 wall-stair trunks are added per field/chunk. The lower and ceiling fields are planned independently, so both sides of the cavern participate without saturating every facade.
- These trunks are chunky structural switchbacks: ramps, real step treads, landings, guards, support posts, semantic stair connectors, and a circulation reservation all derive from one accepted route. They hug one exterior wall and reverse direction along that facade rather than floating free in the cavern.
- Existing bridge/scaffold/circulation reservations have first refusal. A Cut-19 wall stair is rejected rather than overwriting a previously accepted route.
- **Ladders remain the cheap cross-cavern stitch.** A ladder is counted as one route, not as a number of rungs, and owns a shaft reservation plus a semantic ladder connector.
- A ladder may not visually pass through a hanging floor. Its upper mouth first carves the rendered low-end slab and the matching collision platform into a real rectangular hatch, then clears guard/rail collision at that mouth before rungs are emitted.
- The exposed hanging low-end roof treatment is edge-only trim. Full module-sized `invertedRoofRim` plates are retired; they read as detached gray slabs and have no architectural reason to exist.
- Frozen ceiling transport/scaffold authority records must be rebased into final world Y when ceiling geometry is translated. Routing metadata is invalid if it describes local-Y surfaces while collision/render geometry lives in world Y.

The resulting traversal hierarchy is: **interior stairs -> wall-hugging structural trunks -> elevated street/bridge/catwalk nodes -> carved ladder stitches -> opposite field**. Circulation geometry must continue to originate from reachable-node demand and publish reservations before later enrichment can occupy the same volume.

## Cut 21Q — Sectional circulation architecture

21Q moves sky circulation from a mostly fixed-floor local bridge feature into a sectional city system while preserving the hard physical contracts established by 21P1.

### Invariants

- **Catwalks and skybridges remain exterior geometry.** A blocked span is rejected by the existing solid-volume transport authority; 21Q does not reintroduce tunneling through unrelated buildings.
- **The canonical stair walkability kernel is unchanged.** Existing tread/riser/ramp/headroom/collision authority remains responsible for player movement. New stair/bridge architectural expression must wrap that kernel rather than replace it.
- **Bridge endpoints remain the shared facade authority.** The same endpoint records still own aperture, landing, slab endpoint and semantic-connector coordinates.
- **The world circulation graph remains proof, not intent.** 21Q introduces circulation-demand records above realization; physical semantic connectors and transport surfaces are still the reachability authority.

### Multi-band exterior circulation

`world/sectional-circulation.js` assigns bridge candidates to real elevation bands only after joint cavern height negotiation has established actual building capacities.

The vertical midpoint is a weighted attractor, not a clamp. Important/high-degree routes preferentially become wider collector or `sky-street` spans near the overlap-heavy middle of the cavern, while local/scenic routes retain upper and lower variation. This prevents both the old universal `floor = 1` behavior and a new equally-bad ceiling promenade.

Hanging towers use **depth from the ceiling** as the shared exchange authority. Modules with different occupied depths therefore use different local floor indices while resolving to the same physical world-height band. The shortest module path back to the primary circulation spine is deepened when required so an exchange door does not terminate in an isolated stalactite wing.

### Towers as transfer volumes

A compound that owns multiple exchange portals can now publish `jweb.circulation-demand.v1` records describing requested exchange → interior → exchange transfers, including vertical and facade-change requirements. These records do not fabricate reachability; they expose city-level intent that must be satisfied by the existing building circulation machinery and verified by the compiled world graph.

### Section archetypes

`world/cavern-joint-synthesis.js` v2 no longer treats every overlapping ground/hanging pair as a symmetric height-budget problem. Deterministic pair relationships now include:

- `upright-collector`
- `hanging-collector`
- `midsection-braid`
- `central-void`

Collector archetypes preferentially spend available section on one polarity; central-void relationships deliberately preserve more air. Independent near-span tower rolls also allow some upright and hanging masses to request almost the full available cavern depth, subject to the same joint safety negotiation.

### Bridge architecture is not bridge physics

`world/skybridge-architecture.js` adds large-form visual families around the canonical flat transport slab:

- simple guarded
- heavy beam
- utility frame
- covered gallery
- pony truss
- through-truss
- underslung arch

The visual family may add beams, frames, trusses, hangers, canopies and large portal frames. None of those parts become the player walking surface or replace canonical bridge collision. Wide sky streets are therefore free to become visually aggressive without destabilizing traversal.

### 21Q regression expectations

- several vertical bridge bands occur in a population;
- hanging exchanges do not collapse to the ceiling/top occupied band;
- the fattest bridge population is statistically biased toward the vertical midpoint;
- all large-form bridge families remain visual-only wrappers around canonical traversal;
- all four mixed-city section archetypes occur deterministically in a population;
- legacy endpoint, semantic-connector, cavern, hanging-floor and exterior-solid-volume safety tests continue to pass.
