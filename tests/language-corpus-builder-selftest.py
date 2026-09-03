#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "build_language_corpus.py"


def run(*args, cwd):
    return subprocess.run([sys.executable, str(BUILDER), *args], cwd=cwd, text=True, capture_output=True)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "source.txt"
        source.write_text("\n".join(f"tok{i:05d} unit{i:05d}." for i in range(6200)) + "\n", encoding="utf-8")
        components = {f"component_{i}": {"floor": 5000} for i in range(3)}
        manifest = {
            "version": 1,
            "components": components,
            "sources": [{
                "id": "fixture",
                "adapter": "plain_text",
                "rights": "project_owned",
                "path": str(source),
                "segment": "lines",
                "components": list(components),
            }],
        }
        manifest_path = root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        proc = run(
            "--manifest", str(manifest_path),
            "--repo-root", str(root),
            "--cache", str(root / "cache"),
            "--out", str(root / "out.js"),
            "--provenance", str(root / "provenance.jsonl"),
            "--report", str(root / "report.json"),
            "--offline",
            cwd=root,
        )
        if proc.returncode != 0:
            print(proc.stdout)
            print(proc.stderr, file=sys.stderr)
            return 1
        report = json.loads((root / "report.json").read_text(encoding="utf-8"))
        assert not report["underfilled"], report["underfilled"]
        assert all(count >= 5000 for count in report["counts"].values())
        assert (root / "out.js").exists()
        assert (root / "provenance.jsonl").exists()

        relative_source = root / "relative-source.txt"
        relative_source.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
        relative_manifest = dict(manifest)
        relative_manifest["sources"] = [{
            "id": "relative_fixture",
            "adapter": "plain_text",
            "rights": "project_owned",
            "path": "relative-source.txt",
            "segment": "lines",
            "components": list(components),
        }]
        relative_path = root / "relative.json"
        relative_path.write_text(json.dumps(relative_manifest), encoding="utf-8")
        outside = root / "outside"
        outside.mkdir()
        relative = run(
            "--manifest", str(relative_path),
            "--repo-root", str(root),
            "--cache", str(root / "relative-cache"),
            "--out", str(root / "relative-out.js"),
            "--provenance", str(root / "relative-provenance.jsonl"),
            "--report", str(root / "relative-report.json"),
            "--offline",
            cwd=outside,
        )
        assert relative.returncode == 0, relative.stderr

        bad_manifest = dict(manifest)
        bad_manifest["sources"] = [{
            "id": "forbidden_remote_standard",
            "adapter": "zip_text",
            "rights": "license_required_local_only",
            "url": "https://example.invalid/standard.zip",
            "components": list(components),
        }]
        bad_path = root / "bad.json"
        bad_path.write_text(json.dumps(bad_manifest), encoding="utf-8")
        bad = run(
            "--manifest", str(bad_path),
            "--repo-root", str(root),
            "--cache", str(root / "cache2"),
            "--out", str(root / "bad.js"),
            "--provenance", str(root / "bad.jsonl"),
            "--report", str(root / "bad-report.json"),
            "--offline",
            cwd=root,
        )
        assert bad.returncode == 2
        assert "local build input" in bad.stderr

    print("language-corpus-builder-selftest: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
