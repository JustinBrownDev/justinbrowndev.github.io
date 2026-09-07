#!/usr/bin/env node
// Build the world ONCE, sample it a LOT, at increasing real-time checkpoints.
//
// One headless-Chrome session opens the real running city (main.js,
// ?visualProbe=1, seed pinned) and stays open for the whole sweep - no
// per-target rebuild like tools/target-report/run.mjs does. At each
// checkpoint (default 1,2,5,10,15,30,60 minutes since the session opened),
// the WHOLE corpus (tools/target-report/corpus.mjs) is captured against
// whatever the city looks like AT THAT MOMENT - no internal "wait until
// settled" (that's what timed out before); the checkpoint schedule itself
// *is* the wait, and how much of the corpus resolves at t+1min vs t+60min is
// the actual signal this sweep exists to collect.
//
// Within one checkpoint, every corpus query is captured concurrently
// (Promise.allSettled in-page) rather than one Node<->browser round trip per
// query - this is the "build once, sample a lot, in parallel" the harness
// allows without spinning up N redundant worlds.
//
// Usage:
//   node tools/target-report/sweep.mjs --seed 671278205 --checkpoints 1,2,5,10,15,30,60 --out ~/jweb-sweep-<label>
//
// Output layout:
//   <out>/sweep-run.json              - seed, corpus, checkpoint schedule, git commit
//   <out>/t+01min/<query>/*.png       - one folder per hit query
//   <out>/t+01min/checkpoint.json     - hits/misses summary + world status snapshot
//   ...repeated per checkpoint...

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { openHeadlessSession } from '../visual-harness/headless-driver.mjs';
import { CORPUS } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SERVE_SCRIPT = path.join(REPO, 'tools/visual-harness/serve.mjs');

function argValue(name, fallback = null) {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SEED = Number(argValue('--seed', '671278205'));
const CHECKPOINTS_MIN = String(argValue('--checkpoints', '1,2,5,10,15,30,60')).split(',').map(Number).filter(n => n > 0).sort((a, b) => a - b);
const OUT = path.resolve(argValue('--out', path.join(process.env.HOME ?? '.', 'jweb-sweep')));

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
}

function blobFilesToDisk(dir, files) {
    for (const file of files) {
        const dest = path.join(dir, file.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(file.base64, 'base64'));
    }
}

async function withServer(fn) {
    const port = 8400 + Math.floor(Math.random() * 500);
    const server = spawn(process.execPath, [SERVE_SCRIPT, '--port', String(port)], { stdio: 'ignore' });
    const deadline = Date.now() + 10000;
    let up = false;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/tools/visual-harness/specimen.html`);
            if (res.ok) { up = true; break; }
        } catch { /* not up yet */ }
        await delay(100);
    }
    if (!up) { server.kill('SIGKILL'); throw new Error(`serve.mjs did not come up on port ${port}`); }
    try {
        return await fn(port);
    } finally {
        server.kill('SIGKILL');
    }
}

const SWEEP_EXPRESSION = `
    const CORPUS = ${JSON.stringify(CORPUS)};
    async function blobToBase64(blob) {
        const buf = await blob.arrayBuffer();
        let binary = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        return btoa(binary);
    }
    const deadline = Date.now() + 30000;
    while (!window.__debug?.visualProbe?.install && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
    }
    if (!window.__debug?.visualProbe?.install) return { error: 'window.__debug.visualProbe never appeared within 30s' };
    const api = await window.__debug.visualProbe.install();

    const settled = await Promise.allSettled(CORPUS.map(async q => {
        const bundle = await api.captureTarget(q, {
            views: ['iso'], passes: ['beauty', 'object-id'], filters: [], worldContext: false,
            wait: null, requireSettled: false, download: false,
            name: q.replace(/[^a-zA-Z0-9_.-]+/g, '_'),
        });
        const files = [];
        for (const entry of bundle.entries) files.push({ name: entry.name, base64: await blobToBase64(entry.data) });
        return { query: q, manifest: bundle.manifest, files };
    }));

    const hits = [], misses = [];
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') hits.push(r.value);
        else misses.push({ query: CORPUS[i], error: String(r.reason?.message ?? r.reason) });
    });
    return { hits, misses, pageElapsedMs: performance.now(), status: window.__debug?.perf?.() ?? null };
`;

let gitCommit = 'unknown';
try { gitCommit = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim(); } catch { /* leave unknown */ }

fs.writeFileSync(path.join(OUT, 'sweep-run.json'), JSON.stringify({
    seed: SEED, checkpointsMin: CHECKPOINTS_MIN, corpus: CORPUS, gitCommit,
    startedAt: new Date().toISOString(), nodeVersion: process.version,
}, null, 2));

log(`sweep starting: seed=${SEED} checkpoints=${CHECKPOINTS_MIN.join(',')}min corpus=${CORPUS.length} queries -> ${OUT}`);

await withServer(async port => {
    const url = `http://127.0.0.1:${port}/?visualProbe=1&seed=${SEED}`;
    const session = await openHeadlessSession({ url, navTimeoutMs: 60000, onConsole: msg => log(msg.slice(0, 300)) });
    const t0 = Date.now();
    try {
        for (const minutes of CHECKPOINTS_MIN) {
            const targetMs = minutes * 60000;
            const remaining = targetMs - (Date.now() - t0);
            if (remaining > 0) {
                log(`waiting ${Math.round(remaining / 1000)}s for t+${minutes}min checkpoint...`);
                await delay(remaining);
            }
            const label = `t+${String(minutes).padStart(2, '0')}min`;
            const dir = path.join(OUT, label);
            fs.mkdirSync(dir, { recursive: true });
            log(`${label}: running sweep (${CORPUS.length} queries, actual elapsed ${Math.round((Date.now() - t0) / 1000)}s)...`);
            let result;
            try {
                result = await session.evaluate(SWEEP_EXPRESSION, { timeoutMs: 180000 });
            } catch (err) {
                log(`${label}: FAILED - ${err.message}`);
                fs.writeFileSync(path.join(dir, 'checkpoint.json'), JSON.stringify({ label, minutes, actualElapsedMs: Date.now() - t0, error: err.message }, null, 2));
                continue;
            }
            if (result?.error) {
                log(`${label}: FAILED - ${result.error}`);
                fs.writeFileSync(path.join(dir, 'checkpoint.json'), JSON.stringify({ label, minutes, actualElapsedMs: Date.now() - t0, error: result.error }, null, 2));
                continue;
            }
            for (const hit of result.hits) blobFilesToDisk(dir, hit.files);
            fs.writeFileSync(path.join(dir, 'checkpoint.json'), JSON.stringify({
                label, minutes, actualElapsedMs: Date.now() - t0, pageElapsedMs: result.pageElapsedMs,
                hitCount: result.hits.length, missCount: result.misses.length,
                hitQueries: result.hits.map(h => h.query), misses: result.misses,
                status: result.status,
            }, null, 2));
            log(`${label}: DONE - ${result.hits.length} hits / ${result.misses.length} misses (actual elapsed ${Math.round((Date.now() - t0) / 1000)}s)`);
        }
    } finally {
        await session.close();
    }
});

log('sweep complete');
