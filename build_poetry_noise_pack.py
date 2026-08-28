#!/usr/bin/env python3
"""
build_poetry_noise_pack.py -- builds noise-data-poetry.js from
noise-poetry-corpus.csv.

This is the "verbal" noise layer: human-voiced fragments (found-poetry
lines, overheard hardware-store speech, in-universe maze commentary)
rather than registries/standards. It sits alongside noise-data-hard.js
and noise-data-remote.js (see NOISE_SOURCES.md) as one more district in
the same query-result-noise system, feeding signs/posters/graffiti/
flyers with a warmer, more legible voice than pure protocol/registry
data -- while staying just as bottomless: 3,000+ deduplicated source
lines, none hand-maintained.

The source CSV (noise-poetry-corpus.csv, ~78 MB) is a build-time input
only -- it is not committed and the site never reads it directly. Only
this script's output (noise-data-poetry.js) ships.

Regenerate: python3 build_poetry_noise_pack.py
"""
import csv
import json

SRC = 'noise-poetry-corpus.csv'
OUT = 'noise-data-poetry.js'

# the corpus mixes several source tags (see NOISE_SOURCES.md); only the
# "poetry_*" tagged phrase rows are the new human-voiced material -- the
# rest of the CSV is a re-export of the existing repo_hard registries,
# already covered by noise-data-hard.js/noise-data-remote.js.
POETRY_SOURCE_TAGS = {'poetry_1', 'poetry_2'}


def load_lines():
    seen = set()
    lines = []
    with open(SRC, newline='', encoding='utf-8') as f:
        r = csv.DictReader(f)
        for row in r:
            if row['record_type'] != 'phrase':
                continue
            srcs = set(row['source'].split(';'))
            if not (srcs & POETRY_SOURCE_TAGS):
                continue
            t = row['text'].strip()
            # de-duplicate on the exact string -- this is the whole point:
            # the generated pool must not repeat text within itself.
            if not t or t in seen:
                continue
            seen.add(t)
            lines.append(t)
    return lines


def build_pairs(short, medium, long_):
    # deterministic collage pairs (title, subtitle) in the same spirit as
    # noise-data-hard.js's virtualNoisePairAt -- two independent lines
    # juxtaposed, not a claim they relate. A prime-ish offset keeps a line
    # from ever pairing with itself at the same index.
    titles = short + medium
    subs = medium + long_
    if not titles or not subs:
        return []
    n = min(len(titles), len(subs))
    offset = max(1, len(subs) // 7)
    pairs = []
    for i in range(n):
        t = titles[i % len(titles)]
        s = subs[(i + offset) % len(subs)]
        if s == t:
            s = subs[(i + offset + 1) % len(subs)]
        pairs.append([t, s])
    return pairs


def main():
    lines = load_lines()
    short = [t for t in lines if len(t) <= 40]
    medium = [t for t in lines if 40 < len(t) <= 100]
    long_ = [t for t in lines if 100 < len(t) <= 260]
    # (a handful of >260 char lines exist in the source and are dropped --
    # too long to read as anything but a smear on a small canvas texture,
    # even squished. Nothing else is dropped.)
    pairs = build_pairs(short, medium, long_)

    meta = {
        'totalLines': len(lines),
        'shortLines': len(short),
        'mediumLines': len(medium),
        'longLines': len(long_),
        'pairs': len(pairs),
        'source': 'noise-poetry-corpus.csv (poetry_1, poetry_2 tags)',
    }

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// GENERATED FILE. Do not hand-edit.\n')
        f.write('// Built by build_poetry_noise_pack.py from noise-poetry-corpus.csv.\n')
        f.write('// The "verbal" noise district -- human-voiced fragments, not registry\n')
        f.write('// data. See NOISE_SOURCES.md for provenance.\n\n')
        f.write(f'export const POETRY_NOISE_META = {json.dumps(meta, ensure_ascii=False)};\n\n')
        f.write(f'export const POETRY_LINES_NOISE = {json.dumps(lines, ensure_ascii=False)};\n\n')
        f.write(f'export const POETRY_SHORT_NOISE = {json.dumps(short, ensure_ascii=False)};\n\n')
        f.write(f'export const POETRY_MEDIUM_NOISE = {json.dumps(medium, ensure_ascii=False)};\n\n')
        f.write(f'export const POETRY_LONG_NOISE = {json.dumps(long_, ensure_ascii=False)};\n\n')
        f.write(f'export const POETRY_PAIRS_NOISE = {json.dumps(pairs, ensure_ascii=False)};\n\n')
        f.write(
            'export function pickPoetryLine(rng) {\n'
            '    return POETRY_LINES_NOISE[Math.floor(rng() * POETRY_LINES_NOISE.length)];\n'
            '}\n'
            '// short/medium only -- keeps single-line surfaces (graffiti, stickers)\n'
            '// off the rare 100-260 char lines that would otherwise squash flat.\n'
            'export function pickPoetryTag(rng) {\n'
            '    const pool = rng() < 0.82 ? POETRY_SHORT_NOISE : POETRY_MEDIUM_NOISE;\n'
            '    return pool[Math.floor(rng() * pool.length)];\n'
            '}\n'
            'export function pickPoetryPair(rng) {\n'
            '    return POETRY_PAIRS_NOISE[Math.floor(rng() * POETRY_PAIRS_NOISE.length)];\n'
            '}\n'
        )

    print(f'[poetry] wrote {OUT}: {json.dumps(meta)}')


if __name__ == '__main__':
    main()
