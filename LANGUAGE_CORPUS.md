# JWEB language corpus

This is the authoritative build contract for JWEB's precomputed language reservoir.

## Non-negotiable rules

1. Every runtime language component has a floor of **5,000 unique post-deduplication items**.
2. The corpus contains **no hand-authored fallback vocabulary**. Source selection, parsing, sampling, recombination, statistical generation, and filtering may be programmed; emitted words must descend from configured sources.
3. Direct source extracts are preferred. Statistical expansion is deterministic and only fills a component after direct harvesting.
4. The release build fails if any component remains under quota.
5. Every build emits provenance mapping each record to source id, transform, and source hash.
6. Source rights fail closed. Unknown rights policy is a build error.
7. Full ANSI/IEEE standards text is **never auto-fetched**. Only metadata explicitly allowed for public reference may be ingested automatically/manually. Full standards text is accepted only as a local build input after the project has the needed reuse rights.
8. The browser never contacts corpus sources. Fetching and transformation are build-time only; GitHub Pages remains strictly static.

## Thematic authority

The thematic center is not an assistant-written style prompt. It comes from source pressure:

- current JWEB text/data and the existing hard/remote/poetry noise system;
- The Mountain Goats via CC0 MusicBrainz recording/work/release metadata and any separately rights-cleared structural measurements, not copied lyrics;
- public-domain Marx/Engels primary text and adjacent public-domain socialist/economic material;
- metallurgy, assaying, steel, mining, materials, NIST, USGS, patents, and engineering documentation;
- ANSI/IEEE designation/title/abstract/scope metadata where reuse is permitted, plus separately licensed local standards text if available;
- historic newspapers, advertisements, public notices, posters, government prose, names, geographic data, registries, transport/scientific feeds, and public-domain literature.

`language-corpus-sources.json` is the machine-readable source of truth. Add or remove sources there rather than embedding word lists in the builder.

## Outputs

`python3 build_language_corpus.py`

produces:

- `noise-data-language.js` - compact runtime component arrays + pickers;
- `language-corpus-provenance.jsonl` - build/audit provenance, not required by the browser;
- `language-corpus-report.json` - counts, source status, expansion counts, and quota failures;
- `.language-cache/` - downloaded build inputs, intentionally not runtime dependencies.

Use `--allow-underfilled` only while adding source adapters. It is not a release mode.

## ANSI / IEEE gate

The manifest has three separate standards paths:

- `ieee_standards_public_metadata`: designation/title/abstract/scope metadata only;
- `ansi_standards_public_metadata`: designation/title/scope/developer metadata only;
- `ansi_ieee_licensed_fulltext`: a local-only ZIP of text for which reuse rights have separately been cleared.

The builder rejects a remote URL for `license_required_local_only`. This is deliberate: access to a standards document is not the same thing as permission to redistribute or create a public derivative corpus from its body text.

## Expansion model

The first model is an order-2 Markov model trained independently per component. It learns token transitions and record-length distribution from harvested records. There is no emergency vocabulary and no template word list. Later models may add POS/dependency structure, embeddings, or graph walks, but the same source-only invariant remains.

The long-term target is hundreds of thousands of direct and derived items while keeping every category at or above the 5,000-item floor.

## Runtime sidecar contract

`content/language-sidecar.js` is the only runtime seam. It preserves the current
static poetry/public-noise behavior until a populated `noise-data-language.js`
exists. A zero-row placeholder is deliberately ignored. Once the source-derived
builder emits a populated sidecar, the same sign/flyer/general-noise callers begin
sampling the component reservoir without changing geometry or adding browser-side
generation work.

The existing `noise-data-poetry.js` remains both an immediate runtime fallback and
source material available to repository harvesting. Geometry decides *where* text
belongs; the sidecar decides *what source-derived text* occupies that opportunity.

## Dirty flavor sidecar placement policy

The `jweb.dirty-flavor-corpus.v1` harvest is not a flat billboard pool. A deterministic
build step (`tools/build-dirty-flavor-runtime.py`) compresses it into a lazy runtime
sidecar and assigns source rows to presentation lanes before they can reach the city.

- **background** — census/name rows, GeoNames/place facts, Unicode/encoding rows,
  weather-station facts, and low-signal registry text. These belong on tiny directory,
  phone-booth, lookup, and readout surfaces.
- **storefront** — compact product, commercial, facility, and place labels only. Long
  registry sentences are reduced to sign-sized labels or rejected.
- **flyer** — repair notices, civic notices, small commercial notices, restrained
  public-domain literary fragments, transport items, and similar paper-scale material.
- **technical** — protocol, security, repair, industrial, encoding, and diagnostic text.
  ATM/service-terminal-like surfaces consume this lane.
- **institutional** — civic, facility, transport, utility, legal, weather, and other
  registry material that reads plausibly on a newsstand card or public notice.
- **spectacle** — intentionally scarce. Only high-signal warnings, vulnerabilities,
  failures/recalls, hazards, earthquakes, or quantitative production/process rows are
  eligible. Census, ordinary airport/facility listings, RFC-title boilerplate, Unicode,
  and pharmaceutical catalog prose are blocked from megascreens.

Two source-specific rules are hard gates:

1. Library of Congress WPA poster descriptions are excluded because the text describes
   an image the player cannot see; the description is not useful as standalone flavor.
2. MusicBrainz Mountain Goats rows never emit `X is a Mountain Goats recording.` The
   wrapper is stripped at build time and title-only metadata is available only through
   an extremely rare flyer-ephemera branch (0.4% of dirty-flavor flyer picks). It is
   never eligible for storefronts, directories, technical screens, institutional media,
   or megascreens.

The generated sidecar is loaded lazily after runtime start. Until hydration completes,
existing language-sidecar content remains the fallback, so this larger reservoir does
not become a first-paint dependency.
