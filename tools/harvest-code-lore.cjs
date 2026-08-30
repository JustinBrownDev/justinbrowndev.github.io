const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(process.argv[2] || process.cwd());
const files = process.argv.slice(3);
if (!files.length) {
    console.error('usage: node tools/harvest-code-lore.cjs <root> <file...>');
    process.exit(2);
}

const outDir = path.join(root, 'content', 'code-lore');
fs.mkdirSync(outDir, { recursive: true });

const slug = file => file.replace(/\\/g, '/').replace(/\.m?js$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const varName = file => `CODE_LORE_${slug(file).replace(/-/g, '_').toUpperCase()}`;
const clean = raw => {
    let text = raw;
    if (text.startsWith('//')) text = text.slice(2);
    else if (text.startsWith('/*')) text = text.slice(2, -2);
    return text
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*\*?\s?/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\|/g, '/');
};

function commentRanges(source, sourceFile) {
    const ranges = new Map();
    const add = list => {
        for (const range of list || []) ranges.set(`${range.pos}:${range.end}`, range);
    };
    const walk = node => {
        add(ts.getLeadingCommentRanges(source, node.getFullStart()));
        add(ts.getLeadingCommentRanges(source, node.getStart(sourceFile)));
        add(ts.getTrailingCommentRanges(source, node.end));
        for (const child of node.getChildren(sourceFile)) walk(child);
    };
    walk(sourceFile);
    return [...ranges.values()].sort((a, b) => a.pos - b.pos);
}

function existingLore(outPath) {
    if (!fs.existsSync(outPath)) return [];
    const source = fs.readFileSync(outPath, 'utf8');
    const values = [];
    for (const match of source.matchAll(/"(?:\\.|[^"\\])*"/g)) {
        try {
            const value = JSON.parse(match[0]);
            if (typeof value === 'string' && value.startsWith('CODELORE|')) values.push(value.split('|').slice(3).join('|'));
        } catch {}
    }
    return values;
}

const entries = [];
for (const relativeFile of files) {
    const normalized = relativeFile.replace(/\\/g, '/').replace(/^\.\//, '');
    const absolute = path.join(root, normalized);
    const source = fs.readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(normalized, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const ranges = commentRanges(source, sourceFile);
    const outRel = `${slug(normalized)}.lore.js`;
    const outPath = path.join(outDir, outRel);
    const texts = [...existingLore(outPath), ...ranges.map(range => clean(source.slice(range.pos, range.end)))].filter(Boolean);

    let rewritten = source;
    for (let index = ranges.length - 1; index >= 0; index--) {
        const range = ranges[index];
        const raw = source.slice(range.pos, range.end);
        const newlines = (raw.match(/\n/g) || []).length;
        rewritten = rewritten.slice(0, range.pos) + (newlines ? '\n'.repeat(newlines) : ' ') + rewritten.slice(range.end);
    }
    fs.writeFileSync(absolute, rewritten);

    const lore = texts.map((text, index) => `CODELORE|${normalized}|${String(index + 1).padStart(4, '0')}|${text}`);
    const variable = varName(normalized);
    fs.writeFileSync(outPath, `export const ${variable} = Object.freeze(${JSON.stringify(lore, null, 4)});\n`);
    entries.push({ relativeFile: normalized, outRel, variable, count: lore.length, harvested: ranges.length });
}

let indexSource = '';
for (const entry of entries) indexSource += `import { ${entry.variable} } from './${entry.outRel}';\n`;
indexSource += '\nexport const CODE_LORE_LINES = Object.freeze([\n';
for (const entry of entries) indexSource += `    ...${entry.variable},\n`;
indexSource += `]);\n\nfunction lineToPair(line) {\n    const parts = String(line).split('|');\n    const source = parts[1] || 'source';\n    const text = parts.slice(3).join('|').trim();\n    const words = text.split(/\\s+/).filter(Boolean);\n    const titleWords = words.slice(0, Math.min(6, Math.max(2, Math.ceil(words.length * 0.28))));\n    const title = (titleWords.join(' ') || 'CODE NOTE').toUpperCase().slice(0, 58);\n    const rest = words.slice(titleWords.length).join(' ');\n    return [title, (rest || source).slice(0, 112)];\n}\n\nexport const CODE_LORE_PAIRS = Object.freeze(CODE_LORE_LINES.map(lineToPair));\n`;
fs.writeFileSync(path.join(outDir, 'index.js'), indexSource);
console.log(JSON.stringify({ files: entries.length, total: entries.reduce((sum, item) => sum + item.count, 0), harvested: entries.reduce((sum, item) => sum + item.harvested, 0), entries }, null, 2));
