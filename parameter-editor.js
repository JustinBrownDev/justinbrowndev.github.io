import { LITERAL_PARAMETER_CATALOG } from './parameter-catalog.js';
import {
    buildParameterizedReloadUrl,
    formatParameterNumber,
    getParameterRuntimeCounts,
    getParameterState,
    getUnknownDesiredOverrides,
    listConfigParameterMetadata,
    resetDesiredParameter,
    setDesiredParameter,
} from './numeric-parameters.js';

let root = null;
let currentSeed = null;
const PAGE_SIZE = 120;

function esc(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function installStyles() {
    if (document.getElementById('parameterEditorStyles')) return;
    const style = document.createElement('style');
    style.id = 'parameterEditorStyles';
    style.textContent = `
#parameterEditorRoot{position:fixed;inset:0;z-index:2000;background:#050708f2;color:#d9e0e4;font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;display:flex;flex-direction:column;backdrop-filter:blur(5px)}
#parameterEditorRoot *{box-sizing:border-box} .peTop{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #4b5660;background:#0b0f12;flex-wrap:wrap}.peTitle{font-weight:800;font-size:15px;letter-spacing:.08em;color:#fff}.peSummary{color:#8fa3ad;margin-right:auto}.peTop button,.peTop input,.peTop select{font:inherit;color:#e8eef2;background:#11181d;border:1px solid #52616b;padding:6px 8px}.peTop button{cursor:pointer}.peGo{background:#1f642f!important;border-color:#61d77a!important;font-weight:800}.peDanger{border-color:#a45a5a!important}.peFilters{display:grid;grid-template-columns:minmax(240px,1fr) 150px 150px 130px auto;gap:8px;padding:8px 12px;border-bottom:1px solid #303a40;background:#090d10}.peFilters input,.peFilters select{width:100%;font:inherit;color:#e8eef2;background:#10161a;border:1px solid #46545d;padding:6px 8px}.peRows{overflow:auto;flex:1;padding:0 12px 12px}.peHeader,.peRow{display:grid;grid-template-columns:minmax(350px,2fr) 130px 190px 105px;gap:8px;align-items:center}.peHeader{position:sticky;top:0;z-index:2;background:#090d10;color:#8fa3ad;padding:8px 4px;border-bottom:1px solid #46545d}.peRow{padding:7px 4px;border-bottom:1px solid #20282d}.peRow:hover{background:#10181d}.peKey{color:#a8d8ff;word-break:break-all}.peContext{color:#d7dde1;margin-top:2px}.peSnippet{color:#788892;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.peActive{color:#f1d48b;word-break:break-all}.peDesired{display:flex;gap:5px}.peDesired input{min-width:0;width:100%;font:inherit;color:#fff;background:#0a0e11;border:1px solid #51616b;padding:5px 6px}.peDesired input.peInvalid{border-color:#ff5454;background:#291010}.peDesired input.pePending{border-color:#e2b84a}.peDesired input.peLive{border-color:#58c47a}.peDesired button{font:inherit;padding:4px 6px;color:#bbb;background:#151b1f;border:1px solid #3b474e;cursor:pointer}.peBadge{display:inline-block;padding:2px 5px;border:1px solid #59666d;color:#9caab1;font-size:9px;margin-right:4px}.peBadge.live{border-color:#3a9c59;color:#7de49a}.peBadge.reload{border-color:#a47e3a;color:#e6c36e}.peBadge.override{border-color:#a15faa;color:#dc8be8}.pePager{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid #303a40;background:#090d10}.pePager button{font:inherit;color:#ddd;background:#11181d;border:1px solid #52616b;padding:5px 9px;cursor:pointer}.peStatus{margin-left:auto;color:#9cb0ba}.peSeed{width:130px}.peEmpty{padding:30px;color:#81919a;text-align:center}@media(max-width:900px){.peHeader,.peRow{grid-template-columns:minmax(260px,2fr) 100px 160px 80px}.peFilters{grid-template-columns:1fr 120px 120px}.peFilters .wideOnly{display:none}}
`;
    document.head.appendChild(style);
}

function allMetadata() {
    const config = listConfigParameterMetadata();
    const literals = LITERAL_PARAMETER_CATALOG.map(row => ({
        key: row[0], scope: row[1], file: row[2], line: row[3], column: row[4],
        context: row[5], snippet: row[6], format: row[7], runtimeMutable: row[8] === 1,
    }));
    return config.concat(literals);
}

function displayValue(value, meta) {
    return formatParameterNumber(value, meta.format === 'hex');
}

function desiredText(state, meta) {
    if (state.rawDesired !== undefined) return state.rawDesired;
    return displayValue(state.desired, meta);
}

function createEditor(seed) {
    installStyles();
    currentSeed = seed;
    root = document.createElement('div');
    root.id = 'parameterEditorRoot';
    root.innerHTML = `
<div class="peTop">
  <div class="peTitle">P / QUANTITATIVE PARAMETERS</div>
  <div class="peSummary"></div>
  <label>seed <input class="peSeed" id="peSeed" value="${esc(seed)}"></label>
  <button id="peCopy">COPY URL</button>
  <button class="peGo" id="peGo">GO / RELOAD</button>
  <button id="peClose">CLOSE</button>
</div>
<div class="peFilters">
  <input id="peSearch" placeholder="search key / function / source line…">
  <select id="peScope"><option value="all">all scopes</option><option value="CONFIG">CONFIG</option><option value="main">main.js</option><option value="physics">player physics</option><option value="perf">performance</option><option value="assets">asset catalog</option></select>
  <select id="peMode"><option value="all">all modes</option><option value="live">live/future</option><option value="reload">reload-only</option><option value="overridden">overridden</option></select>
  <select id="peFormat" class="wideOnly"><option value="all">numbers + colors</option><option value="hex">hex/colors</option><option value="number">decimal</option></select>
  <button id="peResetVisible" class="wideOnly">RESET VISIBLE</button>
</div>
<div class="peRows"><div class="peHeader"><div>parameter / source</div><div>ACTIVE NOW</div><div>DESIRED</div><div>mode</div></div><div id="peBody"></div></div>
<div class="pePager"><button id="pePrev">←</button><span id="pePage"></span><button id="peNext">→</button><span class="peStatus" id="peStatus"></span></div>`;
    document.body.appendChild(root);

    const metadata = allMetadata();
    let page = 0;
    const search = root.querySelector('#peSearch');
    const scope = root.querySelector('#peScope');
    const mode = root.querySelector('#peMode');
    const format = root.querySelector('#peFormat');
    const body = root.querySelector('#peBody');
    const status = root.querySelector('#peStatus');

    function filtered() {
        const q = search.value.trim().toLowerCase();
        return metadata.filter(meta => {
            const st = getParameterState(meta.key);
            if (scope.value !== 'all' && meta.scope !== scope.value) return false;
            if (format.value !== 'all' && meta.format !== format.value) return false;
            if (mode.value === 'live' && !st.live) return false;
            if (mode.value === 'reload' && st.live) return false;
            if (mode.value === 'overridden' && !st.overridden) return false;
            if (q) {
                const hay = `${meta.key} ${meta.scope} ${meta.file} ${meta.line ?? ''} ${meta.context} ${meta.snippet}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function updateSummary() {
        const c = getParameterRuntimeCounts();
        root.querySelector('.peSummary').textContent = `${c.total.toLocaleString()} numeric knobs · ${c.desiredOverrides} URL override${c.desiredOverrides === 1 ? '' : 's'} · ${c.liveConfig + c.liveLiteral} source/live-capable`;
    }

    function setStatus(text, bad = false) {
        status.textContent = text;
        status.style.color = bad ? '#ff7777' : '#9cb0ba';
    }

    function render() {
        const rows = filtered();
        const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        page = Math.max(0, Math.min(page, pages - 1));
        const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        root.querySelector('#pePage').textContent = `${rows.length.toLocaleString()} matching · page ${page + 1}/${pages}`;
        body.innerHTML = '';
        if (!slice.length) {
            body.innerHTML = '<div class="peEmpty">No parameters match this filter.</div>';
            updateSummary();
            return;
        }
        const frag = document.createDocumentFragment();
        for (const meta of slice) {
            const st = getParameterState(meta.key);
            const row = document.createElement('div');
            row.className = 'peRow';
            const line = meta.line ? `${meta.file}:${meta.line}:${meta.column}` : meta.file;
            const liveLabel = st.liveMode === 'runtime binding' ? 'LIVE WORLD' : 'LIVE/FUTURE';
            const badges = `${st.live ? `<span class="peBadge live">${liveLabel}</span>` : '<span class="peBadge reload">RELOAD</span>'}${st.overridden ? '<span class="peBadge override">OVERRIDE</span>' : ''}`;
            row.innerHTML = `
<div><div class="peKey">${esc(meta.key)}</div><div class="peContext">${esc(meta.context || line)}</div><div class="peSnippet" title="${esc(meta.snippet || '')}">${esc(line)} · ${esc(meta.snippet || '')}</div></div>
<div class="peActive">${esc(displayValue(st.active, meta))}</div>
<div class="peDesired"><input spellcheck="false" value="${esc(desiredText(st, meta))}" data-key="${esc(meta.key)}"><button title="reset to this load's baseline">↺</button></div>
<div>${badges}</div>`;
            const input = row.querySelector('input');
            const reset = row.querySelector('button');
            if (st.overridden) input.classList.add('pePending');
            if (st.live) input.classList.add('peLive');
            let timer = null;
            const apply = () => {
                const result = setDesiredParameter(meta.key, input.value);
                input.classList.toggle('peInvalid', !result.ok);
                if (!result.ok) {
                    setStatus(`${meta.key}: ${result.reason}`, true);
                    return;
                }
                const next = getParameterState(meta.key);
                row.querySelector('.peActive').textContent = displayValue(next.active, meta);
                input.classList.toggle('pePending', next.overridden);
                setStatus(result.mode === 'live-config' ? `${meta.key} applied to the current world` : result.mode === 'live-source' ? `${meta.key} source value changed now; GO rebuilds already-created state` : `${meta.key} staged for GO`);
                updateSummary();
            };
            input.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(apply, 180);
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { clearTimeout(timer); apply(); input.blur(); }
            });
            reset.addEventListener('click', () => {
                const result = resetDesiredParameter(meta.key);
                const next = getParameterState(meta.key);
                input.value = displayValue(next.desired, meta);
                input.classList.remove('peInvalid');
                input.classList.toggle('pePending', next.overridden);
                row.querySelector('.peActive').textContent = displayValue(next.active, meta);
                setStatus(result.mode === 'live-config' ? `${meta.key} reset in the current world` : result.mode === 'live-source' ? `${meta.key} source value reset; GO rebuilds already-created state` : `${meta.key} reset staged for GO`);
                updateSummary();
            });
            frag.appendChild(row);
        }
        body.appendChild(frag);
        updateSummary();
    }

    for (const el of [search, scope, mode, format]) el.addEventListener(el === search ? 'input' : 'change', () => { page = 0; render(); });
    root.querySelector('#pePrev').addEventListener('click', () => { page--; render(); });
    root.querySelector('#peNext').addEventListener('click', () => { page++; render(); });
    root.querySelector('#peClose').addEventListener('click', closeParameterEditor);
    function flushVisibleInputs() {
        for (const input of root.querySelectorAll('input[data-key]')) setDesiredParameter(input.dataset.key, input.value);
    }
    root.querySelector('#peGo').addEventListener('click', () => {
        // Do not lose the final keystroke if GO is clicked before the
        // 180ms live-preview debounce fires.
        flushVisibleInputs();
        location.href = buildParameterizedReloadUrl(root.querySelector('#peSeed').value);
    });
    root.querySelector('#peCopy').addEventListener('click', async () => {
        flushVisibleInputs();
        const url = buildParameterizedReloadUrl(root.querySelector('#peSeed').value);
        try { await navigator.clipboard.writeText(url); setStatus('parameterized URL copied'); }
        catch { setStatus('clipboard denied; URL logged to console', true); console.log('[params] URL:', url); }
    });
    root.querySelector('#peResetVisible').addEventListener('click', () => {
        const rows = filtered();
        for (const meta of rows) resetDesiredParameter(meta.key);
        setStatus(`${rows.length} visible/matching parameters reset to baseline`);
        render();
    });

    const unknown = getUnknownDesiredOverrides();
    if (unknown.length) console.warn('[params] URL contains parameter keys unknown to this build:', unknown);
    render();
}

export function closeParameterEditor() {
    if (!root) return;
    root.remove();
    root = null;
}

export function isParameterEditorOpen() { return !!root; }

export function toggleParameterEditor({ seed }) {
    if (root) { closeParameterEditor(); return false; }
    createEditor(seed ?? currentSeed ?? '');
    return true;
}
