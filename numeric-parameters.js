import { PARAMETER_LITERAL_COUNT, PARAMETER_SCHEMA } from './parameter-schema.js';
// Exhaustive quantitative parameter runtime.
//
// Authored game/runtime numeric literals are rewritten at build time to call
// parameterNumber() exactly once, when their module initializes. Query values
// therefore cost nothing in the render loop: hot paths read ordinary module-
// local variables. Runtime-function literals can additionally register a tiny
// generated setter so the P-panel can change future evaluations immediately.
// CONFIG is handled separately after seeded randomization, so cfg.* overrides
// mean "final effective value for this load," not "input to the randomizer."

const QUERY = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const requestedOverrides = new Map();
for (const [key, raw] of QUERY.entries()) {
    if (key.startsWith('n.') || key.startsWith('cfg.')) requestedOverrides.set(key, raw);
}

const desiredOverrides = new Map(requestedOverrides);
const literalState = new Map();
const literalScopeSetters = new Map();
const configRefs = new Map();
const configBaseValues = new Map();
const configLiveBindings = new Map();
const invalidOverrides = new Map();
let configRoot = null;

function sameNumber(a, b) {
    return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
}

export function parseParameterNumber(raw) {
    const text = String(raw).trim();
    if (!text) return { ok: false, value: NaN, reason: 'empty value' };
    if (/^[+]?infinity$/i.test(text)) return { ok: true, value: Infinity };
    if (/^-infinity$/i.test(text)) return { ok: true, value: -Infinity };
    if (/^nan$/i.test(text)) return { ok: true, value: NaN };
    const value = Number(text);
    if (Number.isNaN(value)) return { ok: false, value, reason: `not a number: ${text}` };
    return { ok: true, value };
}

export function formatParameterNumber(value, preferHex = false) {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    if (preferHex && Number.isInteger(value) && value >= 0) return `0x${value.toString(16)}`;
    if (Object.is(value, -0)) return '-0';
    return String(value);
}

function keyParts(key) {
    const parts = key.split('.');
    if (parts[0] !== 'n' || parts.length < 3) return null;
    const index = Number(parts[parts.length - 1]);
    if (!Number.isInteger(index)) return null;
    return { scope: parts.slice(1, -1).join('.'), index };
}

export function parameterNumber(key, sourceDefault, runtimeMutable = false, explicitScope = null, explicitIndex = null) {
    let active = sourceDefault;
    const raw = requestedOverrides.get(key);
    if (raw !== undefined) {
        const parsed = parseParameterNumber(raw);
        if (parsed.ok) active = parsed.value;
        else invalidOverrides.set(key, { raw, reason: parsed.reason });
    }
    const parts = explicitScope !== null && explicitIndex !== null ? { scope: explicitScope, index: explicitIndex } : keyParts(key);
    literalState.set(key, {
        key,
        sourceDefault,
        active,
        runtimeMutable: !!runtimeMutable,
        scope: parts?.scope ?? null,
        index: parts?.index ?? null,
    });
    return active;
}

export function registerLiteralScope(scope, setter) {
    if (typeof setter === 'function') literalScopeSetters.set(scope, setter);
}

function walkConfig(obj, path, seen) {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
    seen.add(obj);
    for (const prop of Object.keys(obj)) {
        const value = obj[prop];
        const next = path.concat(prop);
        if (typeof value === 'number') {
            const key = `cfg.${next.join('.')}`;
            configRefs.set(key, { parent: obj, prop, path: next });
            configBaseValues.set(key, value);
            continue;
        }
        if (value && typeof value === 'object') walkConfig(value, next, seen);
    }
}

export function registerConfigRoot(root) {
    configRoot = root;
    configRefs.clear();
    configBaseValues.clear();
    walkConfig(root, [], new WeakSet());

    let applied = 0;
    for (const [key, raw] of requestedOverrides) {
        if (!key.startsWith('cfg.')) continue;
        const ref = configRefs.get(key);
        if (!ref) continue;
        const parsed = parseParameterNumber(raw);
        if (!parsed.ok) {
            invalidOverrides.set(key, { raw, reason: parsed.reason });
            continue;
        }
        ref.parent[ref.prop] = parsed.value;
        applied++;
    }
    return applied;
}

export function registerConfigLiveParameter(key, apply = null) {
    if (!configRefs.has(key)) return false;
    configLiveBindings.set(key, typeof apply === 'function' ? apply : null);
    return true;
}

export function registerConfigLivePrefix(prefix, apply = null) {
    let count = 0;
    for (const key of configRefs.keys()) {
        if (key === prefix || key.startsWith(prefix + '.')) {
            configLiveBindings.set(key, typeof apply === 'function' ? apply : null);
            count++;
        }
    }
    return count;
}

function baselineFor(key) {
    const literal = literalState.get(key);
    if (literal) return literal.sourceDefault;
    if (configBaseValues.has(key)) return configBaseValues.get(key);
    return undefined;
}

function activeFor(key) {
    const literal = literalState.get(key);
    if (literal) return literal.active;
    const ref = configRefs.get(key);
    if (ref) return ref.parent[ref.prop];
    return undefined;
}

function desiredFor(key) {
    const raw = desiredOverrides.get(key);
    if (raw !== undefined) {
        const parsed = parseParameterNumber(raw);
        if (parsed.ok) return parsed.value;
    }
    return baselineFor(key);
}

function normalizeDesiredOverride(key, raw, value) {
    const base = baselineFor(key);
    if (base !== undefined && sameNumber(value, base)) desiredOverrides.delete(key);
    else desiredOverrides.set(key, raw);
}

export function setDesiredParameter(key, raw) {
    const parsed = parseParameterNumber(raw);
    if (!parsed.ok) return { ok: false, key, raw, reason: parsed.reason };
    const value = parsed.value;

    const literal = literalState.get(key);
    if (literal) {
        normalizeDesiredOverride(key, raw, value);
        if (literal.runtimeMutable && literal.scope !== null && literal.index !== null) {
            const setter = literalScopeSetters.get(literal.scope);
            if (setter && setter(literal.index, value)) {
                literal.active = value;
                return { ok: true, key, value, appliedLive: true, mode: 'live-source' };
            }
        }
        return { ok: true, key, value, appliedLive: false, mode: 'reload' };
    }

    const ref = configRefs.get(key);
    if (ref) {
        normalizeDesiredOverride(key, raw, value);
        if (configLiveBindings.has(key)) {
            ref.parent[ref.prop] = value;
            const apply = configLiveBindings.get(key);
            if (apply) apply(value, key);
            return { ok: true, key, value, appliedLive: true, mode: 'live-config' };
        }
        return { ok: true, key, value, appliedLive: false, mode: 'reload' };
    }

    desiredOverrides.set(key, raw);
    return { ok: true, key, value, appliedLive: false, mode: 'unknown-reload' };
}

export function resetDesiredParameter(key) {
    const base = baselineFor(key);
    if (base === undefined) {
        desiredOverrides.delete(key);
        return { ok: true, key, value: undefined, appliedLive: false, mode: 'unknown-reset' };
    }
    return setDesiredParameter(key, formatParameterNumber(base));
}

export function getParameterState(key) {
    const literal = literalState.get(key);
    const ref = configRefs.get(key);
    const base = baselineFor(key);
    const active = activeFor(key);
    const desired = desiredFor(key);
    const rawDesired = desiredOverrides.get(key);
    const live = literal
        ? !!(literal.runtimeMutable && literalScopeSetters.has(literal.scope))
        : !!(ref && configLiveBindings.has(key));
    return {
        key,
        known: !!literal || !!ref,
        kind: literal ? 'literal' : ref ? 'config' : 'unknown',
        base,
        active,
        desired,
        rawDesired,
        overridden: desiredOverrides.has(key),
        live,
        liveMode: literal && live ? 'future evaluations' : ref && live ? 'runtime binding' : 'reload',
        invalid: invalidOverrides.get(key) ?? null,
    };
}

export function listConfigParameterMetadata() {
    const out = [];
    for (const [key, ref] of configRefs) {
        const path = ref.path.join('.');
        const lower = path.toLowerCase();
        const preferHex = lower.includes('color') || lower.includes('palette') || lower.includes('neon');
        out.push({
            key,
            scope: 'CONFIG',
            file: 'main.js',
            line: null,
            column: null,
            context: `CONFIG.${path}`,
            snippet: `CONFIG.${path}`,
            format: preferHex ? 'hex' : 'number',
            runtimeMutable: configLiveBindings.has(key),
        });
    }
    return out;
}

export function getParameterRuntimeCounts() {
    let liveLiteral = 0;
    for (const state of literalState.values()) if (state.runtimeMutable) liveLiteral++;
    return {
        literal: literalState.size,
        config: configRefs.size,
        total: literalState.size + configRefs.size,
        liveLiteral,
        liveConfig: configLiveBindings.size,
        requested: requestedOverrides.size,
        desiredOverrides: desiredOverrides.size,
        invalid: invalidOverrides.size,
    };
}

export function getRequestedOverrideReport() {
    const rows = [];
    for (const [key, raw] of requestedOverrides) {
        const state = getParameterState(key);
        rows.push({
            key,
            requested: raw,
            applied: state.known && !state.invalid,
            active: state.active,
            kind: state.kind,
            invalid: state.invalid?.reason ?? '',
        });
    }
    return rows;
}

export function announceParameterOverrides(bootStatus, seed) {
    const rows = getRequestedOverrideReport();
    const applied = rows.filter(r => r.applied);
    const failed = rows.filter(r => !r.applied);
    const counts = getParameterRuntimeCounts();
    console.log(`[params] quantitative parameter system schema=${PARAMETER_SCHEMA}: ${counts.literal.toLocaleString()}/${PARAMETER_LITERAL_COUNT.toLocaleString()} authored numeric literals initialized + ${counts.config.toLocaleString()} effective CONFIG leaves`);
    if (!rows.length) return;
    console.groupCollapsed(`[params] parameterized load: ${applied.length}/${rows.length} requested numeric override(s) applied; seed=${seed}`);
    console.table(rows.slice(0, 100));
    if (rows.length > 100) console.log(`[params] ${rows.length - 100} additional requested override(s) omitted from table; inspect window.__params.report()`);
    if (failed.length) console.warn('[params] unapplied/invalid overrides:', failed);
    console.groupEnd();
    const preview = applied.slice(0, 5).map(r => `${r.key}=${formatParameterNumber(r.active)}`).join(' · ');
    if (typeof bootStatus === 'function') {
        bootStatus(`parameterized load: ${applied.length} numeric override${applied.length === 1 ? '' : 's'} active · seed=${seed}${preview ? ' · ' + preview : ''}`);
    }
}

export function buildParameterizedReloadUrl(seedRaw) {
    if (typeof location === 'undefined') throw new Error('Parameterized reload URLs require a browser location.');
    const url = new URL(location.href);
    const keys = [...url.searchParams.keys()];
    for (const key of keys) {
        if (key.startsWith('n.') || key.startsWith('cfg.')) url.searchParams.delete(key);
    }
    const sorted = [...desiredOverrides.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [key, raw] of sorted) url.searchParams.set(key, String(raw));
    if (seedRaw !== undefined && seedRaw !== null && String(seedRaw).trim() !== '') {
        url.searchParams.set('seed', String(seedRaw).trim());
    }
    return url.href;
}

export function getUnknownDesiredOverrides() {
    const out = [];
    for (const [key, raw] of desiredOverrides) {
        if (!literalState.has(key) && !configRefs.has(key)) out.push({ key, raw });
    }
    return out;
}

export function desiredOverrideEntries() {
    return [...desiredOverrides.entries()];
}

if (typeof window !== 'undefined') {
    window.__params = {
        schema: PARAMETER_SCHEMA,
        literalCatalogCount: PARAMETER_LITERAL_COUNT,
        counts: getParameterRuntimeCounts,
        state: getParameterState,
        report: getRequestedOverrideReport,
        desired: desiredOverrideEntries,
        set: setDesiredParameter,
        reset: resetDesiredParameter,
        reloadUrl: buildParameterizedReloadUrl,
    };
}
