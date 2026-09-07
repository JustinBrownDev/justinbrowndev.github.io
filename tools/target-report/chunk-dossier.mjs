#!/usr/bin/env node
// Runs EVERY Node-only (no browser) structural/circulation diagnostic tool
// under tools/ against one chunk, all in parallel (real OS-process
// parallelism this time - each is an independent Node invocation, not
// sharing a browser/GPU the way the pixel sweep does). These are
// deterministic engine.build() analyses, not tied to live-refinement time
// the way sweep.mjs's screenshots are - so this runs once, not per
// checkpoint, and is meant to sit alongside the pixel sweep as the
// "structure/circulation" half of "everything we have in tools" for one
// place, feeding into the same end-to-end index.html.
//
// Usage:
//   node tools/target-report/chunk-dossier.mjs --seed 671278205 --chunk 0,0 --out ~/jweb-sweep/chunk-dossier

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(REPO, 'tools/geometry-harness/source');
const VH_SRC = path.join(REPO, 'tools/visual-harness/source');

function argValue(name, fallback = null) {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SEED = argValue('--seed', '671278205');
const CHUNK = argValue('--chunk', '0,0');
const [CX, CZ] = CHUNK.split(',');
const OUT = path.resolve(argValue('--out', path.join(process.env.HOME ?? '.', 'jweb-chunk-dossier')));
fs.mkdirSync(OUT, { recursive: true });

function log(msg) { console.log(`[chunk-dossier] ${msg}`); }

// Each task: {key, title, run() -> result summary, artifacts: [{label, path}]}
const TASKS = [
    {
        key: 'authority-audit',
        title: 'Geometry-authority audit (stair fit/width/rise, circulation-reservation validity)',
        artifacts: [{ label: 'audit.json', file: 'authority-audit.json' }],
        async run() {
            const out = path.join(OUT, 'authority-audit.json');
            await run_(process.execPath, [path.join(SRC, 'audit_jweb_authority.mjs'), '--repo', REPO, '--chunks', CHUNK, '--seed', SEED, '--out', out]);
            return JSON.parse(fs.readFileSync(out, 'utf8')).summary;
        },
    },
    {
        key: 'scene-snapshot',
        title: 'Neutral geometry-stream capture (exact meshes/colliders + authority health)',
        artifacts: [{ label: 'scene-snapshot.json', file: 'scene-snapshot.json' }],
        async run() {
            const out = path.join(OUT, 'scene-snapshot.json');
            await run_(process.execPath, [path.join(SRC, 'capture_jweb_scene.mjs'), '--repo', REPO, '--seed', SEED, '--x', CX, '--z', CZ, '--out', out]);
            const data = JSON.parse(fs.readFileSync(out, 'utf8'));
            return { elements: data.elements?.length ?? 0, capture_health: data.source_metadata?.capture_health, authority_health: data.source_metadata?.authority_health };
        },
    },
    {
        key: 'system-observatory',
        title: 'System Observatory v1 — circulation graph (nodes/edges/components/routes), building stacks, attention ledger',
        artifacts: [
            { label: 'index.html', file: `system-observatory/chunks/${CHUNK}/index.html` },
            { label: 'transport-anatomy.svg', file: `system-observatory/chunks/${CHUNK}/transport-anatomy.svg` },
            { label: 'system-story.svg', file: `system-observatory/chunks/${CHUNK}/system-story.svg` },
            { label: 'building-stacks.svg', file: `system-observatory/chunks/${CHUNK}/building-stacks.svg` },
            { label: 'attention-ledger.svg', file: `system-observatory/chunks/${CHUNK}/attention-ledger.svg` },
        ],
        async run() {
            const out = path.join(OUT, 'system-observatory');
            await run_(process.execPath, [path.join(VH_SRC, 'capture_system_observatory.mjs'), '--seed', SEED, '--center-x', CX, '--center-z', CZ, '--radius', '0', '--out', out]);
            return JSON.parse(fs.readFileSync(path.join(out, 'sweep.json'), 'utf8')).totals;
        },
    },
    {
        key: 'system-observatory-r2',
        title: 'System Observatory R2 — issue-focused audit lenses (hard connectivity, orphan reservations, unbound apertures)',
        artifacts: [
            { label: 'index.html', file: `system-observatory-r2/chunks/${CHUNK}/index.html` },
            { label: 'audit-lenses.svg', file: `system-observatory-r2/chunks/${CHUNK}/audit-lenses.svg` },
        ],
        async run() {
            const out = path.join(OUT, 'system-observatory-r2');
            await run_(process.execPath, [path.join(VH_SRC, 'capture_system_observatory_r2.mjs'), '--seed', SEED, '--chunks', CHUNK, '--out', out]);
            return JSON.parse(fs.readFileSync(path.join(out, 'sweep.json'), 'utf8')).totals ?? null;
        },
    },
    {
        key: 'architecture-observatory',
        title: 'Architecture observatory — construction families, facade languages, diversity warnings',
        artifacts: [{ label: 'ARCHITECTURE-OBSERVATORY.md', file: 'architecture-observatory/ARCHITECTURE-OBSERVATORY.md' }],
        async run() {
            const out = path.join(OUT, 'architecture-observatory');
            await run_(process.execPath, [path.join(VH_SRC, 'capture_architecture_observatory.mjs'), '--repo', REPO, '--seed', SEED, '--chunks', CHUNK, '--out', out]);
            const jsonPath = path.join(out, 'architecture-observatory.json');
            return fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')).summary ?? null : null;
        },
    },
    {
        key: 'interior-scale-observatory',
        title: 'Interior scale observatory — unit/room size + floor-graph-diameter stats',
        artifacts: [{ label: 'interior-scale-observatory.json', file: 'interior-scale-observatory.json' }],
        async run() {
            const out = path.join(OUT, 'interior-scale-observatory.json');
            await run_(process.execPath, [path.join(VH_SRC, 'capture_interior_scale_observatory.mjs'), '--repo', REPO, '--seed', SEED, '--chunks', CHUNK, '--out', out]);
            return JSON.parse(fs.readFileSync(out, 'utf8'));
        },
    },
    {
        key: 'interior-plan-floor0',
        title: 'Interior floor plan (floor 0) — room layout + adjacency/circulation graph overlay',
        artifacts: [{ label: 'interior-plan-floor0.svg', file: 'interior-plan-floor0.svg' }],
        async run() {
            const out = path.join(OUT, 'interior-plan-floor0.svg');
            await run_(process.execPath, [path.join(VH_SRC, 'render_interior_plan_svg.mjs'), '--repo', REPO, '--seed', SEED, '--chunk', CHUNK, '--floor', '0', '--out', out]);
            return { written: fs.existsSync(out) };
        },
    },
];

async function run_(cmd, args) {
    try {
        return await run(cmd, args, { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
        throw new Error(`${path.basename(args[0])} exited ${err.code}: ${(err.stderr || err.stdout || err.message).toString().slice(-800)}`);
    }
}

log(`running ${TASKS.length} structural/circulation tools in parallel for chunk ${CHUNK} seed ${SEED} -> ${OUT}`);

const results = await Promise.allSettled(TASKS.map(async task => {
    const t0 = Date.now();
    const summary = await task.run();
    log(`${task.key}: OK (${Date.now() - t0}ms)`);
    return { key: task.key, title: task.title, status: 'ok', summary, artifacts: task.artifacts };
}));

const report = TASKS.map((task, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') return r.value;
    log(`${task.key}: FAILED - ${r.reason.message.slice(0, 300)}`);
    return { key: task.key, title: task.title, status: 'failed', error: r.reason.message, artifacts: [] };
});

fs.writeFileSync(path.join(OUT, 'dossier.json'), JSON.stringify({ seed: SEED, chunk: CHUNK, generatedAt: new Date().toISOString(), tasks: report }, null, 2));
log(`done: ${report.filter(r => r.status === 'ok').length}/${TASKS.length} tools succeeded -> ${path.join(OUT, 'dossier.json')}`);
