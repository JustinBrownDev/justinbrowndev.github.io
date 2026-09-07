// JWEB target-report collectors.
//
// One collector per "thing you can point at in the world" (a TV, an
// intersection, a roof topper, a trash can, ...). Each collector returns the
// SAME shape (see `section()` below) so the renderer and the paste-back
// record are identical regardless of what kind of target it is.
//
// Ownership: this is read-only dev tooling. It imports real JWEB source
// modules to read real data; it never edits or drives the live world.
//
// mode:
//   'fast' - isolated. No full city/chunk streaming. Either a static catalog
//            lookup or a synthetic/minimal fixture that exercises the real
//            function in isolation (same idea as visual-harness's
//            fixture/generator specimen modes).
//   'slow' - full generation. Real surfaces/placements as they'd occur
//            inside an actual streamed chunk. Where that requires a
//            browser/world-streamer context this pass doesn't automate yet,
//            the section is marked 'pending' with the exact command to
//            produce it by hand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureSpecimen, captureWorldInvestigation } from '../visual-harness/capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

function repoPath(...parts) {
    return path.resolve(REPO, ...parts);
}

function readJson(relPath) {
    return JSON.parse(fs.readFileSync(repoPath(relPath), 'utf8'));
}

async function importRepo(relPath) {
    return import(fileURLToPath(new URL(path.relative(HERE, repoPath(relPath)).split(path.sep).join('/'), import.meta.url)));
}

// section() keeps every collector honest about what's real vs. not yet wired.
function section({ key, title, status, data = null, sourceRefs = [], reproCommand = null, notes = null }) {
    if (!['real', 'pending', 'not-applicable'].includes(status)) {
        throw new Error(`bad section status for ${key}: ${status}`);
    }
    return { key, title, status, data, sourceRefs, reproCommand, notes };
}

const VISUAL_CAPTURE_TITLE = 'Visual capture (beauty / silhouette / depth / normals / object-id / instance-id / collider / semantic)';

// Actually drives headless Chrome (tools/visual-harness/capture.mjs). Real
// success -> status 'real' with the files it wrote. Real failure (no match,
// page error, timeout) -> status 'pending' with the exact error message and
// a manual fallback command - never fake a result either way.
async function attemptVisualCapture({ mode, kind, params, outDir, fallbackReproCommand, fallbackNotes }) {
    const dir = path.join(outDir, 'visual');
    try {
        const result = kind === 'specimen'
            ? await captureSpecimen({ ...params, outDir: dir })
            : await captureWorldInvestigation({ ...params, outDir: dir });
        return section({
            key: 'visual-capture',
            title: VISUAL_CAPTURE_TITLE,
            status: 'real',
            data: { fileCount: result.files.length, files: result.files, manifestSchema: result.manifest?.schema ?? null },
            sourceRefs: ['tools/visual-harness/capture.mjs', 'tools/visual-harness/headless-driver.mjs'],
            notes: `Captured live via headless Chrome (${kind}, ${mode} mode). Image files are written under visual/ next to this report (manifest.json alongside them) - not embedded in this record to keep it pasteable.`,
        });
    } catch (err) {
        return section({
            key: 'visual-capture',
            title: VISUAL_CAPTURE_TITLE,
            status: 'pending',
            sourceRefs: ['tools/visual-harness/capture.mjs'],
            reproCommand: fallbackReproCommand,
            notes: `Automated headless-Chrome attempt failed: ${err.message}${fallbackNotes ? ` — ${fallbackNotes}` : ''} Run the command above by hand, or adjust seed/chunk/query and retry.`,
        });
    }
}

// ---------------------------------------------------------------------
// 1. TV in spawn
// ---------------------------------------------------------------------
async function collectSpawnTv(mode, outDir) {
    const families = readJson('jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json');
    const tvFamily = families.families.find(f => f.id === 'spawn.media.television');
    const wallVariant = tvFamily.variants.find(v => v.id === 'tv.flat.wall-salvage');

    const { resolveMediaSource } = await importRepo('world/media-source-resolver.js');
    const exampleChannel = resolveMediaSource({ sourceKey: 'live-news.al-jazeera-english', defaultAudio: 'proximity' });

    const sections = [
        section({
            key: 'identity',
            title: 'Identity',
            status: 'real',
            data: {
                targetType: 'media-furniture',
                mediaFamily: tvFamily.id,
                variantId: wallVariant.id,
                placementRuleId: 'giga-shopfront',
            },
            sourceRefs: [
                'jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json',
                'world/spawn-location-runtime.js:80',
            ],
        }),
        section({
            key: 'physical-authority',
            title: 'Physical / furniture authority (the TV object itself)',
            status: 'real',
            data: wallVariant,
            sourceRefs: ['jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json'],
        }),
        section({
            key: 'placement-authority',
            title: 'Placement authority (which spawn hosts get this TV, how it\'s scaled/seated)',
            status: 'real',
            data: {
                hostArchetypes: ['hanging-storefront'],
                mediaScale: [4.0, 3.2, 2.2],
                seatRange: [3, 4],
                requireOverhead: true,
                mediaVariantIds: ['tv.flat.wall-salvage'],
            },
            sourceRefs: ['world/spawn-location-runtime.js:80'],
            notes: 'Verbatim from the giga-shopfront rule; terra-backroom (line 85) is the other current host for this variant.',
        }),
        section({
            key: 'content-authority',
            title: 'Content authority (what actually plays on the screen)',
            status: 'real',
            data: exampleChannel,
            sourceRefs: ['world/media-source-resolver.js', 'world/jweb-media-channel-pack/'],
            notes: 'Al Jazeera English is the only wired news channel today; jweb-media-channel-pack adds DVIDS Live / Blender PeerTube cartoons behind the same jweb.media-source.v1 shape (see world/jweb-media-channel-pack/README.md for what\'s ready vs. gated).',
        }),
        await (mode === 'fast'
            ? attemptVisualCapture({
                mode, kind: 'specimen',
                params: { mode: 'generator', seed: 671278205, chunk: '0,0', target: 'tv.flat.wall-salvage' },
                outDir,
                fallbackReproCommand: [
                    'node tools/visual-harness/serve.mjs --port 8123',
                    'open http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=tv.flat.wall-salvage',
                ].join('\n'),
                fallbackNotes: 'The TV is placed by the spawn-location pipeline, not by the bare Kowloon chunk this generator specimen builds - a "no match" here is expected, not automation failure. Slow/full-generation mode is the real way to see this one.',
            })
            : attemptVisualCapture({
                mode, kind: 'world',
                params: { queries: [{ query: 'tv.flat.wall-salvage', decompose: true }], wait: { localRender: true, authoredStructures: true, timeoutMs: 150000 } },
                outDir,
                fallbackReproCommand: [
                    'node tools/visual-harness/serve.mjs --port 8123',
                    'open http://127.0.0.1:8123/?visualProbe=1',
                    '// in the page console:',
                    "const p = await window.__debug.visualProbe.install(); await p.captureInvestigation([{ query: 'tv.flat.wall-salvage', decompose: true }], { wait: { localRender: true, authoredStructures: true }, download: true });",
                ].join('\n'),
            })),
    ];
    return { slug: 'spawn-tv', label: 'TV in spawn (wall-mounted flat panel, giga-shopfront)', targetType: 'media-furniture', sections };
}

// ---------------------------------------------------------------------
// 2. An intersection (transport junction)
// ---------------------------------------------------------------------
async function collectIntersection(mode, outDir) {
    const { planTransportJunctions } = await importRepo('world/transport-junction-authority.js');

    const sourceRefs = [
        'world/transport-junction-authority.js',
        'tests/transport-junction-authority-selftest.mjs',
        'kowloon-fabric-engine.js:34 (real production wiring, internalBoundarySegments)',
    ];

    const sections = [
        section({
            key: 'identity',
            title: 'Identity',
            status: 'real',
            data: { targetType: 'transport-junction', functions: ['clusterTransportJunctions', 'exposedBoundarySegments', 'internalBoundarySegments', 'planTransportJunctions'] },
            sourceRefs,
        }),
    ];

    if (mode === 'fast') {
        // Same synthetic fixture the real selftest uses: two touching decks -> one junction.
        const rect = (id, x, z, hx, hz, y = 6) => ({ id, x, z, hx, hz, y });
        const surfaces = [rect('a', 0, 0, 3, 1), rect('b', 5, 0, 3, 1)];
        const plan = planTransportJunctions(surfaces);
        sections.push(section({
            key: 'geometry-authority',
            title: 'Geometry authority - synthetic fixture (fast/isolated mode)',
            status: 'real',
            data: { inputSurfaces: surfaces, plan },
            sourceRefs: ['tests/transport-junction-authority-selftest.mjs (fixture 01 - straight overlap)'],
            reproCommand: "node -e \"import('./world/transport-junction-authority.js').then(m=>console.log(JSON.stringify(m.planTransportJunctions([{id:'a',x:0,z:0,hx:3,hz:1,y:6},{id:'b',x:5,z:0,hx:3,hz:1,y:6}]),null,2)))\"",
            notes: 'Real output of the real function, on a synthetic two-deck fixture (not from an actual streamed chunk). Deterministic and reproducible with the command above.',
        }));
    } else {
        sections.push(section({
            key: 'geometry-authority',
            title: 'Geometry authority - real chunk surfaces (slow/full generation mode)',
            status: 'pending',
            sourceRefs: ['kowloon-fabric-engine.js:34', 'kowloon-fabric-engine.js:~1823'],
            reproCommand: 'node tools/geometry-harness/source/audit_jweb_authority.mjs --repo . --chunks "8,8" --seed 671278205 --strict --out /tmp/jweb-geometry-authority.json',
            notes: 'Real surfaces come from kowloon-fabric-engine.js building an actual chunk; this pass did not run the full audit (needs numpy+Pillow installed - confirmed installable via pip, not yet installed). The audit command above is the exact reproduction step.',
        }));
    }

    if (mode === 'fast') {
        sections.push(section({
            key: 'visual-capture',
            title: 'Visual capture (beauty / silhouette / depth / normals / object-id / instance-id / collider / semantic)',
            status: 'not-applicable',
            sourceRefs: ['tools/geometry-harness/specs/', 'tools/visual-harness/geometry-fixture-adapter.js:153'],
            notes: 'No geometry-harness fixture spec exists for an isolated junction (only apartment-stair, fence, fork, horse-statue, house, wall-business-sign) and there is no standalone generator target either, since a junction is a derived relationship between surfaces, not a placed asset. Authoring tools/geometry-harness/specs/junction-demo.json from the synthetic fixture above would make this a true fast/isolated visual target.',
        }));
    } else {
        sections.push(await attemptVisualCapture({
            mode, kind: 'world',
            params: { queries: [{ query: 'transport-junction', decompose: true }], wait: { localRender: true, timeoutMs: 150000 } },
            outDir,
            fallbackReproCommand: [
                'node tools/visual-harness/serve.mjs --port 8123',
                'open http://127.0.0.1:8123/?visualProbe=1',
                '// in the page console:',
                "const p = await window.__debug.visualProbe.install(); await p.captureInvestigation([{ query: 'transport-junction', decompose: true }], { wait: { localRender: true }, download: true });",
            ].join('\n'),
        }));
    }

    return { slug: 'intersection', label: 'An intersection (transport junction)', targetType: 'transport-junction', sections };
}

// ---------------------------------------------------------------------
// 3. Roof toppers
// ---------------------------------------------------------------------
async function collectRoofTopper(mode, outDir) {
    const sourceRefs = [
        'kowloon-fabric-engine.js:5625-5994 (roofTopper assignment, values incl. \'spire\'/\'none\')',
        'world/kowloon-fabric-enrichment.js:1075 (roof-topper enrichment task)',
    ];
    const sections = [
        section({
            key: 'identity',
            title: 'Identity',
            status: 'real',
            data: { targetType: 'procedural-roof-feature', knownValues: ['spire', 'none', '(others live in kowloon-fabric-engine.js:5625-5994, not fully enumerated by this pass)'] },
            sourceRefs,
        }),
        section({
            key: 'geometry-authority',
            title: 'Geometry authority',
            status: 'pending',
            sourceRefs,
            reproCommand: 'grep -n "roofTopper = " kowloon-fabric-engine.js',
            notes: 'Roof toppers are procedurally assigned per-building from building geometry + seed, not a fixed catalog id like a trash can - there is no single static record to dump. Real values only exist once a building is generated; the grep above is the fastest way to re-find every assignment branch.',
        }),
        section({
            key: 'enrichment-authority',
            title: 'Enrichment authority (how a roof-topper task gets scheduled onto a rooted entity)',
            status: 'real',
            data: { taskKind: 'roof-topper', gate: 'only when !entity.ceilingRooted && entity.roofTopper && entity.roofTopper !== \'none\'' },
            sourceRefs: ['world/kowloon-fabric-enrichment.js:1075'],
        }),
    ];
    sections.push(section({
        key: 'find-a-real-instance',
        title: `Finding a real instance (${mode === 'fast' ? 'single building, isolated' : 'a full generated chunk'})`,
        status: 'pending',
        sourceRefs: ['tools/geometry-harness/source/jweb_silhouette_tester.py', 'tools/geometry-harness/source/audit_jweb_authority.mjs'],
        reproCommand: mode === 'fast'
            ? 'python tools/geometry-harness/source/jweb_silhouette_tester.py city --repo . --chunk 0,0 --seed 671278205 --strict-geometry -o /tmp/jweb-roof-topper-check'
            : 'node tools/geometry-harness/source/audit_jweb_authority.mjs --repo . --chunks "0,0;1,0;2,0;16,0" --seed 671278205 --strict --out /tmp/jweb-geometry-authority.json',
        notes: 'Roof toppers are procedurally assigned per-building from geometry + seed, not a fixed catalog id - there\'s no single static record to dump, and this pass did not verify which chunk/seed actually rolls a spire. Needs numpy+Pillow installed (confirmed installable via pip, not yet installed this pass).',
    }));
    sections.push(await (mode === 'fast'
        ? attemptVisualCapture({
            mode, kind: 'specimen',
            params: { mode: 'generator', seed: 671278205, chunk: '0,0', target: 'roof-topper' },
            outDir,
            fallbackReproCommand: [
                'node tools/visual-harness/serve.mjs --port 8123',
                'open http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=roof-topper',
            ].join('\n'),
            fallbackNotes: 'A "no match" here is real evidence, not automation failure - either this seed/chunk did not roll a topper, or roof toppers are not registered as a searchable visual-probe label at all yet (unconfirmed either way).',
        })
        : attemptVisualCapture({
            mode, kind: 'world',
            params: { queries: ['roof-topper'] },
            outDir,
            fallbackReproCommand: [
                'node tools/visual-harness/serve.mjs --port 8123',
                'open http://127.0.0.1:8123/?visualProbe=1',
                '// in the page console:',
                "const p = await window.__debug.visualProbe.install(); await p.captureInvestigation([{ query: 'roof-topper' }], { wait: { localRender: true }, download: true });",
            ].join('\n'),
        })));
    return { slug: 'roof-topper', label: 'Roof toppers (procedural rooftop features)', targetType: 'procedural-roof-feature', sections };
}

// ---------------------------------------------------------------------
// 4. A trash can
// ---------------------------------------------------------------------
async function collectTrashCan(mode, outDir) {
    const { CLAUDE_CITY_ASSETS } = await importRepo('vendor/city-pack/asset-catalog.js');
    const variants = CLAUDE_CITY_ASSETS.filter(a => a.kind === 'trash_can');
    const { cityAssetPlacementMetadata } = await importRepo('vendor/city-pack/placement-metadata.js');
    const placement = cityAssetPlacementMetadata({ id: 'street/trash_can_01', mount: 'ground' });

    const sections = [
        section({
            key: 'identity',
            title: 'Identity',
            status: 'real',
            data: { targetType: 'street-prop', ids: variants.map(v => v.id) },
            sourceRefs: ['vendor/city-pack/asset-catalog.js'],
        }),
        section({
            key: 'physical-authority',
            title: 'Physical / geometry authority (bounds, collider, mount)',
            status: 'real',
            data: variants,
            sourceRefs: ['vendor/city-pack/asset-catalog.js'],
        }),
        section({
            key: 'placement-authority',
            title: 'Placement authority (can it hold other props, wall-adjacency, etc.)',
            status: 'real',
            data: placement,
            sourceRefs: ['vendor/city-pack/placement-metadata.js', 'tests/prop-placement-metadata-selftest.mjs'],
            notes: 'canSupportProps is asserted false for street/trash_can_01 in the selftest - it must never become a generic stacking surface.',
        }),
        section({
            key: 'fixture-spec',
            title: 'Isolated silhouette fixture',
            status: 'not-applicable',
            sourceRefs: ['tools/geometry-harness/specs/'],
            notes: 'No fixture spec exists for a trash can (only apartment-stair, fence, fork, horse-statue, house, wall-business-sign). Authoring tools/geometry-harness/specs/trash-can-01.json would make this a true fast/isolated silhouette render instead of relying on the generator specimen.',
        }),
        await (mode === 'fast'
            ? attemptVisualCapture({
                mode, kind: 'specimen',
                params: { mode: 'generator', seed: 671278205, chunk: '0,0', target: 'street/trash_can_01' },
                outDir,
                fallbackReproCommand: [
                    'node tools/visual-harness/serve.mjs --port 8123',
                    'open http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=street/trash_can_01',
                ].join('\n'),
                fallbackNotes: 'Trash cans are placed by the adornment/street-furniture system layered on top of a built chunk, not by kowloon-fabric-engine itself - a "no match" here is expected, not automation failure. Slow/full-generation mode is the real way to see this one.',
            })
            : attemptVisualCapture({
                mode, kind: 'world',
                params: { queries: ['trash_can'] },
                outDir,
                fallbackReproCommand: [
                    'node tools/visual-harness/serve.mjs --port 8123',
                    'open http://127.0.0.1:8123/?visualProbe=1',
                    '// in the page console:',
                    "const p = await window.__debug.visualProbe.install(); await p.captureInvestigation([{ query: 'trash_can' }], { wait: { localRender: true }, download: true });",
                ].join('\n'),
            })),
    ];
    return { slug: 'trash-can', label: 'A trash can (street/trash_can_01..04)', targetType: 'street-prop', sections };
}

export const COLLECTORS = {
    'spawn-tv': collectSpawnTv,
    'intersection': collectIntersection,
    'roof-topper': collectRoofTopper,
    'trash-can': collectTrashCan,
};
