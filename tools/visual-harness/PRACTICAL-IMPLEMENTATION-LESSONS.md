# JWEB VISUAL HARNESS — PRACTICAL IMPLEMENTATION HANDOFF

This is a fact/strategy dump from actually using the JWEB visual harness against current JWEB geometry.

This is **not** a speculative design document and it is **not** a request to rewrite the harness. These are the behaviors, workarounds, and operating patterns that actually worked while capturing real geometry failures.

The test targets were:

1. Skybridge/catwalk intersections where railings overlap and supports obstruct circulation.
2. Walls sticking through building envelopes/floors and creating near-coplanar/z-fighting conditions.
3. Internal trunk/compound staircases with bad step counts, railing relationships, placement, and landing relationships.
4. Jutting facade/wall geometry leaving vertical and interstory gaps without wanting to remove the intentional facade offset.

The harness successfully generated **137 screenshots** covering these cases from one deterministic JWEB chunk.

---

# 1. TEST THE HARNESS AGAINST THE CURRENT JWEB TREE, NOT AGAINST ITS OWN OLD SNAPSHOT

The harness snapshot and current JWEB source were not identical.

The useful strategy was:

- unpack the current JWEB source
- overlay/install the harness into a **temporary working copy**
- leave both supplied source ZIPs untouched
- run the harness against the newer generator/runtime

This matters because a visual harness can appear correct against the revision it was developed alongside while silently becoming irrelevant as the geometry generator moves.

For JWEB specifically, `main` is a moving target. The harness should therefore be treated as something that must attach cleanly to a current source tree rather than as a frozen world snapshot.

A good implementation goal is:

```text
CURRENT JWEB SOURCE
        +
HARNESS PACKAGE
        ↓
TEMPORARY TEST TREE
        ↓
HARNESS INTEGRATION TEST
        ↓
CAPTURES
```

Do not require a permanent merge simply to run diagnostics.

Do not mutate the input package just to test it.

---

# 2. RUN THE HARNESS CONTRACT TESTS BEFORE TRUSTING SCREENSHOTS

The harness integration test was genuinely useful.

On the tested current tree it reported:

```text
PASS

catalogTargets: 2881

stairMatches: 12
stairFragments: 6
stairTriangles: 1382
stairColliderProxies: 36

catwalkMatches: 9
```

Another stair fixture reported:

```text
stairTargets: 78
stairCatalog: 79
lowFlightVisualObjects: 30
lowFlightColliderObjects: 13
forkTargets: 6
exactStepTriangles: 12
```

And:

```text
PASS: visual harness lazy integration + specimen isolation contract
```

This was important because it separated:

```text
HARNESS CANNOT SEE JWEB
```

from:

```text
HARNESS CAN SEE JWEB BUT A PARTICULAR CAPTURE MODE IS FAILING
```

That distinction saved a lot of pointless debugging.

Before diagnosing screenshots, establish that:

- the target catalog exists
- target search works
- the current generator is discoverable
- isolation works
- visual objects are being discovered
- collider objects are being discovered
- semantic targets exist
- the expected object families actually appear in the generated chunk

A black screenshot should not immediately be interpreted as “WebGL is broken.”

---

# 3. DETERMINISM WAS ESSENTIAL

The successful test used:

```text
seed: 671278205
chunk: 0,0
```

This was a major part of making the harness useful.

Once an interesting bug was found, every subsequent capture pass could operate on the same generated world.

The identity chain should be preserved in manifests:

```text
seed
chunk
query
target/index
camera/view
context mode
render pass
```

That makes a screenshot a reproducible engineering artifact rather than a random visual example.

This is especially important for procedural geometry.

Never produce a diagnostic screenshot without enough metadata to recreate the generated specimen.

---

# 4. SEMANTIC TARGETING WORKED VERY WELL WHEN JWEB HAD REAL SEMANTIC IDENTITIES

The best harness experiences were:

```text
query: junction
```

and:

```text
query: compound-stair
```

Those led to meaningful architectural objects instead of random meshes.

For the stair case, `compound-stair` resolved closely enough to the actual vertical circulation assembly that isolated and world-context captures were immediately useful.

For the bridge case, a junction semantic target exposed an actual transport/circulation junction.

This is the desired UX:

```text
"compound-stair"
        ↓
actual stair assembly
        ↓
isolated + contextual diagnostic pictures
```

NOT:

```text
search random mesh names
try index 0
try index 1
try index 2
try index 3
...
```

The most important long-term observation from using the harness is that **harness quality depends heavily on JWEB object identity quality**.

The renderer is not the hard part.

The valuable thing is being able to say:

```text
junction
compound-stair
guarded-catwalk
facade-jut
floor-slab-edge
interstory-seam
exterior-wall-segment
stair-landing
stair-guard
```

and have those mean real generated architectural structures.

---

# 5. GENERIC BUILDING WALL GEOMETRY WAS MUCH HARDER TO TARGET

The wall/floor problems exposed the weakest current area.

The available useful family was roughly generic building-plan/partition/`mazeWalls` geometry.

That was enough to find the bug, but it required index hunting.

That means the harness technically worked, but the abstraction feeding it was poor.

For envelope bugs, implementation models should strongly prefer improving metadata/ownership such that geometry can carry identities like:

```text
building-id
floor-id
room-id

exterior-wall
interior-partition
floor-slab
ceiling
facade-jut
facade-closure
floor-edge
interstory-seam
parapet
portal-wall
shell-piece
```

Useful relationship metadata would be even better:

```text
ownerBuilding
ownerFloor
adjacentFloorAbove
adjacentFloorBelow
connectedFacade
generatedFromPlanSegment
closureForOffset
```

The goal is not to create hundreds of decorative labels.

The goal is to expose the **real construction topology** the generator already knows.

The harness becomes dramatically more powerful when it can use those identities.

---

# 6. WORLD CONTEXT AND ISOLATION ARE BOTH NECESSARY

One of the strongest things about the current harness is that it can show both:

```text
ISOLATED TARGET
```

and:

```text
TARGET IN WORLD CONTEXT
```

These solve different problems.

## Isolation answers:

```text
What geometry actually belongs to this assembly?
```

It is very good for:

- stair tread relationships
- railing topology
- collider relationships
- junction members
- weird extra components
- duplicated pieces
- structural decomposition

## World context answers:

```text
Why is this geometry wrong in the building/city?
```

It is very good for:

- wall sticking outside a building
- floor gaps visible through facades
- bridge supports blocking the walking route
- stair placement relative to floor openings
- junction geometry intruding into circulation
- exterior appearance

Do not choose one.

A good bug preset should usually emit both.

---

# 7. A REAL VISIBILITY-STATE BUG WAS DISCOVERED IN WORLD-CONTEXT CAPTURE

The first target-selected world-context capture came out black.

This was not a renderer failure.

The actual cause was that the specimen/isolation path had hidden the generated payload root so that the selected object could be shown alone.

Then `worldContext: true` tried to photograph the world while that world root was still hidden.

So the sequence was effectively:

```text
select target
↓
specimen system hides main generated root
↓
show isolated specimen
↓
ask for world context
↓
world is still hidden
↓
black context frame
```

What worked was to reload/use the generator specimen **without the preselected isolated target**, leaving the world root visible, and then perform the context capture.

The correct permanent principle is:

> Capture modes must establish the visibility state they require themselves and restore the previous state afterward.

For example:

```js
const previousVisibility = snapshotVisibility();

try {
    establishWorldContextVisibility();
    renderWorldContext();
} finally {
    restoreVisibility(previousVisibility);
}
```

and similarly:

```js
const previousVisibility = snapshotVisibility();

try {
    establishIsolationVisibility(target);
    renderIsolated();
} finally {
    restoreVisibility(previousVisibility);
}
```

A capture mode should not depend on whatever display mode happened to run immediately before it.

This is a real implementation lesson from the test drive.

---

# 8. DO NOT ASSUME A BLACK FRAME MEANS WEBGL FAILED

During testing, WebGL itself was functioning.

The initial full-world/browser boot also failed to become probe-ready inside the first expected window.

That could easily have sent debugging in the wrong direction.

The useful debugging order was:

```text
1. Is the module graph alive?
2. Does THREE/WebGL render at all?
3. Did the harness integration test pass?
4. Is the scene populated?
5. Is the relevant root visible?
6. Is the selected target visible?
7. Is the camera actually pointed at valid bounds?
8. Only then blame the renderer.
```

The black world-context frame was a visibility-state issue, not a graphics-stack issue.

Keep these layers separate.

---

# 9. THE BROWSER ENVIRONMENT SHOULD NOT OWN THE HARNESS ARCHITECTURE

The test execution environment blocked normal Chromium URL navigation through administrative policy.

The useful workaround was **not** to fake JWEB or create substitute geometry.

Instead, the same JWEB ES-module graph was loaded directly into an allowed blank Chromium document using an import map.

The actual components remained:

```text
current JWEB generator
current JWEB modules
THREE renderer
visual harness code
```

The only thing bypassed was normal browser navigation.

That demonstrated an important architectural property:

> The harness is strongest when its core is callable independently of the site's normal navigation/bootstrap ceremony.

Keep the harness logic modular enough that it can run from:

- the normal site
- a specimen page
- a blank diagnostic document
- an automated browser
- eventually a CLI/browser-runner wrapper

without rewriting the capture engine.

The harness should depend on the scene/generator contract, not on the exact URL the browser loaded.

---

# 10. MULTIPLE CAMERA ANGLES WERE NOT REDUNDANT

The useful canonical set was:

```text
ISO
FRONT
RIGHT
TOP
```

Different bugs became obvious from different views.

Examples:

## Skybridge intersection

ISO showed overall congestion.

TOP made intersecting rail/support placement much easier to understand.

## Wall/floor intersection

FRONT exposed the floor boundaries and narrow intersecting bands.

ISO exposed walls projecting out of the shell.

## Internal stair

RIGHT was particularly effective at showing:

- sparse/wonky tread sequence
- railing relationship
- landing relationship
- roof/floor opening relationship

## Facade/floor gap

FRONT and RIGHT showed exterior gaps much more clearly than ISO alone.

Therefore:

> Do not optimize the harness down to one “smart” camera too early.

A small deterministic orthographic/canonical camera family is cheap relative to the diagnostic value.

---

# 11. THE DIAGNOSTIC PASSES WERE ACTUALLY USEFUL

The full capture sets used variants including:

```text
beauty
beauty + Sobel/edge
wireframe
instance-id
collider
semantic
visual-collider-overlay
```

The strongest practical passes were:

## Beauty

Necessary for seeing the actual bug as the player sees the geometry.

## Wireframe

Useful when a visually solid blob needs to be understood as intersecting pieces.

## Collider

Useful for determining whether an obstruction is merely visual or physically authoritative.

## Visual + collider overlay

One of the most useful modes during the test.

For the skybridge junction especially, the overlay made it clear that the congestion involved multiple geometric/authority layers rather than one decorative railing accidentally sticking out.

## Semantic

Potentially extremely strong, but only as useful as the semantic identities JWEB exposes.

## Instance ID

Useful for distinguishing merged-looking pieces and eventually tracing an object back to generated ownership.

The harness should preserve these as factual diagnostic views.

They are not merely visual effects.

---

# 12. SUPPORT BOTH "BEAUTY CONTEXT" AND "DIAGNOSTIC ISOLATION"

A useful capture preset does not have to run every expensive pass against the entire world.

The successful pattern naturally points toward:

```text
WORLD CONTEXT
    beauty
    maybe target highlight

ISOLATED
    beauty
    wireframe
    collider
    semantic
    instance ID
    visual/collider overlay
```

This is a good cost/value compromise.

Whole-world semantic/ID diagnostic renders can become expensive and cluttered.

The isolated target is where detailed pass decomposition is most useful.

---

# 13. SPATIAL AABB SELECTION ALONE IS NOT ENOUGH FOR "RELATED GEOMETRY"

One thing that became obvious while inspecting targets:

Selecting everything intersecting a padded bounding box can include giant unrelated or only incidentally intersecting batched geometry.

This can create bizarre clipped planes/fins and make the isolated specimen difficult to interpret.

What is needed is a distinction between:

```text
SPATIALLY NEAR
```

and:

```text
STRUCTURALLY RELATED
```

The future harness should be able to capture a **connected neighborhood**.

For example, given a stair:

```text
compound stair
├─ flights
├─ treads
├─ landings
├─ guard rails
├─ stair opening
├─ supporting floor slab
├─ associated colliders
└─ owning building/floor
```

Given a skybridge junction:

```text
junction
├─ incoming walkway A
├─ incoming walkway B
├─ junction deck
├─ guards
├─ supports
├─ throat/landing
└─ circulation colliders
```

This is much better than:

```text
everything touching a box expanded by 2 meters
```

AABB neighborhood selection is still useful as a fallback.

It should not be the primary relationship model.

---

# 14. THE SKYBRIDGE FAILURE LOOKED LIKE INDEPENDENT AUTHORITIES SUPERIMPOSED

The actual captures were useful because they showed the intersection problem is not simply:

```text
bad railing coordinates
```

The junction reads more like several individually reasonable generators are contributing geometry into the same volume without a final junction-resolution authority.

Observed symptoms:

- rail runs overlap
- rail runs continue into the junction instead of terminating/resolving
- supports occupy walking space
- support geometry does not read as structurally believable for the junction
- multiple generated authorities share the same small circulation volume

This suggests an implementation strategy for the geometry model:

> Junctions should be resolved as explicit assemblies with local authority over guard termination, walkway throat, support exclusion, and clearance.

Do not let each incoming bridge independently finish itself all the way through the intersection.

Conceptually:

```text
incoming bridge A ----\
                       \
                        [ JUNCTION AUTHORITY ]
                       /
incoming bridge B ----/
```

The junction should be able to say:

```text
rails terminate here
rails resume here
this rectangle is protected walking clearance
no supports may occupy this volume
support topology is chosen for the combined junction
```

The harness did a good job revealing the need for that authority.

---

# 15. WALL/FLOOR BUGS NEED GEOMETRIC OWNERSHIP, NOT JUST VISUAL TWEAKS

The captures showed wall planes/fins:

- extending beyond the expected building shell
- intersecting floor/slab geometry
- creating narrow coplanar or near-coplanar bands
- appearing through floor boundaries

A still screenshot cannot prove animation-time flicker.

But it can prove the geometric precondition for z-fighting:

```text
two surfaces occupy essentially the same depth region
```

or:

```text
one surface physically crosses another where it should terminate
```

Implementation models should therefore first inspect:

```text
wall vertical extents
floor slab extents
wall termination rules
shell clipping
floor ownership
wall ownership
epsilon offsets
whether duplicate shell/partition surfaces coexist
```

Do not immediately solve this by adding random render-depth offsets.

If the geometry genuinely penetrates the floor, fix geometry authority first.

---

# 16. THE FACADE-JUT BUG SHOULD BE SOLVED WITH CLOSURE GEOMETRY, NOT BY REMOVING THE JUT

A key constraint from the actual bug:

> The slight wall/facade projection is intentional. Do not flatten the building simply to remove the gap.

The captures showed the relationship:

```text
wall/facade plane shifts outward
floor/slab/shell continues on a different plane
no geometry closes the difference
↓
visible vertical/horizontal reveal
```

The appropriate conceptual fix is:

```text
OFFSET/JUT
+
CLOSURE/FILL GEOMETRY
```

not:

```text
REMOVE OFFSET
```

Useful concepts to introduce explicitly:

```text
facade transition closure
interstory closure
floor-edge closure
offset return
vertical return
horizontal reveal fill
shell continuity piece
```

The generator should be able to preserve articulation while maintaining a watertight/visually continuous envelope where intended.

---

# 17. THE COMPOUND STAIR TARGET WAS A GREAT EXAMPLE OF WHY SEMANTIC ASSEMBLIES MATTER

The stair captures made several things visible at once:

- tread count/density feels wrong for the distance traveled
- tread sequence can look disconnected/sparse
- railings do not consistently follow the tread/landing geometry
- stair placement relative to openings is awkward
- individual components do not read as one designed staircase

The important implementation lesson is:

> A stair should be generated as a constrained architectural assembly, not as several loosely related procedural decorations.

Ideally one stair plan determines:

```text
start landing
end landing
rise
run
headroom
number of risers
number of treads
tread depth
riser height
flight count
turn direction
landing dimensions
guard paths
handrail paths
open-side rules
floor opening
collision/walkability
```

Then visuals and colliders consume the same plan.

The harness becomes especially useful if it can target that shared stair-plan identity.

---

# 18. TEMPORAL BUGS REQUIRE TEMPORAL CAPTURE

The wall z-fighting case exposed a hard limitation of still screenshots.

A static image can show:

```text
surfaces intersect
surfaces are suspiciously close
coplanar bands exist
```

but cannot directly show:

```text
this surface flickers back and forth while the camera moves
```

A valuable future mode would be:

```text
TEMPORAL BURST
```

Example:

```text
frame 0: camera at x
frame 1: camera x + 0.002
frame 2: camera x + 0.004
frame 3: camera x + 0.006
...
```

Then output:

```text
raw frames
difference image
per-pixel variance
possibly max/min composite
```

This would be extremely valuable for:

- z-fighting
- LOD popping
- disappearing geometry
- unstable sorting
- temporal culling
- camera-dependent seams

It should be deterministic.

---

# 19. A PLAYER-EYE VIEW WOULD COMPLEMENT ENGINEERING CAMERAS

ISO/front/right/top were useful for understanding construction.

But the harness should eventually also answer:

```text
What does the player actually experience here?
```

For circulation bugs especially, add a view approximately:

```text
eye height: human
position: nearest walkable surface
heading: along expected circulation path toward target
```

This would immediately show:

- whether a support blocks traffic
- whether a railing intrudes into walking space
- whether a stair is visually navigable
- whether a wall gap is obvious at human scale

Do not replace canonical geometry cameras.

Add player-eye as another evidence mode.

---

# 20. WORLD-CONTEXT SHOTS NEED AN OPTIONAL TARGET MARKER

Dense JWEB scenes make it hard to tell exactly which object a context screenshot is about.

A cheap improvement:

```text
optional bounds box
optional outline
optional crosshair
optional translucent highlight
```

This does not need to be pretty.

It just needs to answer:

```text
THIS is the target described by the manifest.
```

Keep an unmarked beauty shot too.

---

# 21. DECOMPOSITION CAN EXPLODE IN COST

A modest decomposition stress check was attempted on the compound stair:

```text
maxParts: 8
views:
  iso
  right

passes:
  beauty
  wireframe
  collider
  semantic

resolution:
  1000x720
```

In the container/X11/software-WebGL-ish execution path, this saturated Chromium's GPU process and did not finish within five minutes.

The attempt was aborted.

Important interpretation:

- this does **not** prove it is equally slow on a normal desktop GPU
- it **does** prove the harness can accidentally request a much larger render workload than is obvious from the API call

Therefore decomposition should expose:

```text
estimated images
estimated passes
estimated part count
progress
cancel
maxParts
maxViews
maxPasses
possibly a pixel/render budget
```

For example, before rendering:

```text
8 parts
x 2 views
x 4 passes
= 64 images
```

Make that explicit.

Prefer failing/limiting safely over silently starting a huge capture job.

---

# 22. CHEAP CAPTURE PRESETS ARE MORE USEFUL THAN GIANT UNIVERSAL CAPTURES

A good workflow emerged naturally:

## Fast bug capture

```text
world beauty:
    iso
    front/right/top as applicable

isolated:
    beauty
    wireframe
    visual/collider overlay
```

## Deep diagnostic capture

Only when needed:

```text
instance ID
semantic
collider-only
Sobel
decomposition
additional views
```

This keeps everyday use fast.

The harness becomes valuable when someone can afford to run it casually.

---

# 23. EXPORT SHOULD NOT DEPEND ON MANUAL BROWSER DOWNLOADS

The useful workflow pulled the generated PNGs/manifests directly back into the test process instead of forcing browser-download interaction for every image.

That is the direction the harness should preserve.

The capture API should conceptually return/write:

```text
capture result
├─ manifest
├─ screenshots
└─ metadata/index
```

Automated operation should be a first-class path.

A future wrapper should be able to say something approximately like:

```text
seed=671278205
chunk=0,0
query=compound-stair
index=0
preset=bug
```

and receive a deterministic directory.

---

# 24. FLAT FLIPBOOK EXPORT WAS EXTREMELY PRACTICAL

The raw harness output is appropriately structured by:

```text
capture set
target
view
pass
```

That is useful for machines.

It is annoying for rapidly looking through pictures.

The practical package therefore kept both:

```text
RAW_CAPTURES/
```

and:

```text
FLIPBOOK/
```

The flipbook contained every PNG in one flat directory with names like:

```text
001__BUG1_SKYBRIDGE__...
002__BUG1_SKYBRIDGE__...
003__BUG1_SKYBRIDGE__...
...
137__BUG4_WALL_FLOOR_GAPS__...
```

This meant Windows Photos could simply move next/previous through the entire diagnostic session.

Keep this idea.

Machine organization and human visual review have different optimal layouts.

There was also a:

```text
CAPTURE_INDEX.csv
```

mapping each flat filename back to the raw capture source.

That is a cheap and useful bridge between the two.

---

# 25. KEEP KNOWN BAD HARNESS OUTPUTS, BUT LABEL THEM

The original skybridge world-context attempt contained black frames due to the visibility-state bug.

Rather than silently pretending the failure never occurred, those images were retained and renamed with an explicit marker:

```text
KNOWN_FIRST_RUN_VISIBILITY_FAILURE_BLACK
```

This is a good testing practice.

When evaluating the harness itself, a failure is evidence.

Do not mix known harness failures with valid bug evidence without labeling them.

Do not silently delete every failure and then conclude the tool is perfect.

---

# 26. VALIDATE THE OUTPUT PACKAGE PROGRAMMATICALLY

Before calling the test drive complete, the package was checked for:

- every capture summary's expected files existing
- capture count matching manifest count
- every flat flipbook entry existing
- all PNG files being structurally readable
- expected image count
- expected best-example count
- ZIP integrity
- SHA-256

Final verified facts:

```text
FLIPBOOK PNG count: 137
bad PNGs: 0

BEST_EXAMPLES PNG count: 12

ZIP integrity:
PASS

ZIP size:
~20 MB
```

This matters because visual harnesses tend to generate lots of files, and partial/failed browser exports can otherwise go unnoticed.

The harness/export wrapper should consider its job unfinished until the artifact set is internally consistent.

---

# 27. KEEP INPUT HASHES WITH A TEST DRIVE

The package recorded SHA-256 hashes of the source inputs.

This is useful because JWEB changes quickly.

Months later, a screenshot can otherwise become ambiguous:

```text
Which version of JWEB generated this?
Which harness snapshot generated this?
```

At minimum capture:

```text
source commit if available
source package SHA
harness version/SHA
seed
chunk
capture configuration
```

Reproducibility is disproportionately valuable for procedural bugs.

---

# 28. THE BEST FUTURE ARCHITECTURE IS "QUERY AN ARCHITECTURAL GRAPH, THEN RENDER"

The test drive suggests that the long-term high-value architecture is not:

```text
mesh inspector
```

It is closer to:

```text
ARCHITECTURAL / CIRCULATION / OWNERSHIP GRAPH
                 ↓
            query target
                 ↓
      choose structural neighborhood
                 ↓
       collect visuals/colliders
                 ↓
          diagnostic renderer
```

The renderer already works.

The hardest questions are:

```text
What is this object?
Who owns it?
What assembly is it part of?
What should be adjacent to it?
What is its circulation role?
What floor/building does it belong to?
Which collider corresponds to which visual?
```

Improving those answers makes the harness better without needing lots of graphics work.

---

# 29. TARGET IDs SHOULD SURVIVE FROM PLAN → GEOMETRY → COLLIDER → HARNESS

The ideal lineage is:

```text
procedural architectural plan object
            ↓
semantic assembly ID
            ↓
visual geometry
            ↓
collider geometry
            ↓
harness catalog entry
            ↓
screenshot manifest
```

For example:

```text
stair:building-184:floor-5-to-6:core-A
```

could connect:

- planning data
- treads
- landing
- railings
- opening
- collision proxies
- circulation graph edge
- screenshots

That would let an implementation model move directly from:

```text
this screenshot shows a bad railing
```

to:

```text
this railing came from stair plan X and guard generator Y
```

That is much more valuable than guessing from mesh coordinates.

---

# 30. DON'T OVERDEVELOP THE HARNESS BEFORE USING IT

One of the strongest lessons from this session is procedural.

The user explicitly asked to **test drive** the harness instead of extending it.

That was correct.

Actually using it immediately revealed things that would have been hard to prioritize from code inspection alone:

- semantic stair targeting is already good
- semantic junction targeting is already good
- building-envelope identity is weak
- isolation/context visibility state leaks
- temporal capture is needed for flicker
- decomposition has dangerous cost scaling
- flat screenshot review is useful
- context + isolated output is worth preserving
- collider overlay is high-value
- target marker would help dense scenes

This is much better information than another speculative feature-development pass.

The development loop should stay:

```text
BUILD SMALL CAPABILITY
↓
USE IT ON REAL JWEB BUGS
↓
NOTICE FRICTION
↓
FIX ONLY HIGH-VALUE FRICTION
↓
USE AGAIN
```

not:

```text
BUILD EVERY POSSIBLE DEBUG FEATURE FIRST
```

---

# 31. PRACTICAL PRIORITY ORDER FROM THIS TEST

If improving the harness after this test, the order I would use is approximately:

## Tier 1 — highest leverage

1. Make world-context visibility completely capture-owned and state-safe.
2. Improve semantic identities for building shell/floor/facade geometry.
3. Add connected-assembly/neighborhood selection using ownership relationships.
4. Make deterministic batch capture cheap to invoke.

## Tier 2

5. Add player-eye/approach camera.
6. Add optional target marker in context.
7. Add short deterministic temporal burst for z-fighting.

## Tier 3

8. Improve decomposition progress/cancel/cost guards.
9. More sophisticated filters/passes only when real bugs demonstrate a need.

Do not spend a large development cycle inventing image-processing modes while basic target identity remains weak.

---

# 32. SHORT VERSION OF WHAT ACTUALLY WORKED

If an implementation model only retains a few facts, retain these:

```text
1. Overlay the harness onto CURRENT JWEB, not an old frozen snapshot.

2. Run catalog/isolation integration tests before trusting screenshots.

3. Deterministic seed + chunk + target identity is essential.

4. Semantic queries like `compound-stair` and `junction` worked extremely well.

5. Building-wall bugs were harder because `mazeWalls`/generic partitions lack useful architectural identity.

6. Always capture BOTH world context and isolated geometry.

7. World-context capture must establish/restore its own visibility state.
   A hidden specimen root caused real black captures.

8. Canonical ISO/front/right/top views are all useful; don't prematurely reduce them to one camera.

9. Visual/collider overlay was one of the highest-value diagnostic modes.

10. Structural relationships are better than padded-AABB neighborhood selection.

11. Still frames can expose z-fight geometry but cannot prove temporal flicker.
    Add deterministic frame-burst/difference capture later.

12. Decomposition multiplies cost very quickly.
    Add cost estimation/progress/cancel/caps.

13. Keep raw structured output AND a numbered flat FLIPBOOK directory.

14. Validate every PNG/manifest and ZIP before handing the result off.

15. The harness's biggest future multiplier is better JWEB architectural metadata,
    not a fancier renderer.
```

---

# BOTTOM-LINE IMPLEMENTATION PRINCIPLE

The successful test changed the framing of the tool.

The harness should not primarily become a sophisticated screenshot generator.

It should become a **deterministic architectural interrogator**.

Given:

```text
seed + chunk + "compound-stair"
```

or:

```text
seed + chunk + "junction"
```

it should be able to answer visually and structurally:

```text
What is it?
Where is it?
What owns it?
What connects to it?
What geometry belongs to it?
What colliders belong to it?
What does it look like alone?
What does it look like in the world?
What does the player see?
What exact generated identities created it?
```

The actual rendering machinery is already far enough along to be useful.

The next large gains come from making JWEB's procedural architecture legible to the harness.