// Renders one collected target record into a single self-contained HTML
// file. No build step, no external assets - safe to open straight off disk.

function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function pre(value) {
    return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
}

const STATUS_LABEL = {
    real: 'REAL DATA',
    pending: 'PENDING — see repro command',
    'not-applicable': 'N/A for this target',
};

function renderSection(s) {
    const parts = [];
    parts.push(`<h3><span class="badge badge-${s.status}">${STATUS_LABEL[s.status]}</span> ${esc(s.title)}</h3>`);
    if (s.sourceRefs?.length) {
        parts.push(`<p class="refs">source: ${s.sourceRefs.map(r => `<code>${esc(r)}</code>`).join(', ')}</p>`);
    }
    if (s.data != null) parts.push(pre(s.data));
    if (s.reproCommand) parts.push(`<p class="repro-label">reproduce:</p><pre class="repro">${esc(s.reproCommand)}</pre>`);
    if (s.notes) parts.push(`<p class="notes">${esc(s.notes)}</p>`);
    return `<details ${s.status === 'real' ? 'open' : ''}><summary>${esc(s.key)}</summary><div class="section-body">${parts.join('\n')}</div></details>`;
}

export function renderReport(record) {
    const { slug, label, targetType, mode, generatedAt, gitCommit, nodeVersion, sections } = record;
    const counts = sections.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>JWEB target report — ${esc(label)} (${esc(mode)})</title>
<style>
:root { color-scheme: light dark; }
body { font-family: ui-monospace, "SF Mono", Consolas, monospace; max-width: 920px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
h1 { font-size: 1.3rem; }
h1 .mode { font-size: 0.9rem; opacity: 0.7; font-weight: normal; }
.meta { font-size: 0.85rem; opacity: 0.75; margin-bottom: 1.5rem; }
.meta code { padding: 0 2px; }
details { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 6px; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; }
summary { cursor: pointer; font-weight: 600; }
h3 { margin: 0.5rem 0; font-size: 1rem; }
.section-body { margin-top: 0.5rem; }
.badge { display: inline-block; font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
.badge-real { background: #1b5e20; color: #eaffea; }
.badge-pending { background: #7a5b00; color: #fff6dd; }
.badge-not-applicable { background: #444; color: #ddd; }
pre { background: color-mix(in srgb, currentColor 6%, transparent); padding: 0.6rem; border-radius: 4px; overflow-x: auto; font-size: 0.82rem; }
pre.repro { background: color-mix(in srgb, #7a5b00 15%, transparent); }
.refs { font-size: 0.8rem; opacity: 0.8; }
.notes { font-size: 0.85rem; opacity: 0.85; font-style: italic; }
.repro-label { font-size: 0.8rem; font-weight: 600; margin-bottom: -0.25rem; }
.counts span { margin-right: 1rem; }
.pasteback { margin-top: 2rem; }
.pasteback h2 { font-size: 1rem; }
</style>
</head>
<body>
<h1>${esc(label)} <span class="mode">— ${esc(mode)} mode</span></h1>
<div class="meta">
  target type: <code>${esc(targetType)}</code> ·
  slug: <code>${esc(slug)}</code> ·
  generated: <code>${esc(generatedAt)}</code> ·
  repo commit: <code>${esc(gitCommit)}</code> ·
  node: <code>${esc(nodeVersion)}</code>
</div>
<div class="counts meta">
  ${Object.entries(counts).map(([k, v]) => `<span>${v} ${STATUS_LABEL[k] || k}</span>`).join('')}
</div>
${sections.map(renderSection).join('\n')}
<div class="pasteback">
  <h2>Paste this back if something's wrong</h2>
  <p class="notes">This is the full record — every id, source ref and repro command above, verbatim. Paste it back and say what's wrong; it's enough to regenerate or debug this exact report.</p>
  ${pre(record)}
</div>
</body>
</html>`;
}

export function renderIndex(records) {
    const rows = records.map(r => {
        const path = `${r.slug}/${r.mode}/index.html`;
        return `<tr><td>${esc(r.label)}</td><td><code>${esc(r.mode)}</code></td><td><a href="${esc(path)}">${esc(path)}</a></td></tr>`;
    }).join('\n');
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>JWEB target reports</title>
<style>
:root { color-scheme: light dark; }
body { font-family: ui-monospace, monospace; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
</style>
</head>
<body>
<h1>JWEB target reports</h1>
<p>One unified report format per target, fast (isolated) and slow (full generation) mode. Regenerate with <code>node tools/target-report/run.mjs</code>.</p>
<table><thead><tr><th>target</th><th>mode</th><th>report</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>`;
}
