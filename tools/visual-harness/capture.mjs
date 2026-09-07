// Real, automated visual-harness captures - the headless-Chrome counterpart
// to manually opening specimen.html/?visualProbe=1 and running console
// commands by hand. Owns the serve.mjs lifecycle (spawns it on a scratch
// port, kills it when done) so callers don't need a dev server running.
//
// Both exports write PNG files + manifest.json under `outDir` and return
// `{ manifest, files }` on success, or throw on failure (no target found,
// page error, timeout) - callers decide how to report that honestly.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runHeadlessCapture } from './headless-driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVE_SCRIPT = path.join(HERE, 'serve.mjs');

async function withServer(fn) {
    const port = 8300 + Math.floor(Math.random() * 500);
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

// The page-side extraction shared by both capture kinds: turn a
// runtime-visual-probe "bundle" ({entries, manifest}) into a plain,
// JSON-returnable object of base64 file contents.
const BUNDLE_TO_JSON = `
  async function bundleToJson(bundle) {
    const files = [];
    for (const entry of bundle.entries) {
      const buf = await entry.data.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      files.push({ name: entry.name, base64: btoa(binary) });
    }
    return { manifest: bundle.manifest, files };
  }
`;

function writeFiles(outDir, files) {
    const written = [];
    for (const file of files) {
        if (file.name.endsWith('manifest.json')) continue; // written separately, below
        const dest = path.join(outDir, file.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(file.base64, 'base64'));
        written.push(file.name);
    }
    return written;
}

/**
 * Fast/isolated capture via tools/visual-harness/specimen.html.
 * `mode`: 'fixture' (tools/geometry-harness/specs/*.json) or 'generator'
 * (one deterministic Kowloon chunk, no spawn/streamer/authored-fabric).
 */
export async function captureSpecimen({
    mode, fixture = 'apartment-stair', seed = 671278205, chunk = '0,0', target,
    index = 0, decompose = false, views = ['iso'],
    passes = ['beauty', 'silhouette', 'object-id', 'collider'],
    outDir, evalTimeoutMs = 90000, onConsole,
}) {
    if (!target) throw new Error('captureSpecimen requires a target query string');
    return withServer(async port => {
        const qs = new URLSearchParams({ mode, target, index: String(index) });
        if (mode === 'fixture') qs.set('fixture', fixture);
        else { qs.set('seed', String(seed)); qs.set('chunk', chunk); }
        const url = `http://127.0.0.1:${port}/tools/visual-harness/specimen.html?${qs}`;
        const expression = `
            ${BUNDLE_TO_JSON}
            await window.__jwebSpecimenReady;
            const api = window.__jwebVisualProbe;
            if (!api) return { error: 'visual probe not installed on specimen page' };
            const matches = api.search(${JSON.stringify(target)}, { limit: 5, refresh: true });
            if (!matches.length) return { error: 'no match for target ${target}', matchCount: 0 };
            const bundle = ${decompose}
              ? await api.captureDecomposition(${JSON.stringify(target)}, { index: ${index}, maxParts: 12, worldContext: false, download: false })
              : await api.captureTarget(${JSON.stringify(target)}, { index: ${index}, views: ${JSON.stringify(views)}, passes: ${JSON.stringify(passes)}, filters: [], worldContext: false, download: false });
            return await bundleToJson(bundle);
        `;
        const result = await runHeadlessCapture({ url, expression, evalTimeoutMs, onConsole });
        if (result?.error) throw new Error(result.error);
        fs.mkdirSync(outDir, { recursive: true });
        const files = writeFiles(outDir, result.files);
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(result.manifest, null, 2));
        return { manifest: result.manifest, files };
    });
}

/**
 * Slow/full-generation capture against the real running city (main.js,
 * `?visualProbe=1`). `queries`: array of strings or {query, decompose}.
 */
export async function captureWorldInvestigation({
    queries, seed = 671278205,
    wait = { localRender: true, authoredStructures: true, timeoutMs: 150000 },
    outDir, evalTimeoutMs = 240000, onConsole,
}) {
    if (!queries?.length) throw new Error('captureWorldInvestigation requires at least one query');
    return withServer(async port => {
        // Pin the seed - without it main.js rolls a fresh random maze/city
        // every navigation, which would make this "capture" unreproducible
        // by construction (the one thing this whole tool exists to avoid).
        const url = `http://127.0.0.1:${port}/?visualProbe=1&seed=${seed}`;
        const specs = queries.map(q => (typeof q === 'string' ? { query: q } : q));
        const expression = `
            ${BUNDLE_TO_JSON}
            const deadline = Date.now() + 30000;
            while (!window.__debug?.visualProbe?.install && Date.now() < deadline) {
              await new Promise(r => setTimeout(r, 200));
            }
            if (!window.__debug?.visualProbe?.install) return { error: 'window.__debug.visualProbe never appeared (main.js debug seam not ready within 30s)' };
            const api = await window.__debug.visualProbe.install();
            const bundle = await api.captureInvestigation(${JSON.stringify(specs)}, { wait: ${JSON.stringify(wait)}, download: false });
            return await bundleToJson(bundle);
        `;
        const result = await runHeadlessCapture({ url, expression, evalTimeoutMs, onConsole });
        fs.mkdirSync(outDir, { recursive: true });
        const files = writeFiles(outDir, result.files);
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(result.manifest, null, 2));
        return { manifest: result.manifest, files };
    });
}
