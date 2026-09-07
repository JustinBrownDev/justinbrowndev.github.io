#!/usr/bin/env node
// JWEB target report - one unified way to point at a thing in the world
// (a TV, an intersection, a roof topper, a trash can, ...) and get back
// every data path about it: identity, physical/geometry authority,
// placement/semantic authority, content authority (media), and a visual
// capture plan - in fast (isolated) or slow (full generation) mode.
//
// Usage:
//   node tools/target-report/run.mjs                      # all targets, both modes
//   node tools/target-report/run.mjs --target spawn-tv     # one target, both modes
//   node tools/target-report/run.mjs --target spawn-tv --mode fast
//
// Output: ~/jweb-target-reports/<slug>/<mode>/index.html (+ record.json),
// plus a top-level ~/jweb-target-reports/index.html hub.
// This folder is NOT part of the repo - it's a personal report archive.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { COLLECTORS } from './collectors.mjs';
import { renderReport, renderIndex } from './render.mjs';

function argValue(name, fallback = null) {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT_ROOT = path.join(os.homedir(), 'jweb-target-reports');
const targetArg = argValue('--target');
const modeArg = argValue('--mode');
const targets = targetArg ? [targetArg] : Object.keys(COLLECTORS);
const modes = modeArg ? [modeArg] : ['fast', 'slow'];

let gitCommit = 'unknown';
try {
    gitCommit = execSync('git rev-parse HEAD', { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..') }).toString().trim();
} catch { /* leave as 'unknown' */ }

const generatedAt = new Date().toISOString();
const allRecords = [];

for (const slug of targets) {
    const collect = COLLECTORS[slug];
    if (!collect) {
        console.error(`[target-report] unknown target "${slug}" - known targets: ${Object.keys(COLLECTORS).join(', ')}`);
        process.exitCode = 1;
        continue;
    }
    for (const mode of modes) {
        const dir = path.join(OUT_ROOT, slug, mode);
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[target-report] ${slug}/${mode}: collecting (visual-capture sections may take a while - real headless Chrome runs)...`);
        const base = await collect(mode, dir);
        const record = {
            ...base,
            mode,
            generatedAt,
            gitCommit,
            nodeVersion: process.version,
        };
        fs.writeFileSync(path.join(dir, 'index.html'), renderReport(record));
        fs.writeFileSync(path.join(dir, 'record.json'), JSON.stringify(record, null, 2));
        allRecords.push(record);
        console.log(`[target-report] ${base.slug}/${mode} -> ${path.join(dir, 'index.html')}`);
    }
}

fs.writeFileSync(path.join(OUT_ROOT, 'index.html'), renderIndex(allRecords));
console.log(`[target-report] hub -> ${path.join(OUT_ROOT, 'index.html')}`);
