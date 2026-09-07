#!/usr/bin/env node
// Pivots a sweep.mjs output directory (time-major: t+01min/targets/<query>/...)
// into ONE end-to-end index.html that's object-major: every place/object in
// the corpus gets one section showing every checkpoint that ever ran against
// it - hit (thumbnails + manifest link) or miss (recorded error) - in
// chronological order. This is "every test ran on a specific place/object"
// in one page, instead of having to cross-reference per-checkpoint folders.
//
// Usage:
//   node tools/target-report/build-sweep-index.mjs [sweepDir]   # default ~/jweb-sweep
//
// Safe to re-run any time (including mid-sweep) - it only reads whatever
// checkpoint.json files already exist and writes <sweepDir>/index.html.

import fs from 'node:fs';
import path from 'node:path';

const SWEEP_DIR = path.resolve(process.argv[2] ?? path.join(process.env.HOME ?? '.', 'jweb-sweep'));

function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

const runInfo = JSON.parse(fs.readFileSync(path.join(SWEEP_DIR, 'sweep-run.json'), 'utf8'));

// Discover which checkpoints actually ran (have a checkpoint.json), in
// ascending minute order - independent of runInfo.checkpointsMin so a
// still-running sweep just shows what's real so far.
const checkpointDirs = fs.readdirSync(SWEEP_DIR)
    .filter(name => /^t\+[\d.]+min$/.test(name) && fs.existsSync(path.join(SWEEP_DIR, name, 'checkpoint.json')))
    .sort((a, b) => parseFloat(a.slice(2)) - parseFloat(b.slice(2)));

const checkpoints = checkpointDirs.map(dir => ({
    dir,
    minutes: parseFloat(dir.slice(2)),
    data: JSON.parse(fs.readFileSync(path.join(SWEEP_DIR, dir, 'checkpoint.json'), 'utf8')),
}));

// Build the object-major index: query -> [{checkpoint, status, ...}]
const byQuery = new Map();
for (const q of runInfo.corpus) byQuery.set(q, []);
for (const cp of checkpoints) {
    if (cp.data.error) continue; // whole checkpoint failed to run at all
    const hitSet = new Set(cp.data.hitQueries ?? []);
    const missByQuery = new Map((cp.data.misses ?? []).map(m => [m.query, m.error]));
    for (const q of runInfo.corpus) {
        if (hitSet.has(q)) {
            const dir = `${cp.dir}/targets/${q.replace(/[^a-zA-Z0-9_.-]+/g, '_')}`;
            const abs = path.join(SWEEP_DIR, dir);
            const pngs = fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => f.endsWith('.png')) : [];
            byQuery.get(q).push({ checkpoint: cp.dir, minutes: cp.minutes, status: 'hit', dir, pngs });
        } else if (missByQuery.has(q)) {
            byQuery.get(q).push({ checkpoint: cp.dir, minutes: cp.minutes, status: 'miss', error: missByQuery.get(q) });
        }
        // else: not in this checkpoint's corpus run at all (shouldn't happen - same corpus every time)
    }
}

const everHit = [...byQuery.entries()].filter(([, runs]) => runs.some(r => r.status === 'hit'));
const neverHit = [...byQuery.entries()].filter(([, runs]) => runs.length && runs.every(r => r.status === 'miss'));

function renderObjectSection([query, runs]) {
    const anchor = `q-${query.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
    const hitCount = runs.filter(r => r.status === 'hit').length;
    const cells = runs.map(r => {
        if (r.status === 'hit') {
            const thumbs = r.pngs.map(f => `<figure><img src="${esc(r.dir)}/${esc(f)}" loading="lazy" alt="${esc(query)} ${esc(f)}"><figcaption>${esc(f.replace('iso.isolated.', ''))}</figcaption></figure>`).join('');
            return `<div class="cp hit"><h4>${esc(r.checkpoint)}</h4><div class="thumbs">${thumbs}</div><a class="manifest-link" href="${esc(r.dir)}/manifest.json">manifest.json</a></div>`;
        }
        return `<div class="cp miss"><h4>${esc(r.checkpoint)}</h4><p class="miss-reason">MISS<br>${esc((r.error ?? '').slice(0, 160))}</p></div>`;
    }).join('\n');
    return `<section id="${anchor}">
  <h2>${esc(query)} <span class="hitrate">${hitCount}/${runs.length} checkpoints hit</span></h2>
  <div class="timeline">${cells}</div>
</section>`;
}

const toc = runInfo.corpus.map(q => {
    const runs = byQuery.get(q);
    const hitCount = runs.filter(r => r.status === 'hit').length;
    const cls = hitCount === 0 ? 'toc-never' : (hitCount === runs.length ? 'toc-always' : 'toc-sometimes');
    return `<a class="toc-item ${cls}" href="#q-${q.replace(/[^a-zA-Z0-9_-]+/g, '_')}">${esc(q)} <span>${hitCount}/${runs.length}</span></a>`;
}).join('\n');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>JWEB sweep — every test per object (seed ${esc(runInfo.seed)})</title>
<style>
:root { color-scheme: light dark; }
body { font-family: ui-monospace, "SF Mono", Consolas, monospace; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
h1 { font-size: 1.3rem; }
.meta { font-size: 0.85rem; opacity: 0.75; margin-bottom: 1rem; }
.toc { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 2rem; padding: 0.75rem; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 6px; }
.toc-item { font-size: 0.78rem; padding: 2px 8px; border-radius: 4px; text-decoration: none; color: inherit; }
.toc-item span { opacity: 0.7; }
.toc-always { background: #1b5e2033; }
.toc-sometimes { background: #7a5b0033; }
.toc-never { background: #66000033; opacity: 0.6; }
section { border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); padding: 1rem 0; }
h2 { font-size: 1.05rem; margin: 0 0 0.5rem; }
.hitrate { font-size: 0.75rem; opacity: 0.7; font-weight: normal; }
.timeline { display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.5rem; }
.cp { flex: 0 0 auto; min-width: 160px; border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 6px; padding: 0.5rem; }
.cp h4 { margin: 0 0 0.4rem; font-size: 0.8rem; opacity: 0.8; }
.cp.miss { background: color-mix(in srgb, #660000 10%, transparent); min-width: 160px; }
.miss-reason { font-size: 0.68rem; opacity: 0.75; word-break: break-word; }
.thumbs { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.thumbs figure { margin: 0; max-width: 130px; }
.thumbs img { max-width: 130px; max-height: 110px; background: #000; border-radius: 3px; }
.thumbs figcaption { font-size: 0.62rem; opacity: 0.65; }
.manifest-link { font-size: 0.68rem; display: inline-block; margin-top: 0.3rem; }
</style>
</head>
<body>
<h1>JWEB sweep — every test run, per object</h1>
<div class="meta">
  seed <code>${esc(runInfo.seed)}</code> ·
  git commit <code>${esc(runInfo.gitCommit)}</code> ·
  started <code>${esc(runInfo.startedAt)}</code> ·
  corpus ${runInfo.corpus.length} queries ·
  checkpoints run so far: ${checkpoints.map(c => c.dir).join(', ') || '(none yet)'}
</div>
<p class="meta">Regenerate any time (including mid-sweep) with <code>node tools/target-report/build-sweep-index.mjs</code>. Green = hit every checkpoint, amber = hit sometimes, red = never hit.</p>
<div class="toc">${toc}</div>
${everHit.map(renderObjectSection).join('\n')}
${neverHit.length ? `<h2>Never hit in any checkpoint (${neverHit.length})</h2>${neverHit.map(renderObjectSection).join('\n')}` : ''}
</body>
</html>`;

fs.writeFileSync(path.join(SWEEP_DIR, 'index.html'), html);
console.log(`[sweep-index] ${everHit.length} objects hit at least once, ${neverHit.length} never hit, ${checkpoints.length} checkpoints -> ${path.join(SWEEP_DIR, 'index.html')}`);
