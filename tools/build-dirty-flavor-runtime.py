#!/usr/bin/env python3
"""Build the lazy JWEB dirty-flavor runtime sidecar from corpus JSONL.gz shards.

The source corpus is deliberately broad and dirty. This builder does not try to
make every row 'good'; it assigns rows to physical presentation lanes so weak
metadata reads like metadata and only higher-signal rows reach prominent media.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import heapq
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

FLAVOR_BITS = {
    'name': 0, 'census': 1, 'person': 2, 'place': 3, 'geographic': 4,
    'weather': 5, 'scientific': 6, 'station': 7, 'transport': 8,
    'aviation': 9, 'infrastructure': 10, 'industrial': 11, 'petroleum': 12,
    'utility': 13, 'waste': 14, 'mechanical': 15, 'electrical': 16,
    'warning': 17, 'bureaucratic': 18, 'civic': 19, 'security': 20,
    'medical': 21, 'pharmaceutical': 22, 'encoding': 23, 'symbol': 24,
    'technical': 25, 'network': 26, 'protocol': 27, 'legal': 28,
    'literary': 29, 'propaganda': 30, 'music': 31, 'commercial': 32,
    'repair': 33, 'automotive': 34, 'mineral': 35, 'historical': 36,
    'product': 37, 'machine': 38, 'public-domain': 39,
}

# Exactly 78,336 ordinary choices. Music-title ephemera is a separate rare pool.
LANE_QUOTAS = {
    # Weak factual metadata gets the broadest reservoir because it is cheap,
    # background-scale texture. Prominent spectacle stays deliberately scarce.
    'background': 21504,
    'storefront': 8192,
    'flyer': 14336,
    'technical': 16384,
    'institutional': 14848,
    'spectacle': 3072,
}

LANE_WEIGHTS = {
    'background': {
        'names': .30, 'place': .28, 'encoding': .16, 'weather': .10, 'civic': .16,
    },
    'storefront': {
        'commercial': .46, 'medical': .22, 'civic': .18, 'place': .14,
    },
    'flyer': {
        'repair_warning': .24, 'civic': .24, 'literary': .12, 'medical': .10,
        'commercial': .08, 'transport': .12, 'industrial': .10,
    },
    'technical': {
        'network_security': .29, 'repair_warning': .24, 'industrial': .23,
        'encoding': .08, 'transport': .08, 'weather': .08,
    },
    'institutional': {
        'civic': .34, 'transport': .24, 'place': .12, 'weather': .10,
        'industrial': .12, 'medical': .08,
    },
    'spectacle': {
        # Prominent media is intentionally narrow. Generic airports, registry
        # rows, census facts and RFC titles belong elsewhere.
        'repair_warning': .68, 'network_security': .18, 'industrial': .14,
    },
}

CATEGORY_LANE_ELIGIBILITY = defaultdict(set)
for lane, weights in LANE_WEIGHTS.items():
    for category in weights:
        CATEGORY_LANE_ELIGIBILITY[category].add(lane)

WHITESPACE_RE = re.compile(r'\s+')
MOUNTAIN_GOATS_SUFFIX_RE = re.compile(r'\s+is a Mountain Goats recording\.?$', re.I)
PRODUCT_SUFFIX_RE = re.compile(r'\s+is a product\.?$', re.I)
PHARMA_SUFFIX_RE = re.compile(r'\s+is a pharmaceutical product\b.*$', re.I)
RECORDED_FACILITY_RE = re.compile(r'\s+is recorded as (?:an?|the)\s+.*?facility\.?$', re.I)
REGISTRY_PLACES_RE = re.compile(r'^The national facility registry places\s+(.+?)\s+in\s+.+\.?$', re.I)
POPULATION_RE = re.compile(r'^(.+?)\s+has a recorded population of\s+.+$', re.I)


def bit(mask: int, name: str) -> bool:
    return bool(mask & (1 << FLAVOR_BITS[name]))


def normalize(text: str) -> str:
    return WHITESPACE_RE.sub(' ', str(text)).strip()


def stable_score(salt: str, text: str) -> int:
    digest = hashlib.blake2b((salt + '\0' + text).encode('utf-8'), digest_size=8).digest()
    return int.from_bytes(digest, 'big', signed=False)


def category_for(mask: int) -> str:
    if bit(mask, 'literary') or bit(mask, 'public-domain'):
        return 'literary'
    if bit(mask, 'security') or bit(mask, 'network') or bit(mask, 'protocol'):
        return 'network_security'
    if bit(mask, 'warning') or bit(mask, 'repair') or bit(mask, 'automotive') or bit(mask, 'mechanical') or bit(mask, 'electrical'):
        return 'repair_warning'
    if bit(mask, 'medical') or bit(mask, 'pharmaceutical'):
        return 'medical'
    if bit(mask, 'commercial') or bit(mask, 'product'):
        return 'commercial'
    if bit(mask, 'transport') or bit(mask, 'aviation'):
        return 'transport'
    if bit(mask, 'weather') or bit(mask, 'station'):
        return 'weather'
    if bit(mask, 'encoding') or bit(mask, 'symbol'):
        return 'encoding'
    if bit(mask, 'industrial') or bit(mask, 'petroleum') or bit(mask, 'mineral') or bit(mask, 'machine') or bit(mask, 'scientific') or bit(mask, 'technical'):
        return 'industrial'
    # Census/name rows carry a generic bureaucratic bit. Keep that weak metadata
    # in the dedicated names category before the civic/bureaucratic catch-all.
    if bit(mask, 'name') or bit(mask, 'census') or bit(mask, 'person'):
        return 'names'
    if bit(mask, 'infrastructure') or bit(mask, 'utility') or bit(mask, 'waste') or bit(mask, 'bureaucratic') or bit(mask, 'civic') or bit(mask, 'legal'):
        return 'civic'
    if bit(mask, 'place') or bit(mask, 'geographic'):
        return 'place'
    return 'other'


def compact_storefront(text: str) -> str:
    value = text
    m = REGISTRY_PLACES_RE.match(value)
    if m:
        value = m.group(1)
    else:
        m = POPULATION_RE.match(value)
        if m:
            value = m.group(1)
        else:
            value = PRODUCT_SUFFIX_RE.sub('', value)
            value = PHARMA_SUFFIX_RE.sub('', value)
            if ' contains ' in value.lower():
                # Keep the product/brand, not the dosage description.
                idx = value.lower().find(' contains ')
                value = value[:idx]
            value = RECORDED_FACILITY_RE.sub('', value)
    value = value.strip(' .,:;\t-')
    if not (3 <= len(value) <= 64):
        return ''
    if len(value.split()) > 9:
        return ''
    return value


def transform_for_lane(text: str, lane: str) -> str:
    if lane == 'storefront':
        return compact_storefront(text)
    limits = {
        'background': 142,
        'flyer': 168,
        'technical': 152,
        'institutional': 152,
        'spectacle': 128,
    }
    limit = limits[lane]
    if not (8 <= len(text) <= limit):
        return ''
    # Rows that openly announce themselves as metadata are intentionally kept in
    # background/institutional lanes; high prominence must not read like a dump.
    if lane == 'spectacle':
        if re.search(r'\b(?:census|Unicode character name data|recorded population|station observations are recorded)\b', text, re.I):
            return ''
        if re.search(r'\bpharmaceutical product\b|\bsupplied as\b', text, re.I):
            return ''
        if re.search(r'\b(?:stationary facility|facility registry|populated place index|small airport|heliport|airport is|RFC \d+ is titled)\b', text, re.I):
            return ''
        # Industrial/scientific rows earn a megascreen only when the wording
        # itself carries an event, hazard, physical process, or quantitative
        # production signal. Mere facility existence stays institutional.
        if not (
            re.search(r'\b(?:vulnerability|risk|crash|failure|fail|fire|stall|detached|recall|warning|improper|incorrect|may exhibit|may cause|production|mine production|earthquake|explosion|hazard|pressure|temperature|voltage|corrosion|fracture|leak)\b', text, re.I)
            or text.startswith('CISA lists ')
        ):
            return ''
    return text


def category_targets(lane: str, quota: int) -> dict[str, int]:
    weights = LANE_WEIGHTS[lane]
    raw = {cat: quota * weight for cat, weight in weights.items()}
    base = {cat: int(math.floor(value)) for cat, value in raw.items()}
    remaining = quota - sum(base.values())
    order = sorted(weights, key=lambda cat: (-(raw[cat] - base[cat]), cat))
    for cat in order[:remaining]:
        base[cat] += 1
    return base


def push_bounded(heap, limit: int, score: int, text: str):
    # Keep the smallest stable hashes using a max-heap encoded with negative score.
    item = (-score, text)
    if len(heap) < limit:
        heapq.heappush(heap, item)
        return
    if score < -heap[0][0]:
        heapq.heapreplace(heap, item)


def selected_from_heap(heap):
    return [text for _neg, text in sorted(heap, key=lambda item: (-item[0], item[1]))]


def build(corpus_dir: Path, output: Path):
    manifest = json.loads((corpus_dir / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('format') != 'jweb.dirty-flavor-corpus.v1':
        raise SystemExit('unsupported corpus manifest format')

    targets = {lane: category_targets(lane, quota) for lane, quota in LANE_QUOTAS.items()}
    # Keep extra candidates per category so dedupe/transforms cannot starve a lane.
    limits = defaultdict(int)
    for lane, cats in targets.items():
        for category, count in cats.items():
            limits[category] = max(limits[category], int(count * 2.6) + 512)

    category_heaps = {category: [] for category in limits}
    music_heap = []
    music_limit = int(manifest.get('stage_entry_counts', {}).get('musicbrainz', 1200)) + 64
    observed = Counter()
    excluded = Counter()

    shard_files = sorted(corpus_dir.glob('corpus-*.jsonl.gz'))
    if not shard_files:
        raise SystemExit(f'no corpus shards found in {corpus_dir}')

    for shard in shard_files:
        with gzip.open(shard, 'rt', encoding='utf-8') as handle:
            for line in handle:
                row = json.loads(line)
                if not isinstance(row, list) or len(row) < 2:
                    excluded['malformed'] += 1
                    continue
                text = normalize(row[0])
                try:
                    mask = int(str(row[1]), 16)
                except ValueError:
                    excluded['bad-mask'] += 1
                    continue
                observed['rows'] += 1
                if bit(mask, 'propaganda') or bit(mask, 'historical'):
                    excluded['wpa-unseen-poster-description'] += 1
                    continue
                if bit(mask, 'music'):
                    title = MOUNTAIN_GOATS_SUFFIX_RE.sub('', text).strip(' .')
                    if title and title != text and len(title) <= 96:
                        push_bounded(music_heap, music_limit, stable_score('music', title), title)
                    else:
                        excluded['music-unusable-title'] += 1
                    continue
                category = category_for(mask)
                observed[f'category:{category}'] += 1
                if category not in category_heaps:
                    continue
                # Preserve raw source wording here; lane-specific compaction happens
                # after deterministic source-category selection.
                push_bounded(category_heaps[category], limits[category], stable_score(category, text), text)

    category_candidates = {cat: selected_from_heap(heap) for cat, heap in category_heaps.items()}
    lanes = {}
    lane_category_counts = {}
    for lane, quota in LANE_QUOTAS.items():
        chosen = []
        chosen_set = set()
        counts = Counter()
        for category, target in targets[lane].items():
            transformed = []
            for raw in category_candidates.get(category, []):
                value = transform_for_lane(raw, lane)
                if not value or value in chosen_set:
                    continue
                transformed.append((stable_score(f'{lane}:{category}', value), value))
            transformed.sort(key=lambda item: (item[0], item[1]))
            for _score, value in transformed[:target]:
                chosen.append(value)
                chosen_set.add(value)
                counts[category] += 1

        if len(chosen) < quota:
            # Fill any category shortfall from eligible categories without changing
            # lane semantics. Stable score makes the fallback deterministic.
            refill = []
            for category in LANE_WEIGHTS[lane]:
                for raw in category_candidates.get(category, []):
                    value = transform_for_lane(raw, lane)
                    if not value or value in chosen_set:
                        continue
                    refill.append((stable_score(f'{lane}:refill', value), category, value))
            refill.sort(key=lambda item: (item[0], item[2]))
            for _score, category, value in refill:
                if len(chosen) >= quota:
                    break
                chosen.append(value)
                chosen_set.add(value)
                counts[category] += 1

        if len(chosen) != quota:
            raise SystemExit(f'{lane}: expected {quota} rows, got {len(chosen)}')
        # Final stable shuffle prevents category blocks inside a lane.
        chosen.sort(key=lambda value: (stable_score(f'{lane}:order', value), value))
        lanes[lane] = chosen
        lane_category_counts[lane] = dict(sorted(counts.items()))

    music_titles = selected_from_heap(music_heap)
    music_titles = sorted(set(music_titles), key=lambda value: (stable_score('music-order', value), value))

    # Hard quality gates requested for this integration.
    ordinary = [text for values in lanes.values() for text in values]
    if any(MOUNTAIN_GOATS_SUFFIX_RE.search(text) for text in ordinary):
        raise SystemExit('Mountain Goats recording boilerplate leaked into ordinary lanes')
    if any(re.match(r'^A poster\b', text, re.I) for text in ordinary):
        raise SystemExit('unseen-poster description leaked into runtime lanes')
    if any(MOUNTAIN_GOATS_SUFFIX_RE.search(text) for text in music_titles):
        raise SystemExit('Mountain Goats rare-title pool still contains recording boilerplate')

    meta = {
        'schema': 'jweb.dirty-flavor-runtime.v1',
        'sourceFormat': manifest['format'],
        'sourceUniqueEntries': manifest.get('unique_entries'),
        'ordinaryRuntimeRows': sum(len(values) for values in lanes.values()),
        'rareMountainGoatsTitles': len(music_titles),
        'excludedWpaPosterDescriptions': excluded['wpa-unseen-poster-description'],
        'laneCounts': {lane: len(values) for lane, values in lanes.items()},
        'laneCategoryCounts': lane_category_counts,
        'policy': {
            'wpa': 'excluded: poster descriptions require unseen image context',
            'mountainGoats': 'title-only rare flyer ephemera; never recording boilerplate',
            'weakMetadata': 'background/directory/readout lanes',
            'spectacle': 'balanced high-signal warnings/security/transport/industrial/civic/weather only',
        },
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', encoding='utf-8', newline='\n') as out:
        out.write('// Generated by tools/build-dirty-flavor-runtime.py. Do not hand-curate.\n')
        out.write('export const DIRTY_FLAVOR_META = Object.freeze(')
        json.dump(meta, out, ensure_ascii=False, separators=(',', ':'))
        out.write(');\n')
        out.write('export const DIRTY_FLAVOR_LANES = Object.freeze({\n')
        for lane in LANE_QUOTAS:
            out.write(f'  {json.dumps(lane)}: Object.freeze(')
            json.dump(lanes[lane], out, ensure_ascii=False, separators=(',', ':'))
            out.write('),\n')
        out.write('});\n')
        out.write('export const MOUNTAIN_GOATS_RARE_TITLES = Object.freeze(')
        json.dump(music_titles, out, ensure_ascii=False, separators=(',', ':'))
        out.write(');\n')

    print(json.dumps(meta, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corpus-dir', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    build(args.corpus_dir.resolve(), args.output.resolve())


if __name__ == '__main__':
    main()
