#!/usr/bin/env python3
"""Build a very large, deterministic, browser-friendly information-noise corpus.

This builder uses standards/registries already present on a normal Linux/Python
installation (Unicode, MIME types, IANA-ish /etc/services and /etc/protocols,
IANA tzdata zone tables). It does not scrape personal data.

Output is an ES module designed for the Three.js game: it contains concrete
source rows plus a virtual Cartesian address space that can synthesize billions
of distinct title/subtitle pairs without allocating them all at page load.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import unicodedata
from pathlib import Path


def clean(s: str, n: int = 80) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    return s[:n]


def js(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def unicode_rows(limit: int | None = None):
    out = []
    for cp in range(sys.maxunicode + 1):
        ch = chr(cp)
        try:
            name = unicodedata.name(ch)
        except ValueError:
            continue
        cat = unicodedata.category(ch)
        bidi = unicodedata.bidirectional(ch) or "NONE"
        comb = unicodedata.combining(ch)
        ea = unicodedata.east_asian_width(ch)
        out.append([
            f"U+{cp:04X} {name}",
            f"UNICODE {unicodedata.unidata_version} · CAT {cat} · BIDI {bidi} · COMB {comb} · EAW {ea}",
        ])
        if limit and len(out) >= limit:
            break
    return out


def parse_services(path="/etc/services"):
    out = []
    if not os.path.exists(path):
        return out
    for line in Path(path).read_text(errors="replace").splitlines():
        raw = line.split("#", 1)[0].strip()
        if not raw:
            continue
        parts = raw.split()
        if len(parts) < 2 or "/" not in parts[1]:
            continue
        service = parts[0]
        port, proto = parts[1].split("/", 1)
        aliases = " ".join(parts[2:])
        subtitle = f"PORT {port}/{proto}"
        if aliases:
            subtitle += f" · ALIASES {aliases}"
        out.append([clean(service.upper(), 52), clean(subtitle.upper(), 78)])
    return out


def parse_protocols(path="/etc/protocols"):
    out = []
    if not os.path.exists(path):
        return out
    for line in Path(path).read_text(errors="replace").splitlines():
        raw = line.split("#", 1)[0].strip()
        if not raw:
            continue
        parts = raw.split()
        if len(parts) < 2 or not parts[1].isdigit():
            continue
        name, number = parts[:2]
        aliases = " ".join(parts[2:])
        subtitle = f"IP PROTOCOL {number}"
        if aliases:
            subtitle += f" · {aliases}"
        out.append([clean(name.upper(), 52), clean(subtitle.upper(), 78)])
    return out


def parse_mime(path="/etc/mime.types"):
    out = []
    if not os.path.exists(path):
        # fall back to Python's platform map if the file does not exist
        mimetypes.init()
        seen = set()
        for ext, typ in sorted(mimetypes.types_map.items()):
            if typ in seen:
                continue
            seen.add(typ)
            out.append([typ.upper(), f"MIME TYPE · EXT {ext}"])
        return out
    for line in Path(path).read_text(errors="replace").splitlines():
        raw = line.split("#", 1)[0].strip()
        if not raw:
            continue
        parts = raw.split()
        typ = parts[0]
        exts = parts[1:]
        subtitle = "MIME TYPE"
        if exts:
            subtitle += " · ." + " .".join(exts[:7])
        out.append([clean(typ.upper(), 58), clean(subtitle.upper(), 78)])
    return out


def parse_zones(path="/usr/share/zoneinfo/zone.tab"):
    out = []
    if not os.path.exists(path):
        return out
    for line in Path(path).read_text(errors="replace").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        country, coords, zone = parts[:3]
        comment = parts[3] if len(parts) > 3 else ""
        sub = f"TZDATA · {country} · {coords}"
        if comment:
            sub += f" · {comment}"
        out.append([clean(zone.upper(), 58), clean(sub.upper(), 78)])
    return out


def wear_rows():
    # Generic query-machine vocabulary. These are deliberately not factual
    # claims about a person; they are UI/index/status language.
    status = [
        "INDEXED", "UNINDEXED", "CACHE HIT", "CACHE MISS", "STALE", "REVALIDATING",
        "QUEUED", "CRAWLED", "DISCOVERED", "DUPLICATE", "CANONICAL", "MIRRORED",
        "PARTIAL", "TRUNCATED", "DEFERRED", "RETRYING", "THROTTLED", "RATE LIMITED",
        "REDIRECTED", "MOVED", "GONE", "NOT MODIFIED", "NO CONTENT", "BAD GATEWAY",
        "GATEWAY TIMEOUT", "SERVICE UNAVAILABLE", "LOCKED", "UNAVAILABLE FOR LEGAL REASONS",
        "UNVERIFIED", "AMBIGUOUS", "LOW CONFIDENCE", "HIGH ENTROPY", "NOISY MATCH",
        "EXACT MATCH", "FUZZY MATCH", "TOKENIZED", "NORMALIZED", "STEMMED", "RANKED",
        "SHARDED", "REPLICATED", "DE-DUPED", "COMPRESSED", "ENCRYPTED", "SIGNED",
        "EXPIRED", "REVOKED", "PENDING", "ARCHIVED", "SNAPSHOT", "BACKFILLED",
    ]
    actions = [
        "SEARCH", "LOOKUP", "RESOLVE", "QUERY", "SCAN", "CRAWL", "INDEX", "FETCH",
        "PARSE", "DECODE", "ENCODE", "NORMALIZE", "COMPARE", "RANK", "FILTER", "JOIN",
        "MERGE", "SPLIT", "FOLLOW", "TRACE", "RETRY", "POLL", "REPLAY", "REBUILD",
        "MIRROR", "CACHE", "EVICT", "VERIFY", "INVALIDATE", "REDIRECT", "RECONCILE",
    ]
    targets = [
        "DOCUMENT", "HOST", "PATH", "ORIGIN", "MIRROR", "INDEX", "SHARD", "NODE",
        "PACKET", "SOCKET", "PORT", "ROUTE", "HOP", "FRAME", "STREAM", "OBJECT",
        "RECORD", "ROW", "FIELD", "TOKEN", "TERM", "QUERY", "RESULT", "CACHE LINE",
        "CERTIFICATE", "SIGNATURE", "MANIFEST", "ARCHIVE", "SNAPSHOT", "TIMESTAMP",
        "COORDINATE", "STATION", "AIRPORT", "CITY", "CODEPOINT", "MEDIA TYPE",
    ]
    rows = []
    for i, s in enumerate(status):
        rows.append([s, f"INDEX STATE {i:02d} · MACHINE GENERATED"])
    return status, actions, targets, rows


def write_module(out_path: Path, unicode_limit: int | None):
    unicode_data = unicode_rows(unicode_limit)
    services = parse_services()
    protocols = parse_protocols()
    mime = parse_mime()
    zones = parse_zones()
    status, actions, targets, status_rows = wear_rows()

    concrete_count = sum(map(len, [unicode_data, services, protocols, mime, zones, status_rows]))
    # A virtual pool that is intentionally huge while remaining O(1) memory.
    # 6 templates x each source category x UI vocab layers.
    virtual_count = (
        max(1, len(unicode_data)) * max(1, len(mime)) * len(status) +
        max(1, len(services)) * max(1, len(zones)) * len(actions) * len(targets) +
        max(1, len(protocols)) * max(1, len(mime)) * len(actions) * len(status)
    )

    with out_path.open("w", encoding="utf-8") as f:
        f.write("// GENERATED FILE. Do not hand-edit.\n")
        f.write("// Built by build_local_noise_pack.py from standard registries/databases.\n")
        f.write("// Personal/portfolio truth is intentionally NOT generated here.\n\n")
        f.write("export const MASSIVE_NOISE_META = ")
        f.write(js({
            "unicodeVersion": unicodedata.unidata_version,
            "concreteRows": concrete_count,
            "virtualRows": virtual_count,
            "sources": [
                "Python unicodedata / Unicode Character Database",
                "/etc/mime.types",
                "/etc/services",
                "/etc/protocols",
                "/usr/share/zoneinfo/zone.tab",
            ],
        }))
        f.write(";\n\n")
        for name, arr in [
            ("UNICODE_NOISE", unicode_data),
            ("MIME_NOISE", mime),
            ("SERVICE_NOISE", services),
            ("PROTOCOL_NOISE", protocols),
            ("TIMEZONE_NOISE", zones),
            ("INDEX_STATUS_NOISE", status_rows),
        ]:
            f.write(f"export const {name} = ")
            json.dump(arr, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n\n")

        f.write("export const NOISE_STATUS = ")
        f.write(js(status)); f.write(";\n")
        f.write("export const NOISE_ACTIONS = ")
        f.write(js(actions)); f.write(";\n")
        f.write("export const NOISE_TARGETS = ")
        f.write(js(targets)); f.write(";\n\n")

        f.write(r'''
export const CONCRETE_NOISE_POOLS = [
    UNICODE_NOISE, MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, TIMEZONE_NOISE, INDEX_STATUS_NOISE,
];

function mod(n, m) { return ((n % m) + m) % m; }
function idx01(rng, len) { return Math.min(len - 1, Math.floor(rng() * len)); }

// Pick a factual source row without flattening/copying the concrete pools.
export function pickConcreteNoisePair(rng) {
    const pool = CONCRETE_NOISE_POOLS[idx01(rng, CONCRETE_NOISE_POOLS.length)];
    return pool[idx01(rng, pool.length)];
}

// Deliberately absurd address space: the displayed pair is assembled from
// independent real registry facts plus machine-state vocabulary. The formatting
// is collage, not a claim that the facts are related to each other.
export function virtualNoisePairAt(index) {
    let n = Number(index % Number.MAX_SAFE_INTEGER);
    const mode = mod(n, 6); n = Math.floor(n / 6);
    const u = UNICODE_NOISE[mod(n, UNICODE_NOISE.length)]; n = Math.floor(n / UNICODE_NOISE.length);
    const m = MIME_NOISE[mod(n, MIME_NOISE.length)]; n = Math.floor(n / MIME_NOISE.length);
    const s = SERVICE_NOISE[mod(n, SERVICE_NOISE.length)]; n = Math.floor(n / SERVICE_NOISE.length);
    const p = PROTOCOL_NOISE[mod(n, PROTOCOL_NOISE.length)]; n = Math.floor(n / PROTOCOL_NOISE.length);
    const z = TIMEZONE_NOISE[mod(n, TIMEZONE_NOISE.length)]; n = Math.floor(n / TIMEZONE_NOISE.length);
    const st = NOISE_STATUS[mod(n, NOISE_STATUS.length)]; n = Math.floor(n / NOISE_STATUS.length);
    const act = NOISE_ACTIONS[mod(n, NOISE_ACTIONS.length)]; n = Math.floor(n / NOISE_ACTIONS.length);
    const target = NOISE_TARGETS[mod(n, NOISE_TARGETS.length)];

    switch (mode) {
        case 0: return [`${st}: ${u[0]}`, `${act} ${target} · ${m[0]}`];
        case 1: return [`${act} ${s[0]}`, `${s[1]} · ${z[0]}`];
        case 2: return [`${p[0]} // ${m[0]}`, `${st} · ${p[1]}`];
        case 3: return [`${z[0]}`, `${act} ${target} · ${u[0]}`];
        case 4: return [`${m[0]}`, `${st} · ${s[0]} · ${p[0]}`];
        default: return [`${act} ${target}`, `${u[0]} · ${z[0]} · ${s[0]}`];
    }
}

export function pickVirtualNoisePair(rng) {
    const a = Math.floor(rng() * 0x100000000);
    const b = Math.floor(rng() * 0x100000000);
    const index = (a * 0x100000000 + b) % Number.MAX_SAFE_INTEGER;
    return virtualNoisePairAt(index);
}

// Main game-facing API. Most calls are virtual so repetition is effectively
// impossible during one playthrough, while some remain raw registry rows.
export function pickMassiveNoisePair(rng, virtualChance = 0.92) {
    return rng() < virtualChance ? pickVirtualNoisePair(rng) : pickConcreteNoisePair(rng);
}

// Pool-specific helpers let callers keep environmental semantics instead of
// making every prop pull from the same generic bucket.
export function pickProtocolNoise(rng) {
    const pools = [SERVICE_NOISE, PROTOCOL_NOISE, MIME_NOISE, INDEX_STATUS_NOISE];
    const pool = pools[idx01(rng, pools.length)];
    return pool[idx01(rng, pool.length)];
}
export function pickPlaceLikeNoise(rng) {
    // Local-only pack has timezone/place identifiers; remote pack adds cities,
    // airports, stations, earthquakes, etc. without changing caller APIs.
    return TIMEZONE_NOISE[idx01(rng, TIMEZONE_NOISE.length)];
}
export function pickGlyphNoise(rng) {
    return UNICODE_NOISE[idx01(rng, UNICODE_NOISE.length)];
}
''')

    return {
        "output": str(out_path),
        "bytes": out_path.stat().st_size,
        "unicode": len(unicode_data),
        "mime": len(mime),
        "services": len(services),
        "protocols": len(protocols),
        "zones": len(zones),
        "status": len(status_rows),
        "concrete": concrete_count,
        "virtual": virtual_count,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="noise-data-hard.js")
    ap.add_argument("--unicode-limit", type=int, default=0, help="0 means every named codepoint")
    args = ap.parse_args()
    stats = write_module(Path(args.out), args.unicode_limit or None)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
