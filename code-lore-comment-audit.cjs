const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = __dirname;
const ROOTS = ['main.js', 'city-performance.js', 'kowloon-fabric-engine.js', 'infinite-city-chunks.js', 'world-chunk-streamer.js', 'world-contract.js', 'priority-load-queue.js', 'player-physics.js', 'numeric-parameters.js', 'parameter-editor.js', 'config', 'systems', 'world', 'content/curated', 'content/graffiti-content.js', 'content/junk-content.js', 'content/lore-fragments.js', 'content/photo-catalog.js', 'content/signature-content.js', 'content/text-style.js', 'content/wanted-content.js'];

function filesUnder(relative) {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return [];
    const stat = fs.statSync(absolute);
    if (stat.isFile()) return [relative];
    const out = [];
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = path.join(relative, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) out.push(...filesUnder(child));
        else if (/\.m?js$/i.test(entry.name)) out.push(child);
    }
    return out;
}

function commentRanges(source, sourceFile) {
    const ranges = new Map();
    const add = list => { for (const range of list || []) ranges.set(`${range.pos}:${range.end}`, range); };
    const walk = node => {
        add(ts.getLeadingCommentRanges(source, node.getFullStart()));
        add(ts.getLeadingCommentRanges(source, node.getStart(sourceFile)));
        add(ts.getTrailingCommentRanges(source, node.end));
        for (const child of node.getChildren(sourceFile)) walk(child);
    };
    walk(sourceFile);
    return [...ranges.values()].sort((a, b) => a.pos - b.pos);
}

const failures = [];
for (const relative of [...new Set(ROOTS.flatMap(filesUnder))]) {
    if (relative.startsWith('content/code-lore/')) continue;
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const range of commentRanges(source, sourceFile)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(range.pos);
        failures.push(`${relative}:${pos.line + 1}:${pos.character + 1}: ${source.slice(range.pos, range.end).replace(/\s+/g, ' ').slice(0, 140)}`);
    }
}

const loreIndex = fs.readFileSync(path.join(ROOT, 'content/code-lore/index.js'), 'utf8');
if (!loreIndex.includes('CODE_LORE_LINES') || !loreIndex.includes('CODE_LORE_PAIRS')) failures.push('content/code-lore/index.js: missing CODE_LORE aggregate exports');

if (failures.length) {
    console.error('[code-lore] FAIL: prose comments remain in authored runtime source');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
}
console.log('[code-lore] PASS: authored runtime prose comments are harvested into CODELORE strings; comment-like text inside strings/templates is preserved as data.');
