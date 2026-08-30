import { QP } from '../runtime/main-quantitative-literals.js';
import { CURATED_REMIX_VOICES, CURATED_GRAFFITI_VOICE_NAMES } from '../content/curated/index.js';

export function createNoiseRemixer({
    poetryShort,
    poetryMedium,
    mythologyFragments,
    infraLoreFragments,
    undercityLoreFragments,
    graffitiTags,
    wantedTaglines,
}) {
    const unseededPick = arr => arr[Math.floor(Math.random() * arr.length)];

    function clipNoiseText(value, maxChars) {
        const text = String(value ?? '').replace(/\s+/g, ' ').trim();
        if (text.length <= maxChars) return text;
        return text.slice(QP[190], Math.max(QP[191], maxChars - QP[192])).trimEnd() + '…';
    }

    function poetryShard({ mediumChance = QP[193], minWords = QP[194], maxWords = QP[195], uppercase = false } = {}) {
        const pool = Math.random() < mediumChance ? poetryMedium() : poetryShort();
        const raw = String(unseededPick(pool) ?? '').replace(/\s+/g, ' ').trim();
        const words = raw.split(' ').filter(Boolean);
        if (!words.length) return 'NO SIGNAL';
        const take = Math.max(minWords, Math.min(maxWords, words.length));
        const span = Math.max(QP[196], words.length - take + QP[197]);
        const start = Math.floor(Math.random() * span);
        let shard = words.slice(start, start + take).join(' ').replace(/^[\s,.;:!?/\\|_-]+|[\s,.;:!?/\\|_-]+$/g, '');
        if (!shard) shard = raw;
        return uppercase ? shard.toUpperCase() : shard;
    }

    function pickRandomizedCuratedPair(pool, voiceName = 'street', chance = QP[198]) {
        const base = unseededPick(pool);
        if (!base || Math.random() > chance) return base;
        const voice = CURATED_REMIX_VOICES[voiceName] || CURATED_REMIX_VOICES.street;
        const noun = unseededPick(voice.nouns);
        const verb = unseededPick(voice.verbs);
        const joint = unseededPick(voice.joints);
        const shortA = poetryShard({ minWords: QP[199], maxWords: QP[200], uppercase: true });
        const shortB = poetryShard({ mediumChance: QP[201], minWords: QP[202], maxWords: QP[203] });
        const title = String(base[QP[204]] ?? noun);
        const subtitle = String(base[QP[205]] ?? shortB);
        const recipes = [
            [title, `${subtitle} · ${shortB}`],
            [`${title} / ${shortA}`, shortB],
            [`${noun} ${verb}`, `${subtitle} · ${shortB}`],
            [`${shortA} ${joint} ${noun}`, subtitle],
            [`${noun} ${joint} ${shortA}`, `${verb.toLowerCase()} · ${shortB}`],
            [shortA, `${title.toLowerCase()} · ${shortB}`],
        ];
        const mixed = unseededPick(recipes);
        return [clipNoiseText(mixed[QP[206]], QP[207]), clipNoiseText(mixed[QP[208]], QP[209])];
    }

    function pickRandomizedLorePair() {
        const roll = Math.random();
        if (roll < QP[210]) return pickRandomizedCuratedPair(mythologyFragments, 'myth', QP[211]);
        if (roll < QP[212]) return pickRandomizedCuratedPair(infraLoreFragments, 'infra', QP[213]);
        return pickRandomizedCuratedPair(undercityLoreFragments, 'undercity', QP[214]);
    }

    function pickRandomizedGraffitiTag() {
        const base = unseededPick(graffitiTags());
        if (Math.random() < QP[215]) return clipNoiseText(base, QP[216]);
        const corpus = poetryShard({ mediumChance: QP[217], minWords: QP[218], maxWords: QP[219], uppercase: true });
        const lore = unseededPick(CURATED_GRAFFITI_VOICE_NAMES);
        const voice = CURATED_REMIX_VOICES[lore];
        const subject = unseededPick(voice.nouns);
        const verb = unseededPick(voice.verbs);
        return clipNoiseText(unseededPick([
            `${base} / ${corpus}`,
            `${subject} ${verb}`,
            `${corpus} ${unseededPick(voice.joints)} ${subject}`,
            `${subject} // ${corpus}`,
            `${corpus} // ${base}`,
        ]), QP[220]);
    }

    function pickRandomizedWantedTaglines() {
        const base = pickRandomizedCuratedPair(wantedTaglines, 'wanted', QP[221]);
        if (Math.random() < QP[222]) return base;
        return [
            clipNoiseText(base[QP[223]], QP[224]),
            clipNoiseText(`REWARD: ${poetryShard({ minWords: QP[225], maxWords: QP[226], uppercase: true })}`, QP[227]),
        ];
    }

    return Object.freeze({
        clipNoiseText,
        poetryShard,
        pickRandomizedCuratedPair,
        pickRandomizedLorePair,
        pickRandomizedGraffitiTag,
        pickRandomizedWantedTaglines,
        unseededPick,
    });
}
