#!/usr/bin/env python3
"""Build the source-derived JWEB language reservoir.

Design constraints:
- No hand-authored vocabulary is permitted in generated corpus records.
- Every emitted token must descend from configured source material.
- Direct source extracts are preferred; deterministic statistical expansion only
  fills component quotas when a source-derived component does not already meet it.
- Release builds fail if any required component is below its configured floor.
- Copyright/terms gates are source-level and fail closed.

The builder is intentionally stdlib-only so it can run on a plain Python 3
installation before a static GitHub Pages deploy.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

UA = "jweb-language-corpus-build/1.0 (+static-site build-time corpus)"
START = "\u0002"
END = "\u0003"

ALLOWED_RIGHTS = {
    "project_owned",
    "public_domain_us",
    "us_government_public_domain",
    "cc0",
    "cc_by_4",
    "registry_notice_required",
    "metadata_only",
    "license_required_local_only",
}

TEXT_RIGHTS = {
    "project_owned",
    "public_domain_us",
    "us_government_public_domain",
    "cc0",
    "cc_by_4",
    "registry_notice_required",
}

SKIP_DIRS_DEFAULT = {
    ".git",
    ".noise-cache",
    ".language-cache",
    "node_modules",
    "checkpoints",
}

TEXT_SUFFIXES = {".txt", ".md", ".html", ".htm"}
DATA_SUFFIXES = {".js", ".mjs", ".cjs", ".json", ".csv", ".tsv"}
TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:['._:/+#-][A-Za-z0-9]+)*|[^\w\s]", re.UNICODE)
JS_STRING_RE = re.compile(
    r"(?P<q>['\"])(?P<s>(?:\\.|(?!\1).){2,260})(?P=q)",
    re.DOTALL,
)
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|[\r\n]+")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


class BuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class Record:
    text: str
    source: str
    transform: str
    source_hash: str


def clean_text(value: str, max_chars: int = 320) -> str:
    value = html.unescape(value or "")
    value = value.replace("\x00", " ")
    value = SPACE_RE.sub(" ", value).strip()
    if len(value) > max_chars:
        value = value[:max_chars].rstrip()
    return value


def stable_hash(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8", "replace")
    return hashlib.sha256(value).hexdigest()


def normalize_key(value: str) -> str:
    return SPACE_RE.sub(" ", value.strip()).casefold()


def iter_json_strings(obj) -> Iterator[str]:
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for item in obj:
            yield from iter_json_strings(item)
    elif isinstance(obj, dict):
        for value in obj.values():
            yield from iter_json_strings(value)


def strip_html(value: str) -> str:
    return clean_text(TAG_RE.sub(" ", value), 1000000)


def strip_gutenberg_wrapper(value: str) -> str:
    upper = value.upper()
    start_markers = (
        "*** START OF THE PROJECT GUTENBERG EBOOK",
        "***START OF THE PROJECT GUTENBERG EBOOK",
    )
    end_markers = (
        "*** END OF THE PROJECT GUTENBERG EBOOK",
        "***END OF THE PROJECT GUTENBERG EBOOK",
    )
    start = -1
    for marker in start_markers:
        at = upper.find(marker)
        if at >= 0:
            line_end = value.find("\n", at)
            start = line_end + 1 if line_end >= 0 else at
            break
    end = len(value)
    for marker in end_markers:
        at = upper.find(marker, max(start, 0))
        if at >= 0:
            end = at
            break
    return value[max(start, 0):end]


def segment_text(value: str, *, min_chars: int = 4, max_chars: int = 260) -> list[str]:
    out = []
    for part in SENTENCE_SPLIT_RE.split(value):
        part = clean_text(part, max_chars)
        if min_chars <= len(part) <= max_chars:
            out.append(part)
    return out


class Fetcher:
    def __init__(self, cache_dir: Path, offline: bool = False):
        self.cache_dir = cache_dir
        self.offline = offline
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, url: str) -> Path:
        parsed = urllib.parse.urlparse(url)
        ext = Path(parsed.path).suffix[:12]
        return self.cache_dir / (stable_hash(url)[:28] + ext)

    def bytes(self, source: dict) -> bytes:
        if source.get("path"):
            path = Path(source["path"])
            if not path.is_absolute():
                path = Path(source.get("repo_root", ".")) / path
            return path.read_bytes()

        url = source.get("url")
        if not url:
            raise BuildError(f"source {source.get('id')} has neither path nor url")
        target = self._cache_path(url)
        if target.exists() and target.stat().st_size:
            return target.read_bytes()
        if self.offline:
            raise BuildError(f"offline cache miss for {source.get('id')}: {url}")
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=int(source.get("timeout", 120))) as response:
            data = response.read()
        target.write_bytes(data)
        delay = float(source.get("post_fetch_delay_seconds", 0))
        if delay > 0:
            time.sleep(delay)
        return data

    def json(self, source: dict) -> object:
        return json.loads(self.bytes(source).decode(source.get("encoding", "utf-8"), "replace"))


class Corpus:
    def __init__(self, components: dict[str, dict]):
        self.components = components
        self.records: dict[str, list[Record]] = {key: [] for key in components}
        self.seen: dict[str, set[str]] = {key: set() for key in components}
        self.source_counts: Counter[tuple[str, str]] = Counter()

    def add(self, component: str, record: Record) -> bool:
        if component not in self.records:
            raise BuildError(f"unknown component {component!r}")
        text = clean_text(record.text)
        if not text:
            return False
        key = normalize_key(text)
        if key in self.seen[component]:
            return False
        self.seen[component].add(key)
        normalized = Record(text, record.source, record.transform, record.source_hash)
        self.records[component].append(normalized)
        self.source_counts[(component, record.source)] += 1
        return True

    def texts(self, component: str) -> list[str]:
        return [record.text for record in self.records[component]]


class MarkovExpander:
    """Deterministic token Markov expansion with zero fallback vocabulary."""

    def __init__(self, texts: Iterable[str], seed: int):
        self.rng = random.Random(seed)
        self.next: dict[tuple[str, str], list[str]] = defaultdict(list)
        self.starts: list[tuple[str, str]] = []
        self.lengths: list[int] = []
        self._train(texts)

    def _train(self, texts: Iterable[str]) -> None:
        for text in texts:
            tokens = TOKEN_RE.findall(text)
            if not tokens:
                continue
            self.lengths.append(len(tokens))
            seq = [START, START] + tokens + [END]
            self.starts.append((seq[0], seq[1]))
            for a, b, c in zip(seq, seq[1:], seq[2:]):
                self.next[(a, b)].append(c)

    def viable(self) -> bool:
        emitted = {token for values in self.next.values() for token in values if token != END}
        return len(emitted) >= 8 and bool(self.lengths)

    def generate(self) -> str:
        if not self.viable():
            return ""
        target = self.rng.choice(self.lengths)
        target = max(2, min(48, target))
        a, b = START, START
        out: list[str] = []
        for _ in range(target + 20):
            choices = self.next.get((a, b))
            if not choices:
                break
            c = self.rng.choice(choices)
            if c == END:
                if len(out) >= 2:
                    break
                continue
            out.append(c)
            a, b = b, c
            if len(out) >= target and END in self.next.get((a, b), ()):
                break
        return detokenize(out)


def detokenize(tokens: list[str]) -> str:
    if not tokens:
        return ""
    text = " ".join(tokens)
    text = re.sub(r"\s+([,.;:!?%\]\)])", r"\1", text)
    text = re.sub(r"([\[\(])\s+", r"\1", text)
    text = re.sub(r"\s+(['\"])", r"\1", text)
    return clean_text(text)


def source_record(text: str, source_id: str, transform: str, raw_hash: str) -> Record:
    return Record(text=text, source=source_id, transform=transform, source_hash=raw_hash)


def extract_repo_strings(source: dict, repo_root: Path) -> list[Record]:
    source_id = source["id"]
    skip_dirs = set(source.get("skip_dirs", [])) | SKIP_DIRS_DEFAULT
    exclude_globs = source.get("exclude_globs", [])
    max_file_bytes = int(source.get("max_file_bytes", 12_000_000))
    records: list[Record] = []

    def excluded(path: Path) -> bool:
        rel = path.relative_to(repo_root)
        if any(part in skip_dirs for part in rel.parts[:-1]):
            return True
        return any(rel.match(pattern) for pattern in exclude_globs)

    for path in sorted(repo_root.rglob("*")):
        if not path.is_file() or excluded(path):
            continue
        if path.suffix.lower() not in (TEXT_SUFFIXES | DATA_SUFFIXES):
            continue
        try:
            if path.stat().st_size > max_file_bytes:
                continue
            raw = path.read_bytes()
        except OSError:
            continue
        raw_hash = stable_hash(raw)
        text = raw.decode("utf-8", "replace")
        suffix = path.suffix.lower()
        candidates: list[str] = []
        if suffix == ".json":
            try:
                candidates.extend(iter_json_strings(json.loads(text)))
            except json.JSONDecodeError:
                pass
        elif suffix in {".csv", ".tsv"}:
            delimiter = "\t" if suffix == ".tsv" else ","
            try:
                for row in csv.reader(io.StringIO(text), delimiter=delimiter):
                    candidates.extend(row)
            except csv.Error:
                pass
        elif suffix in {".js", ".mjs", ".cjs"}:
            candidates.extend(match.group("s") for match in JS_STRING_RE.finditer(text))
        else:
            if suffix in {".html", ".htm"}:
                text = strip_html(text)
            candidates.extend(segment_text(text))

        for candidate in candidates:
            candidate = clean_text(candidate)
            if 4 <= len(candidate) <= 260:
                records.append(source_record(candidate, source_id, "repo_extract", raw_hash))
    return records


def extract_plain_text(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    text = raw.decode(source.get("encoding", "utf-8"), "replace")
    if source.get("strip_html"):
        text = strip_html(text)
    if source.get("strip_gutenberg"):
        text = strip_gutenberg_wrapper(text)
    mode = source.get("segment", "sentences")
    if mode == "lines":
        parts = [clean_text(line) for line in text.splitlines()]
        parts = [line for line in parts if 4 <= len(line) <= 260]
    else:
        parts = segment_text(text)
    return [source_record(part, source["id"], mode, raw_hash) for part in parts]


def extract_zip_text(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    records: list[Record] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = sorted(archive.namelist())
        member_re = re.compile(source.get("member_regex", r"\.(txt|md)$"), re.I)
        for member in members:
            if not member_re.search(member):
                continue
            text = archive.read(member).decode(source.get("encoding", "utf-8"), "replace")
            if source.get("strip_gutenberg"):
                text = strip_gutenberg_wrapper(text)
            for part in segment_text(text):
                records.append(source_record(part, source["id"], "zip_text_sentence", raw_hash))
    return records


def extract_ssa_names(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    counts: Counter[str] = Counter()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for member in archive.namelist():
            if not re.search(r"yob\d{4}\.txt$", member, re.I):
                continue
            with archive.open(member) as fh:
                for line in io.TextIOWrapper(fh, encoding="utf-8", errors="replace"):
                    parts = line.strip().split(",")
                    if len(parts) >= 3 and parts[2].isdigit():
                        counts[parts[0]] += int(parts[2])
    ordered = sorted(counts, key=lambda name: (-counts[name], name.casefold()))
    return [source_record(name, source["id"], "ssa_given_name", raw_hash) for name in ordered]


def extract_census_surnames(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    names: list[str] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not members:
            raise BuildError("Census surname zip contained no CSV")
        with archive.open(members[0]) as fh:
            reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace"))
            for row in reader:
                value = row.get("name") or row.get("NAME") or next(iter(row.values()), "")
                value = clean_text(value, 80)
                if value:
                    names.append(value.title() if value.isupper() else value)
    return [source_record(name, source["id"], "census_surname", raw_hash) for name in names]


def extract_csv_columns(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    text = raw.decode(source.get("encoding", "utf-8-sig"), "replace")
    fields = source.get("fields", [])
    joiner = source.get("joiner", " ")
    records = []
    for row in csv.DictReader(io.StringIO(text)):
        values = [clean_text(row.get(field, ""), 160) for field in fields]
        value = clean_text(joiner.join(value for value in values if value))
        if value:
            records.append(source_record(value, source["id"], "csv_fields", raw_hash))
    return records


def extract_zip_csv_columns(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    fields = source.get("fields", [])
    joiner = source.get("joiner", " ")
    member_re = re.compile(source.get("member_regex", r"\.csv$"), re.I)
    records = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = [name for name in archive.namelist() if member_re.search(name)]
        if not members:
            raise BuildError(f"{source['id']} zip had no matching CSV member")
        for member in members:
            with archive.open(member) as fh:
                reader = csv.DictReader(io.TextIOWrapper(fh, encoding=source.get("encoding", "utf-8-sig"), errors="replace"))
                for row in reader:
                    values = [clean_text(row.get(field, ""), 160) for field in fields]
                    value = clean_text(joiner.join(value for value in values if value))
                    if value:
                        records.append(source_record(value, source["id"], "zip_csv_fields", raw_hash))
    return records


def extract_json_fields(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    obj = json.loads(raw.decode(source.get("encoding", "utf-8"), "replace"))
    items = obj
    for key in source.get("items_path", []):
        items = items[key]
    if not isinstance(items, list):
        raise BuildError(f"{source['id']} items_path did not resolve to a list")
    fields = source.get("fields", [])
    records = []
    for item in items:
        if not isinstance(item, dict):
            continue
        values = [clean_text(str(item.get(field, "")), 180) for field in fields]
        value = clean_text(source.get("joiner", " ").join(v for v in values if v))
        if value:
            records.append(source_record(value, source["id"], "json_fields", raw_hash))
    return records


def extract_xml_tags(source: dict, fetcher: Fetcher) -> list[Record]:
    raw = fetcher.bytes(source)
    raw_hash = stable_hash(raw)
    root = ET.fromstring(raw)
    item_tag = source.get("item_tag")
    tags = source.get("tags", [])
    records = []
    for elem in root.iter():
        if item_tag and elem.tag.rsplit("}", 1)[-1] != item_tag:
            continue
        values = []
        for wanted in tags:
            found = ""
            for child in elem.iter():
                if child.tag.rsplit("}", 1)[-1] == wanted and child.text:
                    found = clean_text(child.text, 180)
                    break
            if found:
                values.append(found)
        value = clean_text(source.get("joiner", " ").join(values))
        if value:
            records.append(source_record(value, source["id"], "xml_tags", raw_hash))
    return records


def extract_musicbrainz_artist(source: dict, fetcher: Fetcher) -> list[Record]:
    """Harvest CC0 MusicBrainz core metadata, never lyric text."""
    if fetcher.offline:
        raise BuildError(f"offline adapter requires cached API snapshots: {source['id']}")
    mbid = source["artist_mbid"]
    endpoints = source.get("entities", ["release-group", "recording", "work"])
    records: list[Record] = []
    for entity in endpoints:
        offset = 0
        limit = 100
        while True:
            query = urllib.parse.urlencode({"artist": mbid, "fmt": "json", "limit": limit, "offset": offset})
            url = f"https://musicbrainz.org/ws/2/{entity}?{query}"
            pseudo = dict(source)
            pseudo["url"] = url
            pseudo["post_fetch_delay_seconds"] = max(1.05, float(source.get("post_fetch_delay_seconds", 1.05)))
            raw = fetcher.bytes(pseudo)
            obj = json.loads(raw.decode("utf-8", "replace"))
            raw_hash = stable_hash(raw)
            list_key = entity + "s"
            if entity == "release-group":
                list_key = "release-groups"
            items = obj.get(list_key, [])
            if not items:
                break
            for item in items:
                title = clean_text(item.get("title", ""), 220)
                if title:
                    records.append(source_record(title, source["id"], f"musicbrainz_{entity}_title", raw_hash))
            offset += len(items)
            total = int(obj.get("count", offset))
            if offset >= total or offset >= int(source.get("max_items", 5000)):
                break
    return records


ADAPTERS = {
    "plain_text": extract_plain_text,
    "zip_text": extract_zip_text,
    "ssa_names": extract_ssa_names,
    "census_surnames": extract_census_surnames,
    "csv_columns": extract_csv_columns,
    "zip_csv_columns": extract_zip_csv_columns,
    "json_fields": extract_json_fields,
    "xml_tags": extract_xml_tags,
    "musicbrainz_artist": extract_musicbrainz_artist,
}


def validate_source(source: dict) -> None:
    source_id = source.get("id")
    rights = source.get("rights")
    if not source_id:
        raise BuildError("source without id")
    if rights not in ALLOWED_RIGHTS:
        raise BuildError(f"{source_id}: unsupported rights policy {rights!r}")
    if rights == "license_required_local_only" and source.get("url"):
        raise BuildError(f"{source_id}: licensed standards text must be a local build input, never auto-fetched")
    if rights == "metadata_only" and source.get("adapter") in {"plain_text", "zip_text"}:
        raise BuildError(f"{source_id}: metadata_only source cannot use body-text adapter")
    components = source.get("components", [])
    if not components:
        raise BuildError(f"{source_id}: no target components")


def harvest_source(source: dict, fetcher: Fetcher, repo_root: Path) -> list[Record]:
    validate_source(source)
    adapter = source.get("adapter")
    if adapter == "repo_strings":
        return extract_repo_strings(source, repo_root)
    fn = ADAPTERS.get(adapter)
    if not fn:
        raise BuildError(f"{source['id']}: unknown adapter {adapter!r}")
    resolved = dict(source)
    resolved["repo_root"] = str(repo_root)
    return fn(resolved, fetcher)


def source_enabled(source: dict, repo_root: Path) -> bool:
    if source.get("enabled", True) is False:
        return False
    env = source.get("requires_env")
    if env and not os.environ.get(env):
        return False
    path = source.get("path")
    if source.get("optional_local") and path:
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = repo_root / candidate
        if not candidate.exists():
            return False
    return True


def derive_person_names(corpus: Corpus, manifest: dict, seed: int) -> int:
    """Combine source-derived given and surname atoms without adding vocabulary."""
    config = manifest.get("derived", {}).get("person_names")
    if not config:
        return 0
    component = config.get("component", "names")
    target = int(config.get("target", corpus.components[component].get("floor", 5000)))
    given_sources = set(config.get("given_sources", []))
    surname_sources = set(config.get("surname_sources", []))
    given = [r.text for r in corpus.records[component] if r.source in given_sources]
    surnames = [r.text for r in corpus.records[component] if r.source in surname_sources]
    if not given or not surnames:
        return 0
    rng = random.Random(seed ^ 0x4E414D45)
    added = 0
    attempts = 0
    while len(corpus.records[component]) < target and attempts < target * 25:
        attempts += 1
        text = f"{rng.choice(given)} {rng.choice(surnames)}"
        raw_hash = stable_hash(text)
        if corpus.add(component, Record(text, "+".join(sorted(given_sources | surname_sources)), "cross_source_name", raw_hash)):
            added += 1
    return added


def expand_component(corpus: Corpus, component: str, floor: int, seed: int) -> int:
    existing = corpus.texts(component)
    if len(existing) >= floor:
        return 0
    model = MarkovExpander(existing, seed)
    if not model.viable():
        return 0
    added = 0
    attempts = 0
    max_attempts = max(5000, (floor - len(existing)) * 80)
    while len(corpus.records[component]) < floor and attempts < max_attempts:
        attempts += 1
        text = model.generate()
        if not text:
            continue
        if corpus.add(component, Record(text, "component_model", "markov_order2", stable_hash(text))):
            added += 1
    return added


def write_runtime_js(path: Path, corpus: Corpus, manifest: dict, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {key: corpus.texts(key) for key in corpus.components}
    meta = {
        "version": manifest.get("version", 1),
        "seed": report["seed"],
        "components": {key: len(values) for key, values in payload.items()},
        "total": sum(len(values) for values in payload.values()),
        "sourceManifestHash": report["manifestHash"],
    }
    with path.open("w", encoding="utf-8") as fh:
        fh.write("// GENERATED FILE. Do not hand-edit.\n")
        fh.write("// Source-derived language reservoir; see LANGUAGE_CORPUS.md.\n\n")
        fh.write("export const LANGUAGE_CORPUS_META = ")
        json.dump(meta, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n\nexport const LANGUAGE_COMPONENTS = ")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n\n")
        fh.write(
            "function ix(rng,n){return Math.min(n-1,Math.floor(rng()*n));}\n"
            "export function pickLanguageText(rng,component){\n"
            "  const pool=LANGUAGE_COMPONENTS[component];\n"
            "  if(!pool||!pool.length)return '';\n"
            "  return pool[ix(rng,pool.length)];\n"
            "}\n"
            "export function pickLanguageComponent(rng){\n"
            "  const keys=Object.keys(LANGUAGE_COMPONENTS).filter(k=>LANGUAGE_COMPONENTS[k].length);\n"
            "  return keys[ix(rng,keys.length)];\n"
            "}\n"
            "export function pickLanguagePair(rng,component){\n"
            "  const c=component||pickLanguageComponent(rng);\n"
            "  return [pickLanguageText(rng,c),pickLanguageText(rng,c)];\n"
            "}\n"
        )


def write_provenance_jsonl(path: Path, corpus: Corpus) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for component in corpus.components:
            for record in corpus.records[component]:
                json.dump({
                    "component": component,
                    "text": record.text,
                    "source": record.source,
                    "transform": record.transform,
                    "sourceHash": record.source_hash,
                }, fh, ensure_ascii=False, separators=(",", ":"))
                fh.write("\n")


def build(args) -> dict:
    manifest_path = Path(args.manifest)
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    components = manifest.get("components", {})
    if not components:
        raise BuildError("manifest has no components")
    for name, config in components.items():
        floor = int(config.get("floor", args.component_floor))
        if floor < args.component_floor:
            raise BuildError(f"{name}: floor {floor} is below required minimum {args.component_floor}")
        config["floor"] = floor

    repo_root = Path(args.repo_root).resolve()
    fetcher = Fetcher(Path(args.cache), args.offline)
    corpus = Corpus(components)
    source_report = {}

    for source in manifest.get("sources", []):
        validate_source(source)
        if args.local_only and source.get("url"):
            source_report[source["id"]] = {"status": "skipped-local-only", "records": 0}
            continue
        source_id = source["id"]
        if not source_enabled(source, repo_root):
            source_report[source_id] = {"status": "disabled", "records": 0}
            continue
        try:
            records = harvest_source(source, fetcher, repo_root)
        except Exception as exc:
            if source.get("optional", False):
                source_report[source_id] = {"status": "skipped", "error": str(exc), "records": 0}
                continue
            raise
        limit = int(source.get("max_records", 0))
        if limit:
            records = records[:limit]
        added = 0
        for record in records:
            for component in source.get("components", []):
                if component not in corpus.components:
                    raise BuildError(f"{source_id}: unknown target component {component!r}")
                if corpus.add(component, record):
                    added += 1
        source_report[source_id] = {"status": "ok", "records": len(records), "placements": added}

    derive_person_names(corpus, manifest, args.seed)

    expansion = {}
    for index, component in enumerate(sorted(components)):
        floor = int(components[component]["floor"])
        expansion[component] = expand_component(corpus, component, floor, args.seed ^ (index * 0x9E3779B1))

    counts = {component: len(corpus.records[component]) for component in components}
    underfilled = {component: count for component, count in counts.items() if count < int(components[component]["floor"])}
    report = {
        "version": manifest.get("version", 1),
        "seed": args.seed,
        "manifestHash": stable_hash(manifest_bytes),
        "counts": counts,
        "underfilled": underfilled,
        "sources": source_report,
        "expanded": expansion,
        "totalPlacements": sum(counts.values()),
    }

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if underfilled and not args.allow_underfilled:
        detail = ", ".join(f"{name}={count}/{components[name]['floor']}" for name, count in sorted(underfilled.items()))
        raise BuildError("component quota failure: " + detail)

    write_runtime_js(Path(args.out), corpus, manifest, report)
    write_provenance_jsonl(Path(args.provenance), corpus)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="language-corpus-sources.json")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--cache", default=".language-cache")
    parser.add_argument("--out", default="noise-data-language.js")
    parser.add_argument("--provenance", default="language-corpus-provenance.jsonl")
    parser.add_argument("--report", default="language-corpus-report.json")
    parser.add_argument("--seed", type=int, default=0x4A574542)
    parser.add_argument("--component-floor", type=int, default=5000)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--local-only", action="store_true", help="use only repo/local sources; skip URL sources")
    parser.add_argument("--allow-underfilled", action="store_true")
    args = parser.parse_args()
    try:
        report = build(args)
    except BuildError as exc:
        print(f"[language-corpus] ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
