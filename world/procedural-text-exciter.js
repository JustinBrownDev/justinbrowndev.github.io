import { hashString32 } from '../world-contract.js';
import { CURATED_CLUTTER_CORPUS, CURATED_CLUTTER_FRAGMENTS } from '../content/curated-clutter/curated-clutter-corpus.js';
import { CURATED_POETRY, CURATED_POETRY_META } from '../content/curated-clutter/curated-poetry-output.js';

// Design ideology only: explicit architectural ideas of this world, not claims
// about the author's political/religious beliefs. These are allowed to leak
// into signs as the city's own operating doctrine.
const DESIGN_IDEOLOGY = Object.freeze([
    'EVERY CHUNK LOADS ITSELF',
    'VISIBLE GEOMETRY OWNS COLLISION',
    'THE MAZE IS THE INTERFACE',
    'PROCEDURE OVER PLACEHOLDER',
    'DATA BECOMES ARCHITECTURE',
    'SIGNAL HIDES IN NOISE',
    'NO MONOLITHIC BOOT PHASE',
    'AUTHORED AND PROCEDURAL ARE PEERS',
    'REVISIT MUST REGENERATE',
    'STRUCTURE FIRST / ORNAMENT LATER',
    'SCHEDULING MUST NOT CHANGE THE WORLD',
    'THE CITY CONTINUES WITHOUT PERMISSION',
    'LOCAL OWNERSHIP / GLOBAL STRANGENESS',
    'COLLISION ARRIVES WITH THE WALL',
    'THE WORLD IS NEVER FINISHED LOADING',
    'ACCRETION IS A BUILDING SYSTEM',
    'ROOFS ARE STREETS',
    'SERVICES LIVE ON THE SKIN',
    'MAINTENANCE IS ORNAMENT',
    'ADJACENT ROOMS BECOME ONE BUILDING',
    'BRIDGES IGNORE PROPERTY LINES',
    'LIGHTWELLS ARE PUBLIC SPACE',
    'CAGES BECOME BALCONIES BECOME ROOMS',
    'THE UTILITY RUN IS A FACADE',
    'UP IS ANOTHER STREET DIRECTION',
    'DENSITY CREATES ITS OWN MAP',
    'EVERY ADDITION INHERITS THE MAZE',
]);

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, values) {
    return values[Math.floor(rng() * values.length) % values.length];
}

function clip(value, max) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function fragmentPhrase(rng, phrase, maxWords = 6) {
    const words = String(phrase ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    const take = 2 + Math.floor(rng() * Math.max(1, maxWords - 1));
    const start = Math.floor(rng() * Math.max(1, words.length - take + 1));
    return words.slice(start, start + take).join(' ');
}

function mutateTypography(rng, text, intensity) {
    let out = text;
    if (rng() < 0.18 + intensity * 0.42) out = rng() < 0.55 ? out.toUpperCase() : out;
    if (rng() < intensity * 0.34) out = out.replace(/\s+/g, pick(rng, [' / ', ' :: ', ' + ', ' // ']));
    if (rng() < intensity * 0.16) out = `${out} ${pick(rng, ['[READY]', '[DIRTY]', '[LOCAL]', '[REVISIT]', '[NO SIGNAL]'])}`;
    return out;
}

export function createProceduralTextExciter({ worldSeed = 0 } = {}) {
    function rngFor(chunk, entityId, channel) {
        return mulberry32(hashString32(`${worldSeed}:text-exciter:${chunk.key}:${entityId}:${channel}`));
    }

    function pairFor(chunk, entityId, channel, fallbackPair = ['NO SIGNAL', 'LOCAL WORLD']) {
        const rng = rngFor(chunk, entityId, channel);
        const weird = Math.max(0, Math.min(1, Number(chunk?.weirdness?.sampled) || 0));
        const intensity = Math.min(1, 0.16 + weird * 0.92);
        const poem = pick(rng, CURATED_POETRY);
        const phraseA = pick(rng, CURATED_CLUTTER_CORPUS);
        const phraseB = pick(rng, CURATED_CLUTTER_CORPUS);
        const fragment = pick(rng, CURATED_CLUTTER_FRAGMENTS);
        const doctrine = pick(rng, DESIGN_IDEOLOGY);
        const fallbackTitle = fallbackPair?.[0] || phraseA;
        const fallbackSubtitle = fallbackPair?.[1] || phraseB;

        // Near spawn, preserve a strong audible connection to the authored/noise
        // corpus. Farther out, weirdness progressively increases splicing depth.
        const titleRecipes = [
            fallbackTitle,
            phraseA,
            poem?.[0] || phraseA,
            `${phraseA} / ${fragment}`,
            doctrine,
        ];
        const subtitleRecipes = [
            fallbackSubtitle,
            phraseB,
            poem?.slice(1, 4).join(' · ') || phraseB,
            `${fragmentPhrase(rng, phraseA)} :: ${fragmentPhrase(rng, phraseB)}`,
            `${doctrine} · ${fragmentPhrase(rng, phraseB)}`,
        ];
        let title = pick(rng, titleRecipes);
        let subtitle = pick(rng, subtitleRecipes);

        if (rng() < weird * 0.72) title = `${fragmentPhrase(rng, title, 5)} / ${fragmentPhrase(rng, pick(rng, CURATED_CLUTTER_CORPUS), 4)}`;
        if (rng() < weird * 0.64) subtitle = `${subtitle} // ${fragmentPhrase(rng, pick(rng, CURATED_CLUTTER_CORPUS), 5)}`;
        if (rng() < 0.08 + weird * 0.27) subtitle = `${doctrine} :: ${subtitle}`;

        return [
            clip(mutateTypography(rng, title, intensity), 72),
            clip(mutateTypography(rng, subtitle, intensity), 116),
        ];
    }

    function tagFor(chunk, entityId, channel, fallback = 'NO SIGNAL') {
        const rng = rngFor(chunk, entityId, channel);
        const weird = Math.max(0, Math.min(1, Number(chunk?.weirdness?.sampled) || 0));
        const source = rng() < 0.28 ? fallback
            : rng() < 0.58 ? pick(rng, CURATED_CLUTTER_FRAGMENTS)
            : fragmentPhrase(rng, pick(rng, CURATED_CLUTTER_CORPUS), 4);
        const withDoctrine = rng() < 0.06 + weird * 0.24 ? `${source} // ${pick(rng, DESIGN_IDEOLOGY)}` : source;
        return clip(mutateTypography(rng, withDoctrine, 0.28 + weird * 0.72), 48);
    }

    return Object.freeze({
        pairFor,
        tagFor,
        stats: Object.freeze({
            canonical: CURATED_CLUTTER_CORPUS.length,
            fragments: CURATED_CLUTTER_FRAGMENTS.length,
            poems: CURATED_POETRY.length,
            poemMeta: CURATED_POETRY_META,
            ideologyAxioms: DESIGN_IDEOLOGY.length,
        }),
    });
}
