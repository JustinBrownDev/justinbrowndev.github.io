#!/usr/bin/env python3
"""Fetch and collate a deliberately huge public-data information-noise corpus.

Run this on an internet-connected machine during the site build, NOT in the
visitor's browser. The output is an ES module of short [title, subtitle] pairs
for signs/posters/ATMs/newsstands/etc.

The source selection is intentionally impersonal: standards registries,
geographic/infrastructure metadata, scientific events, and technical indexes.
No people-search, breached data, social profiles, or scraped personal records.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

UA = "jweb-information-noise-build/1.0 (build-time public-data collator)"

SOURCES = {
    "iana_ports": "https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv",
    "iana_tlds": "https://data.iana.org/TLD/tlds-alpha-by-domain.txt",
    "ourairports_airports": "https://davidmegginson.github.io/ourairports-data/airports.csv",
    "ourairports_frequencies": "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv",
    "ourairports_runways": "https://davidmegginson.github.io/ourairports-data/runways.csv",
    "ourairports_navaids": "https://davidmegginson.github.io/ourairports-data/navaids.csv",
    "geonames_cities500": "https://download.geonames.org/export/dump/cities500.zip",
    "usgs_earthquakes_month": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
    "noaa_ghcnd_stations": "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt",
    "rfc_index": "https://www.rfc-editor.org/rfc-index.xml",
    "unicode_data": "https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt",
}

ATTRIBUTION = {
    "iana_ports": "IANA Service Name and Transport Protocol Port Number Registry",
    "iana_tlds": "IANA Root Zone TLD list",
    "ourairports_airports": "OurAirports open data (Public Domain)",
    "ourairports_frequencies": "OurAirports open data (Public Domain)",
    "ourairports_runways": "OurAirports open data (Public Domain)",
    "ourairports_navaids": "OurAirports open data (Public Domain)",
    "geonames_cities500": "GeoNames Gazetteer (CC BY 4.0)",
    "usgs_earthquakes_month": "USGS Earthquake Hazards Program",
    "noaa_ghcnd_stations": "NOAA/NCEI Global Historical Climatology Network Daily station metadata",
    "rfc_index": "RFC Editor RFC Index",
    "unicode_data": "Unicode Character Database (Unicode data files; retain Unicode license/notice)",
}


def clean(s, limit=96):
    s = re.sub(r"\s+", " ", str(s or "").strip())
    return s[:limit]


def upper(s, limit=96):
    return clean(s, limit).upper()


def fetch(url: str, cache: Path, timeout=120) -> bytes:
    cache.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("//", 1)[-1])[-160:]
    target = cache / safe
    if target.exists() and target.stat().st_size:
        return target.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    target.write_bytes(data)
    return data


def parse_iana_ports(data: bytes):
    rows = []
    text = data.decode("utf-8-sig", "replace")
    for r in csv.DictReader(io.StringIO(text)):
        name = clean(r.get("Service Name")) or "UNASSIGNED"
        port = clean(r.get("Port Number")) or "—"
        proto = clean(r.get("Transport Protocol")) or "—"
        desc = clean(r.get("Description"), 58) or "IANA SERVICE REGISTRY"
        ref = clean(r.get("Reference"), 28)
        sub = f"{port}/{proto} · {desc}"
        if ref:
            sub += f" · {ref}"
        rows.append([upper(name, 54), upper(sub, 88)])
    return rows


def parse_tlds(data: bytes):
    rows = []
    for line in data.decode("ascii", "replace").splitlines():
        if not line or line.startswith("#"):
            continue
        rows.append([f".{line.upper()}", "IANA ROOT ZONE · TOP-LEVEL DOMAIN"])
    return rows


def csv_rows(data: bytes):
    return csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace")))


def parse_airports(data: bytes):
    out = []
    for r in csv_rows(data):
        ident = clean(r.get("ident"))
        name = clean(r.get("name"), 58)
        typ = clean(r.get("type"))
        country = clean(r.get("iso_country"))
        municipality = clean(r.get("municipality"), 34)
        elev = clean(r.get("elevation_ft"))
        lat = clean(r.get("latitude_deg"))
        lon = clean(r.get("longitude_deg"))
        title = f"{ident} {name}" if ident else name
        sub = " · ".join(x for x in [typ, country, municipality, (f"ELEV {elev}FT" if elev else ""), (f"{lat},{lon}" if lat and lon else "")] if x)
        out.append([upper(title, 64), upper(sub, 90)])
    return out


def parse_frequencies(data: bytes):
    out = []
    for r in csv_rows(data):
        airport = clean(r.get("airport_ident")) or clean(r.get("airport_ref"))
        typ = clean(r.get("type"))
        desc = clean(r.get("description"), 48)
        mhz = clean(r.get("frequency_mhz"))
        if not (airport or mhz):
            continue
        out.append([upper(f"{airport} {typ}", 60), upper(f"{mhz} MHZ · {desc}", 90)])
    return out


def parse_runways(data: bytes):
    out = []
    for r in csv_rows(data):
        apt = clean(r.get("airport_ident"))
        le = clean(r.get("le_ident"))
        he = clean(r.get("he_ident"))
        length = clean(r.get("length_ft"))
        width = clean(r.get("width_ft"))
        surface = clean(r.get("surface"))
        lighted = clean(r.get("lighted"))
        closed = clean(r.get("closed"))
        out.append([upper(f"{apt} RWY {le}/{he}", 60), upper(f"{length}X{width} FT · {surface} · LIGHTED {lighted} · CLOSED {closed}", 90)])
    return out


def parse_navaids(data: bytes):
    out = []
    for r in csv_rows(data):
        ident = clean(r.get("ident"))
        name = clean(r.get("name"), 50)
        typ = clean(r.get("type"))
        freq = clean(r.get("frequency_khz"))
        usage = clean(r.get("usageType")) or clean(r.get("usage_type"))
        country = clean(r.get("iso_country"))
        out.append([upper(f"{ident} {name}", 62), upper(f"{typ} · {freq} KHZ · {usage} · {country}", 90)])
    return out


def parse_geonames(data: bytes):
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next(n for n in z.namelist() if n.endswith(".txt"))
        with z.open(name) as f:
            for bline in f:
                p = bline.decode("utf-8", "replace").rstrip("\n").split("\t")
                if len(p) < 19:
                    continue
                geonameid, name_, ascii_name, alternates, lat, lon, fclass, fcode, cc, cc2, a1, a2, a3, a4, pop, elev, dem, tz, modified = p[:19]
                title = ascii_name or name_
                sub = f"{cc} · POP {pop or '0'} · {lat},{lon} · {tz} · {fcode} · ID {geonameid}"
                out.append([upper(title, 62), upper(sub, 90)])
    return out


def parse_usgs(data: bytes):
    obj = json.loads(data)
    out = []
    for feat in obj.get("features", []):
        p = feat.get("properties") or {}
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        mag = p.get("mag")
        place = clean(p.get("place"), 58)
        ts = p.get("time")
        when = ""
        if isinstance(ts, (int, float)):
            when = dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%MZ")
        loc = ",".join(str(round(float(x), 3)) for x in coords[:3]) if coords else ""
        title = f"M{mag if mag is not None else '?'} {place}"
        sub = f"{when} · {loc} · {p.get('status','')} · {p.get('magType','')} · {feat.get('id','')}"
        out.append([upper(title, 66), upper(sub, 92)])
    return out


def parse_noaa_stations(data: bytes):
    out = []
    for line in data.decode("ascii", "replace").splitlines():
        if len(line) < 71:
            continue
        sid = line[0:11].strip(); lat = line[12:20].strip(); lon = line[21:30].strip()
        elev = line[31:37].strip(); state = line[38:40].strip(); name = line[41:71].strip()
        gsn = line[72:75].strip() if len(line) >= 75 else ""
        hcn = line[76:79].strip() if len(line) >= 79 else ""
        wmo = line[80:85].strip() if len(line) >= 85 else ""
        flags = "/".join(x for x in [gsn, hcn, ("WMO" + wmo if wmo else "")] if x)
        out.append([upper(f"{sid} {name}", 64), upper(f"{state} · {lat},{lon} · ELEV {elev}M · {flags}", 90)])
    return out


def localname(tag):
    return tag.rsplit("}", 1)[-1]


def child_text(elem, name):
    for c in elem.iter():
        if localname(c.tag) == name and c.text:
            return clean(c.text)
    return ""


def parse_rfc(data: bytes):
    root = ET.fromstring(data)
    out = []
    for e in root.iter():
        if localname(e.tag) != "rfc-entry":
            continue
        doc = child_text(e, "doc-id")
        title = child_text(e, "title")
        status = child_text(e, "current-status") or child_text(e, "publication-status")
        month = child_text(e, "month")
        year = child_text(e, "year")
        if doc or title:
            out.append([upper(f"{doc} {title}", 70), upper(f"{month} {year} · {status}", 90)])
    return out


def parse_unicode(data: bytes):
    out = []
    for line in data.decode("utf-8", "replace").splitlines():
        p = line.split(";")
        if len(p) < 10:
            continue
        cp, name, cat, comb, bidi = p[0], p[1], p[2], p[3], p[4]
        if not name or name.startswith("<"):
            continue
        out.append([f"U+{cp} {name}", f"UNICODE · CAT {cat} · BIDI {bidi or 'NONE'} · COMB {comb}"])
    return out

PARSERS = {
    "iana_ports": parse_iana_ports,
    "iana_tlds": parse_tlds,
    "ourairports_airports": parse_airports,
    "ourairports_frequencies": parse_frequencies,
    "ourairports_runways": parse_runways,
    "ourairports_navaids": parse_navaids,
    "geonames_cities500": parse_geonames,
    "usgs_earthquakes_month": parse_usgs,
    "noaa_ghcnd_stations": parse_noaa_stations,
    "rfc_index": parse_rfc,
    "unicode_data": parse_unicode,
}


def write_module(path: Path, pools: dict[str, list[list[str]]], source_meta: dict):
    total = sum(len(v) for v in pools.values())
    with path.open("w", encoding="utf-8") as f:
        f.write("// GENERATED BUILD-TIME PUBLIC DATA. DO NOT HAND-EDIT.\n")
        f.write("// Keep source attributions/terms with the deployed project.\n\n")
        f.write("export const REMOTE_NOISE_META = ")
        json.dump({"generatedUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "rows": total, "sources": source_meta}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n\n")
        for key, rows in pools.items():
            const = re.sub(r"[^A-Za-z0-9]+", "_", key).upper() + "_NOISE"
            f.write(f"export const {const} = ")
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n\n")
        consts = [re.sub(r"[^A-Za-z0-9]+", "_", k).upper() + "_NOISE" for k in pools]
        f.write("export const REMOTE_NOISE_POOLS = [" + ",".join(consts) + "];\n")
        f.write(r'''
function ix(rng, n) { return Math.min(n - 1, Math.floor(rng() * n)); }
export function pickRemoteNoisePair(rng) {
    const pool = REMOTE_NOISE_POOLS[ix(rng, REMOTE_NOISE_POOLS.length)];
    return pool[ix(rng, pool.length)];
}
''')
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="noise-data-remote.js")
    ap.add_argument("--cache", default=".noise-cache")
    ap.add_argument("--skip", action="append", default=[], choices=list(SOURCES))
    ap.add_argument("--per-source-limit", type=int, default=0, help="0 = no limit")
    args = ap.parse_args()

    cache = Path(args.cache)
    pools = {}
    meta = {}
    for key, url in SOURCES.items():
        if key in args.skip:
            continue
        print(f"[{key}] fetching {url}", file=sys.stderr)
        try:
            raw = fetch(url, cache)
            rows = PARSERS[key](raw)
            if args.per_source_limit:
                rows = rows[:args.per_source_limit]
            pools[key] = rows
            meta[key] = {"url": url, "attribution": ATTRIBUTION[key], "rows": len(rows), "bytesDownloaded": len(raw)}
            print(f"[{key}] {len(rows):,} rows", file=sys.stderr)
        except Exception as e:
            meta[key] = {"url": url, "attribution": ATTRIBUTION[key], "error": repr(e)}
            print(f"[{key}] ERROR: {e}", file=sys.stderr)

    total = write_module(Path(args.out), pools, meta)
    print(json.dumps({"output": args.out, "rows": total, "sourcesOk": len(pools), "meta": meta}, indent=2))


if __name__ == "__main__":
    main()
