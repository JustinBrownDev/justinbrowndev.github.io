import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { CLAUDE_CITY_ASSETS } from './vendor/city-pack/asset-catalog.js';
// ~14 MB local corpus (Unicode/MIME/services/protocols/timezones, concrete
// + a ~17.9B-combination virtual address space) and a ~48 MB corpus of
// real public-data rows fetched at build time (IANA/RFC/OurAirports/
// GeoNames/NOAA/USGS). See build_local_noise_pack.py and
// fetch_massive_public_noise.py to regenerate either. NOISE_SOURCES.md
// has the attribution this data is fetched under.
import {
    UNICODE_NOISE, MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, TIMEZONE_NOISE, INDEX_STATUS_NOISE,
    NOISE_ACTIONS,
    pickMassiveNoisePair, MASSIVE_NOISE_META,
} from './noise-data-hard.js';
import {
    IANA_PORTS_NOISE, IANA_TLDS_NOISE, RFC_INDEX_NOISE,
    OURAIRPORTS_AIRPORTS_NOISE, OURAIRPORTS_FREQUENCIES_NOISE, OURAIRPORTS_RUNWAYS_NOISE, OURAIRPORTS_NAVAIDS_NOISE,
    GEONAMES_CITIES500_NOISE,
    NOAA_GHCND_STATIONS_NOISE, USGS_EARTHQUAKES_MONTH_NOISE,
    REMOTE_NOISE_META,
} from './noise-data-remote.js';
// ~3,300 deduplicated human-voiced fragments (found-poetry lines, overheard
// hardware-store speech, in-universe maze commentary) built from
// noise-poetry-corpus.csv -- the "verbal" district, a warmer voice than the
// registry data above. See build_poetry_noise_pack.py / NOISE_SOURCES.md.
import {
    POETRY_SHORT_NOISE, POETRY_MEDIUM_NOISE, POETRY_PAIRS_NOISE,
    pickPoetryTag, POETRY_NOISE_META,
} from './noise-data-poetry.js';

// ---------- boot diagnostics ----------
// window.__boot (defined inline in index.html, before this module even
// starts fetching) turns "the page is just blank" into a visible,
// timestamped phase log -- what's actually running, how long each phase
// took, and (via the global error handlers registered there) the exact
// error if something throws. Every call is optional-chained: this must
// never be the thing that breaks the page if index.html's markup for it
// is ever missing/stale.
function bootStatus(text) { window.__boot?.status(text); }
function bootElapsed() { return window.__boot ? window.__boot.elapsed().toFixed(2) + 's' : '?s (no __boot -- index.html out of sync with main.js)'; }
console.log('[perf] imports resolved (three.js + full noise corpus fetched+parsed) at', bootElapsed(), 'since page start');
bootStatus(`imports resolved at ${bootElapsed()} -- starting maze/city generation…`);

// =====================================================================
// CONCEPT
// This is the information superhighway rendered as a walkable back alley,
// not a skyline of clean towers. Every surface is a query result — a sign,
// a name, a listing — and the maze is what a search actually feels like:
// everything here is *queryable*. Findable is a different question.
// There are more Justin Browns than one person can Google. Somewhere in
// this grid is exactly one true signal; the rest is noise wearing the
// same name. That's on purpose — a public secret, hidden by abundance
// rather than by hiding. The player is small against all of it (buildings
// dwarf the 1.65-unit eye height on purpose) but still walks it unbound,
// tracing a corridor between the oversaturated, over-indexed "light web"
// and the sparse, half-abandoned "dark web" — in corporeal form, at
// street level, between the two. Set in daylight on purpose: the
// gradient is blinding-noon-glare vs. cooler-overcast-shade, never an
// actual light switch, because none of this is a threat at night — it's
// ordinary, everyday, hiding in the open the way a public secret does.
//
// Built as one system, not separate set pieces: real streets (with
// sidewalks) cut through the same grid as grimier back alleys; parks
// and a handful of walkable building interiors punctuate it; ~500
// instanced junk props and a few real CC0-scanned objects (Poly Haven)
// dress it in situationally, tied to whatever real feature (a
// construction zone, a crime scene, a park) is already there rather than
// scattered at random. Every dataset baked in — the DJIA crash line, the
// Pacific Crest Trail elevation transect, the "3,529 estimated living
// Justin Browns" figure — is real, sourced, and cited inline where it's
// used, not invented to look real.
//
// The ground is only half of it. Above the alleys, the same info-glut
// premise repeats with every rule except walkability dropped: thousands
// of small, ungrounded, gravity-ignoring shapes (see "airborne junk"
// below) drift between and through the towers at every height, dense
// enough that open sky is the exception, not the view. It's the same
// noise-hides-the-signal idea, just made literally hard to see past.
// Woven into the noise on the ground: real wanted posters that are
// actually about him (socials, a track season, the identities he's
// worn) shuffled into the exact same pool as the joke ones, styled
// identically on purpose — the signal was never supposed to look
// different from the noise around it.
// =====================================================================

// =====================================================================
// CONFIG — every tunable lives here. Desktop is the target experience;
// the `mobile` block only overrides what needs to change for touch/perf.
// =====================================================================

const CONFIG = {

    targetPlatform: 'desktop',

    // DAYTIME. Bright open sky, real sun, long sightlines — the gradient
    // below is still a real duality, just played across daylight instead
    // of a day/night switch: blinding open-plaza glare vs. cooler
    // overcast-alley shade, never full dark.
    scene: {
        backgroundColor: 0x7ec4e8,
        fogColor: 0xcfe8f0,
        fogDensity: 0.018,
    },

    // the maze runs along a north/south gradient (grid row, mirrored in
    // world Z) between two poles. Nothing teleports you between them —
    // you walk the gradient continuously, which is the point.
    narrative: {
        // south pole (+row/+Z): "light web" — oversaturated, over-indexed,
        // loud, blinding noon glare. everything about you is here, which
        // is exactly why none of it is you specifically.
        lightWeb: {
            fogColor: 0xf0f4e0,
            fogDensity: 0.022,
            ambientColor: 0xfff4d0,
            ambientIntensity: 2.1,
            hemiIntensity: 1.0,
            signChance: 0.95,
            propDensityMul: 1.2,
        },
        // north pole (-row/-Z): "dark web" — cooler, flatter, overcast —
        // sparser and quieter, never actually dark.
        darkWeb: {
            fogColor: 0xc8d8d8,
            fogDensity: 0.026,
            ambientColor: 0xd0e8e8,
            ambientIntensity: 1.5,
            hemiIntensity: 0.6,
            signChance: 0.85,
            propDensityMul: 0.85,
        },
    },

    camera: {
        fov: 78,
        near: 0.05,
        far: 380,
        eyeHeight: 1.65,
        playerRadius: 0.32,
    },

    lighting: {
        ambientColor: 0xd8d8c8,
        ambientIntensity: 1.8,
        // "moon" is the sun now, high overhead — real directional daylight
        moonColor: 0xfff8e0,
        moonIntensity: 1.2,
        moonPosition: { x: 20, y: 70, z: 10 },
        // warm ground-bounce light so alley shade never reads as flat black
        fillColor: 0xfff4d0,
        fillIntensity: 0.6,
        signLight: {
            intensity: 5,
            distance: 9,
            decay: 2,
        },
    },

    // per-platform render quality. Desktop values are the intended look;
    // mobile trims cost (pixel ratio, bloom, lights, prop count) to hold
    // frame rate on weaker GPUs instead of cutting features outright.
    // Bloom threshold is high on purpose: daylight scenes are bright
    // everywhere, so only genuinely emissive signage should glow, not
    // sunlit concrete.
    quality: {
        // 17x17 world-width pass: floor/hero-floor caps are UNCHANGED on
        // purpose (this is a wider-not-taller pass -- see maze.cols/rows
        // below). propDensity/skyJunkCount/floatingPlatformClusters are
        // interpolated 60% of the way from the 11x11 numbers toward this
        // project's own real historical 21x21 numbers (t=(17-11)/(21-11)
        // =0.6) rather than re-derived from scratch -- that's a real prior
        // tuning pass, not a guess. Per-cell multipliers (propDensity)
        // move DOWN slightly at t=0.6 (2.8 -> 2.5): the map itself now
        // supplies more area, so less artificial per-cell compensation is
        // needed to read as dense. Pure-overdraw globals (skyJunkCount,
        // floatingPlatformClusters) move up, but sub-linearly vs. the
        // ~2.4x area growth (11x11->17x17) -- "more city" should not mean
        // "quadratically more sky clutter."
        desktop: {
            maxPixelRatio: 2,
            antialias: true,
            bloom: { strength: 0.55, radius: 0.4, threshold: 0.88 },
            drawDistance: 380,
            maxDynamicLights: 40,
            propDensity: 2.5,
            skyJunkCount: 3900,
            floatingPlatformClusters: 26,
            maxEnterableFloors: 10, // every floor is real/walkable now -- no decorative tower above this cap, just a shorter real building
            maxHeroFloors: 16, // UNCHANGED -- wider map, not taller buildings
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.4, radius: 0.35, threshold: 0.9 },
            drawDistance: 260,
            maxDynamicLights: 18,
            propDensity: 1.45,
            skyJunkCount: 980,
            floatingPlatformClusters: 12,
            maxEnterableFloors: 7,
            maxHeroFloors: 11, // UNCHANGED
        },
        // auto-selected on low core-count/low-memory machines (touch or
        // not -- see detectWeakGPU below), or forced with ?quality=low.
        // Bloom pass is skipped entirely here, not just turned down --
        // the blur passes have a real GPU cost even at low strength.
        potato: {
            maxPixelRatio: 1,
            antialias: false,
            bloom: null,
            drawDistance: 180,
            maxDynamicLights: 6,
            propDensity: 0.32,
            skyJunkCount: 105, // token amount -- the "buried in noise" read still needs to exist, just barely
            floatingPlatformClusters: 3,
            maxEnterableFloors: 4,
            maxHeroFloors: 6, // UNCHANGED
        },
    },

    // ---------------- maze layout ----------------
    // the whole environment is a grid of building-block cells. Cells are
    // either solid (a building) or open (an alley). A perimeter ring is
    // always solid so the maze is naturally walled in — no invisible clamp.
    maze: {
        // World-width pass: wider again after the 11x11 compression that
        // forced the real-floors/real-stairs/real-facade work. This is
        // ~2.4x the 11x11 footprint (about 55% of the way back to the old
        // 21x21) -- MORE CITY (more blocks, more routes, more buildings,
        // more room for signature locations to sit apart from each other),
        // not taller buildings: CONFIG.buildings/CONFIG.quality's floor
        // counts are untouched by this change. Stays odd -- the DFS carve
        // below moves in steps of 2, so an odd grid is what keeps the
        // parity/perimeter math clean.
        cols: 17,
        rows: 17,
        cellSize: 7,        // world units per grid cell
        loopChance: 0.14,   // chance a redundant wall opens up into a plaza/loop
        buildingMarginMin: 0.5,  // how much smaller than the cell a building footprint is
        buildingMarginMax: 1.4,
    },

    buildings: {
        // floor count IS the height now -- there is no more separate
        // world-unit height rolled first with a decorative, walk-through
        // tower filling in whatever didn't fit a "real" floor. Every unit
        // of visible height corresponds to a real, walkable, stair-
        // connected floor (see addBuildingModule/buildCoreFloor's
        // continuous stair core). height = floorCount * floorHeight,
        // always, exactly.
        floorCountWeights: { 1: 10, 2: 16, 3: 17, 4: 15, 5: 13, 6: 10, 7: 7, 8: 5, 9: 3 },
        // ~8% of buildings are hero buildings -- genuinely more floors
        // (real ones, all the way up), not a taller fake extrusion.
        heroTowerChance: 0.08,
        heroFloorCountWeights: { 8: 5, 9: 5, 10: 4, 11: 3, 12: 3, 13: 2, 14: 1, 15: 1, 16: 1 },
        roughness: 0.92,
        // daylight facades — light concrete/sandstone/brick tones with
        // green/orange/red/cyan casts. NO black, NO purple, anywhere.
        palette: [
            0xd8d4c4, // light concrete
            0xc8c2a8, // sandstone tan
            0xb8c8ac, // pale sage green
            0xd8c488, // mustard tan
            0xd89858, // warm orange-brick
            0xc06858, // muted red-brick
            0xa8c8c8, // pale cyan-gray
            0xe8e4d4, // near-white cream
            0xa0b890, // light olive green
            0xc4b494, // khaki
        ],
        curb: {
            height: 0.12,
            overhang: 0.35, // how far the curb/base skirt extends past the facade
            color: 0xb8b0a0,
        },
    },

    // ---------------- signature locations ----------------
    // Five authored "micro-levels" embedded in the procedural city: a
    // recognizable footprint, a deliberate room graph, real content --
    // built from the SAME wall/floor/facade/stair primitives generic
    // buildings use (see SIGNATURE_BUILDERS near reserveSignatureSites),
    // not a generic building wearing a special sign. Location is
    // procedural (reserveSignatureSites picks WHERE, before generic
    // BuildingSites are assembled -- see assembleBuildingSites); identity
    // and room graph are authored per builder function, not re-rolled.
    //
    // Debug: ?debugSignatures=1 overlays every reserved site + its
    // entrances; ?landmark=<key> (artGallery/as400Archive/justinIndex/
    // systemsWorkshop/loreShrine) spawns just outside that site's main
    // entrance instead of a random maze cell.
    signatureBuildings: {
        enabled: true,
        placement: {
            // Chebyshev cell distance between ANY two signatures' member
            // cells -- keeps them from landing shoulder-to-shoulder on
            // one block. Tuned for the 17x17 map (CONFIG.maze); revisit
            // if the grid size changes again.
            minDistanceCells: 4,
            preferredDistanceCells: 6,
            requireStreetEntrance: true, // >=1 site cell must be adjacent to a real open (alley/street) cell
            requireSecondaryConnection: true, // and a second, independent open-adjacent edge, logged (not hard-failed) if the site's too small/pinched to have one
            maxSeedAttempts: 500, // per signature, before giving up and disabling just that one this load -- never silently squeezed into an invalid spot
        },
        // targetCells: [min,max] site size in cells, same unit
        // SITE_SIZE_WEIGHTS/assembleBuildingSites already uses.
        // preferredFloors feeds the placeholder massing AND (once each
        // builder lands) its real floor plan -- see per-builder TODOs.
        artGallery: {
            enabled: true, targetCells: [5, 7], preferredFloors: 2,
            exteriorName: 'ART GALLERY', exteriorSubtitle: 'open to the public',
        },
        as400Archive: {
            enabled: true, targetCells: [5, 8], preferredFloors: 4,
            exteriorName: 'AS/400 ARCHIVE', exteriorSubtitle: 'midrange reference library',
        },
        justinIndex: {
            enabled: true, targetCells: [6, 9], preferredFloors: 5,
            exteriorName: 'JUSTIN BROWN INDEX', exteriorSubtitle: 'records bureau',
        },
        systemsWorkshop: {
            enabled: true, targetCells: [4, 6], preferredFloors: 2,
            exteriorName: 'SYSTEMS WORKSHOP', exteriorSubtitle: 'parts · repair · fabrication',
        },
        loreShrine: {
            enabled: true, targetCells: [4, 7], preferredFloors: 3,
            exteriorName: 'OFFICE OF MECHANICAL TRUTH', exteriorSubtitle: 'by appointment only',
        },
    },

    // white / yellow / green / orange / red / cyan — the full signage
    // palette. NO black, NO purple. In daylight these read as painted
    // signage rather than glowing neon, which is fine — the color logic
    // (warm toward light-web, cool toward dark-web) still carries the
    // gradient regardless of what time of day it's rendered as.
    // every commonly-nameable color, not a restricted subset -- signage
    // is neon, and real neon comes in every hue there is.
    neonPalette: [
        0xffffff, // white
        0xd8d8d8, // silver
        0x808080, // gray
        0x1a1a1a, // black (bare-bulb-off look, reads on a lit sign frame)
        0xfff02f, // yellow
        0xffd93f, // gold
        0xc8a028, // amber/brass
        0x3aff6a, // green
        0x5eff8a, // lime
        0x1a5c2e, // dark green
        0x2fe8ff, // cyan
        0x5ff0ff, // light cyan
        0x1a7a8a, // teal
        0x2f6aff, // blue
        0x1a3a8a, // navy
        0xa02fff, // purple
        0x6a1a8a, // indigo
        0xd82fff, // magenta
        0xff2fd6, // pink
        0xff8ac0, // light pink
        0xff8a2f, // orange
        0xffa64d, // light orange
        0x8a4a1a, // brown
        0xff3b3b, // red
        0xff5555, // light red
        0x8a1a1a, // maroon
    ],
    // same colors, split by temperature so signage can lean warm toward
    // the light-web pole and cool toward the dark-web pole.
    neonWarm: [0xffffff, 0xfff02f, 0xffd93f, 0xc8a028, 0xff8a2f, 0xffa64d, 0x8a4a1a, 0xff3b3b, 0xff5555, 0x8a1a1a, 0xd82fff, 0xff2fd6, 0xff8ac0],
    neonCool: [0xffffff, 0xd8d8d8, 0x808080, 0x1a1a1a, 0x3aff6a, 0x5eff8a, 0x1a5c2e, 0x2fe8ff, 0x5ff0ff, 0x1a7a8a, 0x2f6aff, 0x1a3a8a, 0xa02fff, 0x6a1a8a],

    // ---------------- real-world data ----------------
    // not synthetic noise — actual sourced numbers, fetched live and baked
    // in rather than called from the browser at runtime (a live third-party
    // API is a fragile thing to hang a visitor's page on). Everything here
    // is real; nothing is invented to look real.
    realData: {
        // DJIA year-end close, 1950-2025, SEC-filed historical table (via
        // researched/verified public data, 2026-08-27). Full annual series
        // now, not just milestone crossings — real recessions (1973-74,
        // 2000-02, 2008) and real bull runs are actual shape in the line,
        // not decoration. This drives the "crack in the concrete" texture.
        djiaMilestones: [
            [1950, 235.41], [1951, 269.23], [1952, 291.90], [1953, 280.90],
            [1954, 404.39], [1955, 488.40], [1956, 499.47], [1957, 435.69],
            [1958, 583.65], [1959, 679.36], [1960, 615.89], [1961, 731.14],
            [1962, 652.10], [1963, 762.95], [1964, 874.13], [1965, 969.26],
            [1966, 785.69], [1967, 905.11], [1968, 943.75], [1969, 800.36],
            [1970, 838.92], [1971, 890.20], [1972, 1020.02], [1973, 850.86],
            [1974, 616.24], [1975, 852.41], [1976, 1004.65], [1977, 831.17],
            [1978, 805.01], [1979, 838.74], [1980, 963.99], [1981, 875.00],
            [1982, 1046.54], [1983, 1258.64], [1984, 1211.57], [1985, 1546.67],
            [1986, 1895.95], [1987, 1938.83], [1988, 2168.57], [1989, 2753.20],
            [1990, 2633.66], [1991, 3168.83], [1992, 3301.11], [1993, 3754.09],
            [1994, 3834.44], [1995, 5117.12], [1996, 6448.27], [1997, 7908.25],
            [1998, 9181.43], [1999, 11497.12], [2000, 10786.85], [2001, 10021.50],
            [2002, 8341.63], [2003, 10453.92], [2004, 10783.01], [2005, 10717.50],
            [2006, 12463.15], [2007, 13264.82], [2008, 8776.39], [2009, 10428.05],
            [2010, 11577.51], [2011, 12217.56], [2012, 13104.14], [2013, 16576.66],
            [2014, 17823.07], [2015, 17425.03], [2016, 19762.60], [2017, 24719.22],
            [2018, 23327.46], [2019, 28538.44], [2020, 30606.48], [2021, 36338.30],
            [2022, 33147.25], [2023, 37689.54], [2024, 42544.22], [2025, 48063.29],
        ],
        // Real elevations in feet (researched/verified public data,
        // 2026-08-27): the actual Pacific Crest Trail transect through
        // Washington (Bridge of the Gods to the Canadian border, 36 real
        // waypoints), plus Illinois' real range as the flat, ordinary
        // literal center of this whole project (SIU Carbondale, College
        // of DuPage — his actual home ground), plus world extremes at
        // both ends. Illinois: mean 590ft, a 956ft total range statewide
        // — genuinely close to flat next to a real trail that swings
        // from 200ft to 6,800ft.
        elevationsFt: [
            ['Mariana Trench (Challenger Deep)', -35876],
            ['Death Valley', -282],
            ['Illinois: Mississippi/Ohio confluence (low pt)', 279],
            ['PCT: Bridge of the Gods', 200], ['PCT: Wind River', 940],
            ['PCT: Panther Creek Rd', 930], ['PCT: Crest Horse Camp', 3490],
            ['PCT: Junction Lake', 4730], ['PCT: Road 23', 3855],
            ['PCT: Kellen Creek Trail', 6084], ['PCT: Sheep Lake', 5760],
            ['PCT: White Pass / Hwy 12', 4405], ['PCT: Chinook Pass / Hwy 410', 5432],
            ['PCT: Big Crow Basin', 6290], ['PCT: Stampede Pass', 3680],
            ['PCT: Cathedral Pass', 5610], ['PCT: Stevens Pass / Hwy 2', 4060],
            ['PCT: Sitcum Creek', 3852], ['PCT: Rainy Pass / Hwy 20', 4855],
            ['PCT: Hart\'s Pass', 6198], ['PCT: Windy Pass', 6257],
            ['PCT: Mountain Camp', 6800], ['PCT: Canadian border', 4240],
            ['Illinois: mean elevation', 590],
            ['Illinois: Charles Mound (high pt)', 1235],
            ['Mount St. Helens, post-1980 eruption', 8363],
            ['Mount St. Helens, pre-1980 eruption', 9677],
            ['Denali', 20310],
            ['K2', 28251],
            ['Mount Everest', 29032],
        ],
        // real Historic Route 66 itinerary, Chicago (its historic eastern
        // terminus, Grant Park) through Illinois to the Mississippi
        // crossing -- researched/verified public data, 2026-08-27.
        // Transportation infrastructure, for real, drives the mile-marker
        // signage scattered through the maze.
        route66Illinois: [
            [0.0, 'CHICAGO'], [39.0, 'JOLIET'], [68.0, 'WILMINGTON'],
            [78.0, 'BRAIDWOOD'], [104.0, 'GARDNER'], [111.0, 'DWIGHT'],
            [139.0, 'PONTIAC'], [142.0, 'CHENOA'], [150.0, 'LEXINGTON'],
            [163.0, 'NORMAL'], [168.5, 'BLOOMINGTON'], [190.0, 'ATLANTA'],
            [204.0, 'LINCOLN'], [227.0, 'SHERMAN'], [254.0, 'DIVERNON'],
            [281.0, 'LITCHFIELD'], [291.0, 'MT. OLIVE'], [297.0, 'STAUNTON'],
            [315.0, 'EDWARDSVILLE'], [330.0, 'CHAIN OF ROCKS BRIDGE'],
            [335.0, 'MISSISSIPPI RIVER'],
        ],
    },

    billboards: {
        // shape/font/border/backing are rolled per-sign now (see
        // SIGN_SHAPES etc. near addSign) instead of one fixed look
        // shared by every sign in the city.
        navPages: [
            { title: 'PROJECTS', subtitle: 'selected work' },
            { title: 'ABOUT', subtitle: 'who\'s behind this' },
            { title: 'BLOG', subtitle: 'notes & writeups' },
            { title: 'CONTACT', subtitle: 'say hello' },
            { title: 'RESUME', subtitle: 'paper trail' },
            { title: 'LAB', subtitle: 'experiments' },
        ],
        // decorative back-alley market / red-light flavor signage — pure texture
        flavorWords: [
            ['RAMEN', 'hot bowl'], ['SUSHI', 'fresh cut'], ['SOBA', 'noodle bar'],
            ['GYOZA', 'pan fried'], ['SAKE', 'warm cup'], ['IZAKAYA', 'open late'],
            ['KARAOKE', 'private room'], ['PACHINKO', '24 hrs'], ['ARCADE', 'coin op'],
            ['HOSTESS', 'no cover'], ['LOUNGE', 'members'], ['CLUB NEON', 'tonight'],
            ['TATTOO', 'walk-ins'], ['SAUNA', 'open 24h'], ['LOVE HTL', 'by hour'],
            ['NOODLES', 'cheap eats'], ['CIGARETTES', 'vending'], ['PAWN', 'cash now'],
            ['FORTUNE', 'palm read'], ['BAR', 'no name'], ['MARKET', 'night stalls'],
            ['VIDEO', 'rental'], ['CURRY', 'house special'], ['GACHA', '¥200'],
            ['HARDWARE', 'keys cut'], ['TAILOR', 'same day'], ['LOCKSMITH', '24hr'],
            ['BIKE REPAIR', 'walk-in'], ['PRINT SHOP', 'copies · fax'], ['HERBALIST', 'loose leaf'],
            ['BAKERY', 'fresh 6am'], ['WATCH REPAIR', 'while you wait'], ['USED BOOKS', 'buy sell trade'],
            ['DRY CLEAN', 'next day'], ['BARBER', 'no appt'], ['HOBBY SHOP', 'model kits'],
            ['PAWN & LOAN', 'gold · guns · gear'], ['24HR DINER', 'always open'], ['CHECK CASHING', 'no ID needed'],
            ['SMOKE SHOP', 'papers · lighters'], ['NAIL SALON', 'walk-ins ok'], ['PHONE REPAIR', 'screens fixed'],
            ['KEY CUTTING', 'while you wait'], ['PSYCHIC READINGS', 'first one free'], ['USED ELECTRONICS', 'cash paid'],
            // the curated list above is hand-picked; everything past this
            // point is a deterministic cross-join of shop noun x tagline
            // (no RNG involved, so it can't shift the maze's seeded layout)
            // -- same back-alley voice, just a lot more of it.
            ...(() => {
                const nouns = [
                    'RAMEN STAND', 'UDON HOUSE', 'DUMPLING BAR', 'TEA HOUSE', 'VINYL SHOP',
                    'CAMERA REPAIR', 'CAPSULE HOTEL', 'INTERNET CAFE', 'BATHHOUSE', 'FLORIST',
                    'STATIONERY', 'ANTIQUES', 'RECORD SHOP', 'COMIC SHOP', 'THRIFT STORE',
                    'JEWELRY', 'SHOE REPAIR', 'UMBRELLA REPAIR', 'FISH MARKET', 'BUTCHER',
                    'GREENGROCER', 'YAKITORI', 'TEMPURA', 'SOBA HOUSE', 'CRAFT BEER',
                    'WINE BAR', 'COFFEE STAND', 'LAUNDROMAT', 'SHRINE GOODS', 'INCENSE SHOP',
                    'KNIFE SHOP', 'RAMEN 2ND FLOOR', 'NOODLE CART', 'CIGAR LOUNGE', 'VAPE SHOP',
                ];
                const tags = [
                    'open late', 'cash only', 'no photos', 'members only', 'ask inside',
                    'closed mondays', '24 hrs', 'walk-ins welcome', 'family owned', 'since forever',
                    'back alley only', 'ring twice', 'basement level', 'second floor', 'no english menu',
                ];
                const out = [];
                for (const n of nouns) for (const t of tags) out.push([n, t]);
                return out;
            })(),
        ],
        // the whole reason this is a maze: real Census (2020, surname
        // "Brown" = rank 4, 1,386,083 people) and SSA (first name
        // "Justin") frequency data combine to an estimated 3,529 living
        // Americans named exactly "Justin Brown" (~1 in 97,125) —
        // researched/verified public data, 2026-08-27, not invented for
        // effect. Every decoy below is one of them, queryable, none of
        // them him.
        decoyIdentities: [
            ['J. BROWN', 'orthodontist · OH'], ['JUSTIN BROWN', 'youth soccer, U12'],
            ['J BROWN', 'in memoriam 1958–2011'], ['JUSTINBROWN99', 'last seen 2013'],
            ['J BROWN LLC', 'entity dissolved'], ['JUSTIN R. BROWN', 'unclaimed property'],
            ['@justinbrown', 'account suspended'], ['J. BROWN', '214 county matches'],
            ['JUSTIN BROWN', 'this is not him'], ['J. BROWN', 'no relation'],
            ['JUSTIN BROWN', 'real estate, TX'], ['J BROWN', 'obituary, 1972'],
            ['JUSTIN BROWN', 'band, defunct'], ['J. BROWN', 'wrong number'],
            ['JUSTIN BROWN', 'see also: 3,529 others'],
        ],
        // the site itself talking back — the machinery of search admitting
        // it came up short, or asking you to keep paying for the privilege.
        systemNoise: [
            ['NO RESULTS', 'refine your query'], ['0 OF 3,529', 'estimated matches'],
            ['404', 'identity not found'], ['ACCESS DENIED', 'insufficient signal'],
            ['CACHED', '3 years stale'], ['RATE LIMITED', 'try again later'],
            ['DELETED', 'profile unavailable'], ['AMBIGUOUS', 'too common a name'],
            ['LOADING', '...'], ['PAYWALL', 'subscribe to continue'],
            ['UNVERIFIED', 'take with salt'], ['INDEXING', 'come back later'],
            // deterministic cross-join, same reasoning as flavorWords above
            ...(() => {
                const statuses = [
                    'TIMEOUT', 'STALE CACHE', 'PARTIAL MATCH', 'QUERY TOO BROAD', 'SESSION EXPIRED',
                    'CAPTCHA REQUIRED', 'THROTTLED', 'MIRROR UNAVAILABLE', 'ARCHIVE ONLY', 'REDACTED',
                    'SYNONYM EXPANDED', 'SPELL-CHECKED', 'RESULTS HIDDEN', 'REGION LOCKED', 'LOGIN REQUIRED',
                    'BOT TRAFFIC DETECTED', 'CRAWLER BLOCKED', 'FLAGGED', 'INDEX REBUILDING', 'FORWARDING',
                ];
                const subs = [
                    'try narrowing your search', 'insufficient signal', 'servers under load',
                    'see terms of service', 'automated response', 'no further information',
                    'check spelling', 'try again later', 'escalated, no ETA', 'ask a human instead',
                ];
                const out = [];
                for (const s of statuses) for (const sub of subs) out.push([s, sub]);
                return out;
            })(),
        ],
        // exactly one of these exists, at the farthest dead end from
        // spawn. everything else in the city is noise wearing his name.
        signal: { title: 'J. BROWN', subtitle: 'verified · you found it', color: 0xffffff },
        // tabloid front pages for the newsstand prop — pure comic relief,
        // still on-theme (the search-for-one-guy joke, played for laughs).
        tabloidHeadlines: [
            ['3,529 JUSTIN BROWNS FOUND', 'none of them him — full report pg. 6'],
            ['LOCAL MAN STILL UNGOOGLABLE', 'experts baffled, ask him for help anyway'],
            ['SEARCH ENGINE ADMITS DEFEAT', '"we have too many results," says spokesbot'],
            ['NAME TOO COMMON, CLAIMS STUDY', 'try a middle initial, scientists suggest'],
            ['PUBLIC SECRET CONFIRMED REAL', 'hidden in plain sight since birth'],
        ],
        // near-misses — styled close enough to the real signal to make you
        // check twice, planted at the 2nd/3rd farthest dead ends. The
        // public secret only works if the almost-right answers are
        // genuinely tempting, not obviously fake.
        nearMissSignals: [
            { title: 'J. BROWN', subtitle: 'unverified — keep looking', color: 0xd8ded8 },
            { title: 'J. BROWN', subtitle: 'listing expired', color: 0xffd93f },
        ],
        // relative odds a given sign face pulls from each bucket — nav
        // pages run out fast on purpose, so decoys and noise dominate.
        contentWeights: { nav: 3, decoy: 6, noise: 3, flavor: 5, data: 18 },
    },

    // pulled directly from the real jweb.dev content (index.html) — the
    // maze isn't just mood-boarding "Justin Brown," it's built out of the
    // actual resume/projects/art. ~35 entries across 7 categories, each
    // rendered by one of 5 dedicated generator archetypes below.
    siteContent: {
        skills: [
            ['PYTHON', 'daily driver'], ['WEB DEV', 'html/css/js'],
            ['LEADERSHIP', 'ACM president'], ['C / C# / C++', 'systems'],
            ['EMBEDDED', 'bare metal'], ['LINUX', 'no distro war'],
        ],
        education: [
            ['SIU CARBONDALE', 'B.S. comp sci · 2023-now'],
            ['ACM PRESIDENT', 'assoc. of computing machinery'],
            ['COLLEGE OF DUPAGE', '2019-2023'],
            ['COURSEWORK', 'ML · cybersecurity · SWE'],
        ],
        employment: [
            ['DATAANNOTATION', 'AI trainer · 2024-now'],
            ["HORTON'S LIGHTING", 'warehouse · 2021-23'],
            ['LA GRANGE THEATER', 'projectionist · 2018-20'],
            ['ACE HARDWARE', 'former job'],
            ['DRY CLEANERS', 'former job'],
        ],
        art: [
            ["'TEETH'", 'acrylic on canvas'],
            ['SELF PORTRAIT', 'acrylic on canvas'],
            ["'GARY FISCHER'", 'india ink on paper'],
            ["'THE FISH'", 'linoleum print'],
            ['ORGANIC TV', 'cast iron · lost wax'],
            ['PUPPET HEAD', 'wire & tissue paper'],
        ],
        // technical builds — rendered as glowing terminal/CRT plaques
        codeProjects: [
            ['TRAFFIC BLASTER', 'python · openvpn, 2024'],
            ['SLIDING TILES', 'python solver, 2023'],
            ['SPINNING CUBE', 'c++ terminal 3d, 2022'],
            ['BIBITINATOR', 'c# save editor, 2021'],
            ['MC COMPUTER', 'copper bulb logic, 2025'],
            ['CYBERDECK', 'raspberry pi rig, 2024'],
            ['EMP GENERATOR', 'grill lighter build, 2024'],
        ],
        // client/design work — rendered as framed wall posters
        webProjects: [
            ['VITALSAGE', 'wordpress build, 2024'],
            ['BRANDYOUPROMO', 'asp.net site, 2022'],
        ],
        // rhetoric fragments — half bio, half the concept itself
        about: [
            ['TAKE IT APART', 'to see how it works'],
            ['ALWAYS LEARNING', 'next skill, next problem'],
            ['UNBOUND', 'not afraid of the machine'],
            ['THEY ASK ME', "for the advice"],
            ['PUBLIC SECRET', 'hidden by numbers, not by hiding'],
        ],
        // real photos, not renders/paintings -- rendered the same way as
        // art/webProjects (see mountContentCards + PHOTO_BY_TITLE), just
        // kept in their own category since they're personal snapshots,
        // not finished pieces or client work.
        lifePhotos: [
            ['GRADUATION', 'SIU Carbondale'],
            ['FOUNDRY DAY', 'iron casting'],
            ['SERVER RACK', 'cable management, in progress'],
            ['DISK ARRAY', 'reclaimed hardware'],
            ['MIRROR, 2AM', 'a photo, for once'],
        ],
        // dropped on the ground like litter — real contact info, decoyed
        // among all the fake ones from billboards.decoyIdentities
        contact: [
            ['JUSTIN BROWN', 'justin@jweb.dev'],
            ['J. BROWN', '(630) 880-7886'],
            ['JWEB.DEV', 'expired business card'],
        ],
    },

    props: {
        // relative spawn weight per alley cell — higher = more common.
        // "none" kept low on purpose: dense, high-frequency clutter.
        weights: {
            trashCan: 4,
            trafficCone: 3,
            trafficSign: 2,
            trafficSignal: 0.8, // rarer -- a real per-frame update, not free like a static sign
            mileMarker: 2,
            wantedPoster: 5, // bumped -- 1 in 5 of these now carries a real personal fact, not just a wiki rabbit hole
            crate: 4,
            lantern: 4,
            vendingMachine: 2.5,
            fenceSegment: 1.5,
            museumPlacard: 2.5,
            stickerTag: 3.5,
            businessCardLitter: 2,
            manhole: 2,
            pigeon: 2.5,
            fissureCrack: 1.5,
            tree: 1.5,
            pottedPlant: 3,
            weeds: 3.5,
            none: 0.03, // turned down further -- almost nothing gets to be empty
        },
        // 17x17 pass: interpolated the same 60%-toward-the-old-21x21-
        // numbers way as CONFIG.quality's skyJunkCount/floatingPlatform-
        // Clusters (see there) -- there's a genuinely bigger plazaCells
        // pool to draw from now, but "special encounter" counts are
        // exactly the category that should scale slower than raw area
        // (more of these than 11x11 had, nowhere near proportional to the
        // ~2.4x area gain). These still draw from the same plazaCells pool
        // in this fixed order, so an early category (statues,
        // constructionZones...) can still starve a later one out of a
        // plaza if the pool runs dry -- just less likely now that there's
        // more pool to begin with.
        maxSpecialFeatures: {
            statues: 4,
            constructionZones: 4,
            crimeScenes: 2,
            newsstands: 3,
            phoneBooths: 3,
            atmKiosks: 3,
            parks: 4,
            megaBillboards: 3,
        },
    },

    // ---------------- airborne junk: fills the sky, ignores gravity ----------------
    // the ground-level junk system above is deliberately grounded and
    // situational (tagged to a real feature, placed with a collider).
    // This is the same "poorly made, spawned by the hundreds" idea with
    // every rule dropped except "you can still walk": no footprint check,
    // no collision, no precomputed shapes -- it's the maze's own
    // information-glut premise made physical, drifting through and
    // between the towers instead of sitting on a shelf. Pure extra draw
    // calls, so counts (CONFIG.quality.*.skyJunkCount) scale hard per tier.
    skyJunk: {
        heightMin: 2.2,       // never at your literal feet
        heightMax: 260,       // past even hero-tower rooflines
        heightBias: 1.7,      // >1 skews the range toward the low/mid band -- reads as "thick between the buildings," not a thin haze way up top
        streetClearance: 3.0, // courtesy headroom over open/walkable cells so it isn't spawning directly in your face mid-step -- none of this collides regardless of where it lands
        stretchMin: 0.35,
        stretchMax: 2.4,      // each axis scaled independently and separately from the others -- nothing here should read as a "real object" with a normal silhouette
        sizeMin: 0.2,
        sizeMax: 2.2,
    },

    // every 4th row/col that's actually open becomes a through-street
    // instead of a back alley -- wider-feeling, cleaner, real sidewalks
    // along the building faces. Everything else stays alley: grimier,
    // denser, no sidewalk distinction. Real cities have both; this
    // shouldn't be maze-wide uniform pavement.
    streets: {
        gridSpacing: 4,
        propDensityMul: 0.5, // streets are thoroughfares, not clutter bins
    },

    movement: {
        speed: 4.5, // slower than before — cramped alleys, not a sprint
        sprintMultiplier: 1.7, // hold Shift -- covers real ground, matters for clearing a gap jump
        maxDeltaSeconds: 0.1,
        collisionIterations: 4, // was 2 -- too few passes to settle cleanly now that alley clutter is this dense; this is what "trash cans feel impossible to walk past" actually was
    },

    desktopControls: {
        pointerSpeed: 3.2, // notably faster look — this was the #1 complaint
    },

    touchControls: {
        joystickRadius: 50,
        lookSensitivity: 0.0035,
        pitchLimit: Math.PI / 2 - 0.05,
    },
};

// ---------- seeded RNG ----------
// every bit of generation (maze, buildings, signs, props, spawn point)
// runs through this one seeded generator instead of raw Math.random().
// Default: a fresh random seed every load — the city is different each
// time you visit, same as before. Pin ?seed=12345 in the URL to freeze
// a specific layout for bug reports/comparisons — paste the console-
// logged seed back and that exact city (bugs included) comes back.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const urlSeed = new URLSearchParams(location.search).get('seed');
const SEED = urlSeed !== null ? Number(urlSeed) : Math.floor(Math.random() * 2 ** 31);
const rng = mulberry32(SEED);
console.log(`[testing] maze seed = ${SEED}  (reload with ?seed=${SEED} to get this exact layout)`);

// ---------- massive information-noise corpus ----------
// this never touches CONFIG.siteContent / PERSONAL_WANTED_FACTS / real
// contact cards / photo-backed content -- that's the scarce signal this
// whole maze is about. Everything below is the noise it's buried in.
console.log(`[noise] local corpus: ${MASSIVE_NOISE_META.concreteRows.toLocaleString()} concrete rows, ${Number(MASSIVE_NOISE_META.virtualRows).toLocaleString()} virtual combinations`);
console.log(`[noise] remote corpus: ${REMOTE_NOISE_META.rows.toLocaleString()} rows fetched ${REMOTE_NOISE_META.generatedUtc}`);
for (const [key, m] of Object.entries(REMOTE_NOISE_META.sources)) {
    console.log(m.error ? `[noise]   ${key}: ERROR -- ${m.error}` : `[noise]   ${key}: ${m.rows.toLocaleString()} rows -- ${m.attribution}`);
}
console.log(`[noise] verbal corpus: ${POETRY_NOISE_META.totalLines.toLocaleString()} deduplicated lines, ${POETRY_NOISE_META.pairs.toLocaleString()} collage pairs -- ${POETRY_NOISE_META.source}`);

// query-result "families" -- the whole point is that the player can
// vaguely tell "this block is vomiting aviation records" without ever
// running out of records. Grouped by real-world semantics, not by which
// file they happened to be generated into.
const NOISE_DISTRICTS = {
    network: [MIME_NOISE, SERVICE_NOISE, PROTOCOL_NOISE, INDEX_STATUS_NOISE, IANA_PORTS_NOISE, IANA_TLDS_NOISE, RFC_INDEX_NOISE],
    transport: [OURAIRPORTS_AIRPORTS_NOISE, OURAIRPORTS_FREQUENCIES_NOISE, OURAIRPORTS_RUNWAYS_NOISE, OURAIRPORTS_NAVAIDS_NOISE],
    geographic: [GEONAMES_CITIES500_NOISE, TIMEZONE_NOISE],
    scientific: [NOAA_GHCND_STATIONS_NOISE, USGS_EARTHQUAKES_MONTH_NOISE],
    encoding: [UNICODE_NOISE],
    // the one district that isn't registry/standards data -- found-poetry
    // lines collaged into title/subtitle pairs (see noise-data-poetry.js).
    // A human voice mixed in with the machinery, same non-hard-border
    // crossfade as every other district.
    verbal: [POETRY_PAIRS_NOISE],
};
const DISTRICT_KEYS = Object.keys(NOISE_DISTRICTS);
function pickFromPools(rng, pools) {
    const pool = pools[Math.floor(rng() * pools.length)];
    return pool[Math.floor(rng() * pool.length)];
}

// deterministic per-block thematic affinity, derived from the maze seed
// plus cell coords (never Math.random) so ?seed= still reproduces which
// block leans toward which district. No hard borders -- pickCityNoisePair
// below lets picks "escape" their block's theme at random instead of
// hard-cutting at a cell boundary.
function districtHash(col, row) {
    let h = Math.imul(SEED ^ 0x9e3779b9, 0x2545f491);
    h = Math.imul(h ^ col, 0x85ebca6b);
    h = Math.imul(h ^ row, 0xc2b2ae35);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
function districtForCell(col, row) {
    return DISTRICT_KEYS[Math.floor(districtHash(col, row) * DISTRICT_KEYS.length)];
}

// deterministic presentational transforms of the same source rows, so the
// corpus reads as "indexed," not just randomly picked -- a search-result
// counter, a database row/shard/offset, a cache record, a crawler verb
// prefix. Most picks stay raw; this is a garnish, not the whole dish.
function stylizeNoisePair(rng, pair) {
    if (rng() > 0.35) return pair;
    const [title, subtitle] = pair;
    switch (Math.floor(rng() * 4)) {
        case 0: {
            const n = 1 + Math.floor(rng() * 999999);
            const total = n + Math.floor(rng() * 9000000);
            return [title, `RESULT ${String(n).padStart(6, '0')} / ${total.toLocaleString()}`];
        }
        case 1: {
            const offset = Math.floor(rng() * 0xffffff);
            return [title, `ROW 0x${offset.toString(16).toUpperCase().padStart(6, '0')} · SHARD ${Math.floor(rng() * 64)}`];
        }
        case 2: return [`${pick(NOISE_ACTIONS)} ${title}`, subtitle];
        default: {
            const etag = Math.floor(rng() * 0xffffff).toString(16).toUpperCase();
            return [title, `ETAG ${etag} · AGE ${Math.floor(rng() * 9999)}S`];
        }
    }
}

// the huge undifferentiated pool -- local virtual/concrete corpus plus an
// even mix across every remote district family. Used when a pick has no
// location (e.g. a cached texture) or rolls past its block's own theme.
function pickAnyNoisePair(rng) {
    if (rng() < 0.65) return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS[DISTRICT_KEYS[Math.floor(rng() * DISTRICT_KEYS.length)]]));
    return pickMassiveNoisePair(rng, 0.7);
}

// main game-facing picker: biases toward whichever district family the
// given world position falls in, with a real escape chance so districts
// crossfade at their edges instead of hard-bordering.
function pickCityNoisePair(rng, worldX, worldZ) {
    if (worldX === undefined) return pickAnyNoisePair(rng);
    const { col, row } = worldToCell(worldX, worldZ);
    if (rng() < 0.72) return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS[districtForCell(col, row)]));
    return pickAnyNoisePair(rng);
}

// network-flavored surfaces (ATMs, etc.) stay in their own semantic lane
// rather than falling into the generic mix -- a "packet view" reads right
// on a cash machine in a way a GeoNames city row wouldn't.
function pickNetworkNoise(rng) {
    return stylizeNoisePair(rng, pickFromPools(rng, NOISE_DISTRICTS.network));
}

// ---------- config randomization ----------
// the seed above only ever touched geometry (maze layout, spawn point).
// Everything tunable in CONFIG -- colors, fog, intensities, chances,
// densities, movement feel -- now rides the same seeded RNG, so a plain
// reload gives you a different mood, not just a different floor plan.
// ?seed=X freezes the exact layout AND the exact tuning that came with
// it, same guarantee as before. Content (word lists, real sourced data,
// nav copy) and stability-critical numbers (collision radii, clip
// planes, the potato-tier perf floor) are deliberately left alone --
// this only touches the knobs that are purely look-and-feel.
function jitter(base, pct) {
    return base * (1 + (rng() * 2 - 1) * pct);
}
function jitterClamped(base, pct, lo, hi) {
    return Math.min(hi, Math.max(lo, jitter(base, pct)));
}
function jitterInt(base, pct, lo, hi) {
    return Math.round(jitterClamped(base, pct, lo, hi));
}
const _hsl = { h: 0, s: 0, l: 0 };
function shiftHue(hex, degRange, satPct = 0.15, lightPct = 0.12) {
    const c = new THREE.Color(hex);
    c.getHSL(_hsl);
    let h = _hsl.h + (rng() * 2 - 1) * (degRange / 360);
    h = ((h % 1) + 1) % 1;
    const s = Math.min(1, Math.max(0, jitter(_hsl.s, satPct)));
    const l = Math.min(1, Math.max(0, jitter(_hsl.l, lightPct)));
    c.setHSL(h, s, l);
    return c.getHex();
}
function randomizeConfig() {
    const c = CONFIG;

    // scene mood
    c.scene.backgroundColor = shiftHue(c.scene.backgroundColor, 30);
    c.scene.fogColor = shiftHue(c.scene.fogColor, 30);
    c.scene.fogDensity = jitterClamped(c.scene.fogDensity, 0.4, 0.008, 0.035);

    // light-web / dark-web poles
    for (const pole of [c.narrative.lightWeb, c.narrative.darkWeb]) {
        pole.fogColor = shiftHue(pole.fogColor, 25);
        pole.ambientColor = shiftHue(pole.ambientColor, 25);
        pole.fogDensity = jitterClamped(pole.fogDensity, 0.35, 0.01, 0.04);
        pole.ambientIntensity = jitterClamped(pole.ambientIntensity, 0.3, 0.6, 3.2);
        pole.hemiIntensity = jitterClamped(pole.hemiIntensity, 0.3, 0.3, 1.6);
        pole.signChance = jitterClamped(pole.signChance, 0.15, 0.55, 1);
        pole.propDensityMul = jitterClamped(pole.propDensityMul, 0.3, 0.5, 1.8);
    }

    // camera feel (near/far/eyeHeight/playerRadius stay put -- collision code assumes them)
    c.camera.fov = jitterInt(c.camera.fov, 0.12, 62, 92);

    // lighting
    c.lighting.ambientColor = shiftHue(c.lighting.ambientColor, 20);
    c.lighting.ambientIntensity = jitterClamped(c.lighting.ambientIntensity, 0.3, 0.9, 3);
    c.lighting.moonColor = shiftHue(c.lighting.moonColor, 20);
    c.lighting.moonIntensity = jitterClamped(c.lighting.moonIntensity, 0.3, 0.6, 2);
    c.lighting.fillColor = shiftHue(c.lighting.fillColor, 20);
    c.lighting.fillIntensity = jitterClamped(c.lighting.fillIntensity, 0.35, 0.2, 1.2);
    c.lighting.moonPosition.x = jitter(c.lighting.moonPosition.x, 0.6);
    c.lighting.moonPosition.y = jitterClamped(c.lighting.moonPosition.y, 0.3, 40, 110);
    c.lighting.moonPosition.z = jitter(c.lighting.moonPosition.z, 0.6);
    c.lighting.signLight.intensity = jitterClamped(c.lighting.signLight.intensity, 0.3, 2.5, 9);
    c.lighting.signLight.distance = jitterClamped(c.lighting.signLight.distance, 0.3, 5, 14);

    // quality knobs -- mild jitter only, and never the structural bits
    // (antialias on/off, bloom present/null, pixel ratio, draw distance,
    // light count, enterable-floor count) that the perf tiers exist to
    // guarantee.
    for (const tier of [c.quality.desktop, c.quality.mobile, c.quality.potato]) {
        if (tier.bloom) {
            tier.bloom.strength = jitterClamped(tier.bloom.strength, 0.25, 0.2, 1.1);
            tier.bloom.radius = jitterClamped(tier.bloom.radius, 0.25, 0.2, 0.7);
            tier.bloom.threshold = jitterClamped(tier.bloom.threshold, 0.08, 0.75, 0.97);
        }
        tier.propDensity = jitterClamped(tier.propDensity, 0.25, tier.propDensity * 0.5, tier.propDensity * 1.6);
        tier.skyJunkCount = jitterInt(tier.skyJunkCount, 0.3, Math.round(tier.skyJunkCount * 0.5), Math.round(tier.skyJunkCount * 1.6));
        tier.floatingPlatformClusters = jitterInt(tier.floatingPlatformClusters, 0.3, Math.round(tier.floatingPlatformClusters * 0.5), Math.round(tier.floatingPlatformClusters * 1.6));
    }

    // maze shape (cols/rows/cellSize left alone -- they size the whole grid, incl. the perimeter wall math)
    c.maze.loopChance = jitterClamped(c.maze.loopChance, 0.4, 0.05, 0.28);
    c.maze.buildingMarginMin = jitterClamped(c.maze.buildingMarginMin, 0.3, 0.3, 0.9);
    c.maze.buildingMarginMax = jitterClamped(c.maze.buildingMarginMax, 0.3, 1.3, 2.4);

    // buildings -- floorCountWeights/heroFloorCountWeights are left as
    // fixed distributions (jittering individual bucket weights isn't
    // worth the complexity; per-building variety already comes from
    // weightedPick + rng against them every reload).
    c.buildings.heroTowerChance = jitterClamped(c.buildings.heroTowerChance, 0.4, 0.03, 0.16);
    c.buildings.roughness = jitterClamped(c.buildings.roughness, 0.1, 0.75, 1);
    c.buildings.palette = c.buildings.palette.map(hex => shiftHue(hex, 15, 0.1, 0.08));
    c.buildings.curb.height = jitterClamped(c.buildings.curb.height, 0.3, 0.06, 0.2);
    c.buildings.curb.overhang = jitterClamped(c.buildings.curb.overhang, 0.3, 0.2, 0.55);
    c.buildings.curb.color = shiftHue(c.buildings.curb.color, 15);

    // signage palettes (neonPalette/neonWarm/neonCool) are left untouched --
    // every use is a random pick() already, and hue-shifting curated,
    // named colors ("white", "gold", "maroon"...) would just drift them
    // off their own labels for no visible gain.

    // billboards -- visual tuning, not the copy itself (border width etc.
    // is rolled per-sign now, see SIGN_SHAPES/SIGN_FONTS near addSign)
    for (const k of Object.keys(c.billboards.contentWeights)) {
        c.billboards.contentWeights[k] = jitterClamped(c.billboards.contentWeights[k], 0.35, 1, 10);
    }

    // prop spawn weights & feature caps
    for (const k of Object.keys(c.props.weights)) {
        c.props.weights[k] = jitterClamped(c.props.weights[k], 0.4, 0.01, c.props.weights[k] * 2 + 1);
    }
    for (const k of Object.keys(c.props.maxSpecialFeatures)) {
        c.props.maxSpecialFeatures[k] = jitterInt(c.props.maxSpecialFeatures[k], 0.3, 1, c.props.maxSpecialFeatures[k] * 2);
    }

    // airborne junk
    c.skyJunk.heightMin = jitterClamped(c.skyJunk.heightMin, 0.3, 1, 4);
    c.skyJunk.heightMax = jitterClamped(c.skyJunk.heightMax, 0.2, 200, 320);
    c.skyJunk.heightBias = jitterClamped(c.skyJunk.heightBias, 0.3, 1.1, 2.4);
    c.skyJunk.streetClearance = jitterClamped(c.skyJunk.streetClearance, 0.3, 2, 4.5);
    c.skyJunk.stretchMin = jitterClamped(c.skyJunk.stretchMin, 0.3, 0.15, 0.6);
    c.skyJunk.stretchMax = jitterClamped(c.skyJunk.stretchMax, 0.3, 1.6, 3.2);
    c.skyJunk.sizeMin = jitterClamped(c.skyJunk.sizeMin, 0.3, 0.1, 0.4);
    c.skyJunk.sizeMax = jitterClamped(c.skyJunk.sizeMax, 0.3, 1.4, 3);

    // streets
    c.streets.propDensityMul = jitterClamped(c.streets.propDensityMul, 0.35, 0.25, 0.85);

    // movement feel (maxDeltaSeconds/collisionIterations left alone -- correctness knobs, not feel)
    c.movement.speed = jitterClamped(c.movement.speed, 0.2, 3.4, 5.8);
    c.movement.sprintMultiplier = jitterClamped(c.movement.sprintMultiplier, 0.2, 1.3, 2.2);

    // controls
    c.desktopControls.pointerSpeed = jitterClamped(c.desktopControls.pointerSpeed, 0.25, 2.2, 4.4);
    c.touchControls.lookSensitivity = jitterClamped(c.touchControls.lookSensitivity, 0.25, 0.0022, 0.0055);
}
randomizeConfig();
console.log('[testing] config randomized from seed -- reload for a new mood, or pin ?seed= to freeze it too.');
// full randomized knob dump -- if a particular reload's mood/density/feel
// is a keeper, this (plus the ?seed= in the very first log line) is
// everything needed to narrow the jitter ranges toward it. Logged as a
// real object (not just a JSON string) so devtools can expand it.
console.log('[config] full randomized CONFIG:', CONFIG);
console.log('[config] key tunables -- propDensity(desktop/mobile/potato):', CONFIG.quality.desktop.propDensity.toFixed(2), CONFIG.quality.mobile.propDensity.toFixed(2), CONFIG.quality.potato.propDensity.toFixed(2),
    '| skyJunkCount:', CONFIG.quality.desktop.skyJunkCount, CONFIG.quality.mobile.skyJunkCount, CONFIG.quality.potato.skyJunkCount,
    '| buildingMargin:', CONFIG.maze.buildingMarginMin.toFixed(2), '-', CONFIG.maze.buildingMarginMax.toFixed(2),
    '| loopChance:', CONFIG.maze.loopChance.toFixed(2),
    '| moveSpeed/sprint:', CONFIG.movement.speed.toFixed(2), CONFIG.movement.sprintMultiplier.toFixed(2));

// ---------- device detection & active quality profile ----------

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// auto-detect weak hardware and drop to the potato tier. This USED to be
// gated on IS_TOUCH ("the profile most likely to actually be shitty
// hardware") which was wrong -- a low-core/low-RAM laptop with a mouse is
// exactly as weak as a low-core/low-RAM phone, and was silently getting
// full desktop settings it can't run. Two independent signals now, either
// one is enough: reported cores/memory (works whenever the browser
// exposes it), and the actual GL renderer string (catches integrated/
// software rasterizers regardless of what navigator.hardwareConcurrency
// claims -- a laptop can report 8 cores and still have a GPU that can't
// hold 60fps). ?quality=low|high overrides the auto-detect either
// direction for testing.
const forcedQuality = new URLSearchParams(location.search).get('quality');
// ?debugFootprints=1 -- draws a top-down wireframe overlay per building:
// the full parcel envelope (dim), the actual generated core+wings union
// (bright), and a marker on any real courtyard void -- flown over with
// freecam (F), this is the literal "gray box overhead" test: if the
// bright outline is a plain centered square on most buildings, the
// footprint generator has failed. Purely additive lines, zero effect on
// collision/gameplay when off (the default).
const DEBUG_FOOTPRINTS = new URLSearchParams(location.search).get('debugFootprints') === '1';
// ?debugFacades=1 -- every real FacadeSurface as a colored rectangle
// (green = a normal street facade, cyan = an exposed-setback facade
// created by a same-site neighbor stopping short -- the height-mismatch
// bug's own regression signal made visible), a magenta arrow for its
// outward normal (walk all 4 cardinal sides -- an arrow pointing through
// the building means the rotation math is wrong), a smaller colored
// rectangle per occupied region (door=blue, sign/poster=orange,
// fireEscape=red, hardware=purple, overlay=green), and a purple
// wireframe box per registered world-space projection volume. See
// addFacadeDebugOverlay, called once generation finishes.
const DEBUG_FACADES = new URLSearchParams(location.search).get('debugFacades') === '1';
// ?debugSignatures=1 -- every reserved signature site (see
// reserveSignatureSites) as a colored cell outline + a marker at its
// main/secondary entrance. See addSignatureDebugOverlay.
const DEBUG_SIGNATURES = new URLSearchParams(location.search).get('debugSignatures') === '1';
// ?landmark=artGallery|as400Archive|justinIndex|systemsWorkshop|loreShrine
// -- spawn just outside that signature's main entrance instead of a
// random maze cell. Applied once generation finishes (see camera.position
// near the render-loop setup) -- a no-op with a loud console warning if
// that signature didn't get reserved this seed (spacing/entrance
// constraints can disable one; see reserveSignatureSites).
const urlLandmark = new URLSearchParams(location.search).get('landmark');
const cores = navigator.hardwareConcurrency || 4;
const mem = navigator.deviceMemory || 4; // not supported in all browsers; defaults optimistic

function detectWeakGPU() {
    try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
        if (!gl) return true; // no WebGL at all is as weak as it gets
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererStr = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
        // integrated/software rasterizers -- common on "shitty laptop",
        // rare on anything with a real discrete GPU (gaming desktop/laptop)
        return /intel|swiftshader|llvmpipe|software|basic render|mali-4|adreno [23]0/.test(rendererStr);
    } catch {
        return false; // detection failing shouldn't itself downgrade a fine machine
    }
}
const looksLikePotato = cores <= 4 || mem <= 2 || detectWeakGPU();

const QUALITY = forcedQuality === 'high' ? CONFIG.quality.desktop
    : forcedQuality === 'low' ? CONFIG.quality.potato
    : looksLikePotato ? CONFIG.quality.potato
    : IS_TOUCH ? CONFIG.quality.mobile
    : CONFIG.quality.desktop;

// ---------- basic setup ----------

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.scene.backgroundColor);
scene.fog = new THREE.FogExp2(CONFIG.scene.fogColor, CONFIG.scene.fogDensity);

const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    QUALITY.drawDistance
);
camera.rotation.order = 'YXZ';

// powerPreference nudges laptops with switchable graphics (integrated +
// discrete) toward the discrete GPU instead of whatever the browser
// defaults to -- free to ask for, no downside on single-GPU machines.
const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// potato tier skips bloom entirely -- the blur passes cost real GPU time
// even at low strength, not just a visual reduction.
let bloomPass = null;
if (QUALITY.bloom) {
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        QUALITY.bloom.strength,
        QUALITY.bloom.radius,
        QUALITY.bloom.threshold
    );
    composer.addPass(bloomPass);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- lighting ----------

const ambientLight = new THREE.AmbientLight(CONFIG.lighting.ambientColor, CONFIG.lighting.ambientIntensity);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(CONFIG.lighting.fillColor, 0x9a8a68, CONFIG.lighting.fillIntensity);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(CONFIG.lighting.moonColor, CONFIG.lighting.moonIntensity);
sun.position.set(CONFIG.lighting.moonPosition.x, CONFIG.lighting.moonPosition.y, CONFIG.lighting.moonPosition.z);
scene.add(sun);

let dynamicLightsRemaining = QUALITY.maxDynamicLights;

// ---------- light-web / dark-web gradient ----------
// there's no teleport between the two poles — the player walks the
// gradient continuously, driven entirely by world Z (north/south).
// 0 = dark web (north), 1 = light web (south).


function webAlignment(worldZ) {
    return THREE.MathUtils.clamp((worldZ / (GRID_H / 2) + 1) / 2, 0, 1);
}

// ---------- vertical layer gradient: caves -> heaven ----------
// orthogonal to the light-web/dark-web gradient above, which rides
// world Z (horizontal, north/south). This one rides world Y (vertical,
// up), and it's what actually owns fog/ambient COLOR now: the bottom
// two floors of the city -- everything at or near ground level, i.e.
// nearly the entire existing maze -- are "the caves," and the purple/
// black nighttime palette that got cut everywhere else lives here and
// only here. Climb a real, working stair high enough and it burns
// through a genuinely strobing rainbow band (this is what the epilepsy
// warning up top is actually for) into a blinding white "heaven" -- see
// buildFireEscapeStair and the layer-deck builders below for how you
// actually get up there.
const CAVE_FOG = new THREE.Color(0x140a20);
const CAVE_AMBIENT = new THREE.Color(0x2a1040);
const HEAVEN_FOG = new THREE.Color(0xfaf8ec);
const HEAVEN_AMBIENT = new THREE.Color(0xfffaf0);
const _vertColor = new THREE.Color();
const _vertAmbient = new THREE.Color();
const LAYER_Y = { caveTop: 5, heavenBase: 20 };

function verticalBandT(y) {
    return THREE.MathUtils.clamp((y - LAYER_Y.caveTop) / (LAYER_Y.heavenBase - LAYER_Y.caveTop), 0, 1);
}

function updateVerticalGradient(y, elapsed) {
    const vt = verticalBandT(y);
    if (vt <= 0.02) {
        _vertColor.copy(CAVE_FOG);
        _vertAmbient.copy(CAVE_AMBIENT);
    } else if (vt >= 0.98) {
        _vertColor.copy(HEAVEN_FOG);
        _vertAmbient.copy(HEAVEN_AMBIENT);
    } else {
        // the strobing middle band: hue cycles with height AND time, so
        // standing still on a landing doesn't settle into a color either
        // -- "all kinds of colors in between," genuinely, not a fixed tint
        const hue = (vt * 1.4 + elapsed * 0.12) % 1;
        _vertColor.setHSL(hue, 0.9, 0.55);
        _vertAmbient.setHSL((hue + 0.5) % 1, 0.8, 0.6);
    }
    scene.fog.color.copy(_vertColor);
    scene.background.copy(_vertColor);
    ambientLight.color.copy(_vertAmbient);
    return vt;
}

function updateWebGradient(worldZ, worldY, elapsed) {
    const t = webAlignment(worldZ);
    const dark = CONFIG.narrative.darkWeb;
    const light = CONFIG.narrative.lightWeb;

    // vertical gradient owns color; horizontal keeps owning brightness/
    // density/audio/weather -- two orthogonal reads, not one fighting
    // over the same channel as the other.
    const vt = updateVerticalGradient(worldY, elapsed);

    const baseDensity = THREE.MathUtils.lerp(dark.fogDensity, light.fogDensity, t);
    // "fog of war": thick and close-in down in the caves -- both the
    // disorientation and a real performance win, since the tightened
    // camera.far below means nothing past it costs a single triangle --
    // opening up into the long clear sightlines heaven's vistas need.
    scene.fog.density = baseDensity * THREE.MathUtils.lerp(2.2, 0.35, vt);
    camera.far = THREE.MathUtils.lerp(Math.min(70, QUALITY.drawDistance), QUALITY.drawDistance, vt);
    camera.updateProjectionMatrix();

    ambientLight.intensity = THREE.MathUtils.lerp(dark.ambientIntensity, light.ambientIntensity, t);
    hemiLight.intensity = THREE.MathUtils.lerp(dark.hemiIntensity, light.hemiIntensity, t);
    // weather rides the horizontal gradient like before, and now fades
    // out entirely near heaven -- storms don't reach the vista deck.
    rainMat.opacity = (1 - t) * 0.5 * (1 - vt * 0.7);
    updateAudioGradient(t, vt);
}

// ---------- ambient audio ----------
// a procedural city-hum drone, synthesized rather than sourced from
// audio files -- costs nothing to ship, and rides the same light-web/
// dark-web gradient as everything else: busier/louder toward light-web,
// quieter/emptier toward dark-web. Starts on first user gesture (the
// same click/touch that locks the pointer or reveals touch controls --
// browsers require a real gesture before any audio plays, so this
// piggybacks on gestures that already exist rather than adding a new one).
let audioCtx = null;
let droneGain = null;
let hissGain = null;
let droneFilter = null;
let shimmerGain = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // two barely-detuned low oscillators through a lowpass filter -- a
    // distant city hum, not a musical note. Filter cutoff itself now
    // rides the vertical gradient (see updateAudioGradient) -- muddy and
    // closed-in down in the caves, opening up brighter as you climb.
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sawtooth'; osc1.frequency.value = 55;
    osc2.type = 'sawtooth'; osc2.frequency.value = 55 * 1.006;
    droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 90;
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.03;
    osc1.connect(droneFilter); osc2.connect(droneFilter);
    droneFilter.connect(droneGain).connect(audioCtx.destination);
    osc1.start(); osc2.start();

    // filtered noise loop -- distant traffic/crowd hiss
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const hissFilter = audioCtx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 800;
    hissFilter.Q.value = 0.5;
    hissGain = audioCtx.createGain();
    hissGain.gain.value = 0.005;
    noise.connect(hissFilter).connect(hissGain).connect(audioCtx.destination);
    noise.start();

    // a high, pure sine that only ever fades in near the top -- the
    // "heaven" layer's one audio element that doesn't exist anywhere
    // else in the maze, so reaching it actually sounds like arriving
    // somewhere rather than just more of the same hum getting brighter.
    const shimmerOsc = audioCtx.createOscillator();
    shimmerOsc.type = 'sine'; shimmerOsc.frequency.value = 880;
    shimmerGain = audioCtx.createGain();
    shimmerGain.gain.value = 0;
    shimmerOsc.connect(shimmerGain).connect(audioCtx.destination);
    shimmerOsc.start();
}

function updateAudioGradient(t, vt = 0) {
    if (!audioCtx) return;
    // t: 0 = dark web (quiet, empty), 1 = light web (busy, loud) -- the
    // existing horizontal read. vt: 0 = caves, 1 = heaven -- the new
    // vertical one. Both blend into the same handful of nodes rather
    // than fighting over separate ones.
    droneGain.gain.setTargetAtTime(0.02 + t * 0.05, audioCtx.currentTime, 0.6);
    hissGain.gain.setTargetAtTime(0.003 + t * 0.03 + Math.sin(vt * Math.PI) * 0.018, audioCtx.currentTime, 0.6);
    droneFilter.frequency.setTargetAtTime(90 + vt * 700, audioCtx.currentTime, 1.2);
    shimmerGain.gain.setTargetAtTime(vt * 0.035, audioCtx.currentTime, 1.0);
}

// short filtered noise burst -- a footstep, triggered while moving
function playFootstep() {
    if (!audioCtx) return;
    const dur = 0.08;
    const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + Math.random() * 200;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.15;
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start();
}

// ---------- weather (gradient-driven, not a toggle) ----------

const RAIN_COUNT = IS_TOUCH ? 220 : 500;
const RAIN_SPAN = 46, RAIN_HEIGHT = 26;
const rainPositions = new Float32Array(RAIN_COUNT * 3);
const rainSpeeds = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++) {
    rainPositions[i * 3] = randRange(-RAIN_SPAN / 2, RAIN_SPAN / 2);
    rainPositions[i * 3 + 1] = randRange(0, RAIN_HEIGHT);
    rainPositions[i * 3 + 2] = randRange(-RAIN_SPAN / 2, RAIN_SPAN / 2);
    rainSpeeds[i] = randRange(13, 21);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainMat = new THREE.PointsMaterial({
    color: 0xd8e8e8, size: 0.05, transparent: true, opacity: 0, depthWrite: false,
});
const rain = new THREE.Points(rainGeo, rainMat);
scene.add(rain);

function updateRain(delta) {
    const pos = rainGeo.attributes.position;
    for (let i = 0; i < RAIN_COUNT; i++) {
        let y = pos.array[i * 3 + 1] - rainSpeeds[i] * delta;
        if (y < 0) y = RAIN_HEIGHT;
        pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
    rain.position.set(camera.position.x, 0, camera.position.z);
}

// ---------- real scanned/modeled props (Poly Haven, CC0) ----------
// A handful of actual CC0 models (Poly Haven's "Hidden Alley" collection
// — literally built for this), vendored as geometry-only glTF (the PBR
// texture sets are tens of MB each and would both blow the load-time
// budget and clash with the low-fi look everywhere else here; simple
// flat-color materials were substituted when the files were prepared).
// Loading is async, so placement is decoupled via a request queue:
// code elsewhere calls placeRealModel() with a position any time during
// the (synchronous) layout pass, and instances get dropped in whenever
// each model finishes loading, in whatever order that happens.
const gltfLoader = new GLTFLoader();
gltfLoader.setPath('./vendor/models/');
// a SEPARATE loader for the city-pack catalog (see placeCityAsset below)
// -- three.js's FileLoader unconditionally prepends `this.path` to every
// url passed to .load() (`if (this.path !== undefined) url = this.path +
// url`, and it defaults to '', not undefined, so setPath's effect is
// permanent for that instance). Sharing gltfLoader here silently turned
// './vendor/city-pack/' + def.file into './vendor/models/./vendor/
// city-pack/...' for EVERY city-pack load, always -- a real, systemic
// 404 that just happened to go unnoticed because placeCityAsset call
// sites were still sparse. A second instance with no path set (every
// city-pack call already passes a full relative path) fixes it for good.
const cityAssetLoader = new GLTFLoader();
const pendingRealModelPlacements = { tyre: [], trashbag: [], manhole: [], sprayCans: [], trashCanReal: [], streetLamp: [], barrelStove: [], ironGate: [], fireEscape: [] };

function placeRealModel(name, x, z, rotY) {
    pendingRealModelPlacements[name].push({ x, z, rotY });
}

function loadRealModel(name, file, scale) {
    gltfLoader.load(file, (gltf) => {
        const template = gltf.scene;
        template.scale.setScalar(scale);
        for (const req of pendingRealModelPlacements[name]) {
            const inst = template.clone();
            inst.position.set(req.x, 0, req.z);
            inst.rotation.y = req.rotY;
            scene.add(inst);
        }
    }, undefined, (err) => {
        // fails soft — a visitor on a flaky connection just doesn't get
        // this specific prop rather than the whole page breaking.
        console.warn(`[testing] real model "${name}" didn't load, skipping`, err);
    });
}
loadRealModel('tyre', 'old_tyre.gltf', 1);
loadRealModel('trashbag', 'trashbag.gltf', 1);
loadRealModel('manhole', 'water_manhole_cover.gltf', 1.4);
loadRealModel('sprayCans', 'spray_paint_bottles.gltf', 1);
loadRealModel('trashCanReal', 'metal_trash_can.gltf', 1);
loadRealModel('streetLamp', 'street_lamp_02.gltf', 1);
loadRealModel('barrelStove', 'barrel_stove.gltf', 1);
loadRealModel('ironGate', 'large_iron_gate.gltf', 1);
loadRealModel('fireEscape', 'modular_fire_escape.gltf', 1.3);

// ---------- generated city-pack model catalog (340 GLBs) ----------
// a real, ID-keyed vocabulary (vendor/city-pack/asset-catalog.js, see
// CLAUDE_INGEST.md alongside it) -- separate from the small hand-picked
// roster above. Lazy and cached: nothing here is fetched until something
// actually calls placeCityAsset for that id, and each id is only ever
// fetched once (cached template, cloned per placement) -- 340 eager
// loads at startup would be wasted work when a given seed only ever
// touches a fraction of the catalog. art_gallery/as400_archive/
// systems_workshop are reserved for those signature buildings and
// deliberately unused until those landmarks exist -- see README.md in
// the pack for why ("props and modules, not complete buildings").
const CITY_ASSET_BY_ID = new Map(CLAUDE_CITY_ASSETS.map(a => [a.id, a]));
const cityAssetTemplates = new Map(); // id -> loaded THREE.Object3D template
const cityAssetPending = new Map();   // id -> queued placement requests, while its GLB is still in flight

function instantiateCityAsset(template, req) {
    const inst = template.clone(true);
    inst.position.set(req.x, req.y, req.z);
    inst.rotation.y = req.rotY;
    if (req.scale !== undefined) {
        if (typeof req.scale === 'number') inst.scale.setScalar(req.scale);
        else inst.scale.set(req.scale.x ?? 1, req.scale.y ?? 1, req.scale.z ?? 1);
    }
    scene.add(inst);
    return inst;
}

// places catalog id `id` (e.g. 'street/bench_02') with its origin at
// (x,z). y defaults to 0 (every 'ground'-mount asset's real use case);
// pass opts.y for roof/wall/desk-mounted pieces, opts.scale for a
// uniform number or a per-axis {x,y,z} (used to fit a fixed-size asset
// to a caller-chosen target size, e.g. a corner-pile tier's height).
// Async-safe the same way placeRealModel/loadPhoto are: call any time
// during the synchronous layout pass, the mesh drops in whenever its
// GLB finishes loading, in whatever order that happens.
function placeCityAsset(id, x, z, rotY = 0, opts = {}) {
    const def = CITY_ASSET_BY_ID.get(id);
    if (!def) { console.warn(`[testing] unknown city-pack asset "${id}"`); return; }
    const req = { x, y: opts.y ?? 0, z, rotY, scale: opts.scale };
    if (cityAssetTemplates.has(id)) { instantiateCityAsset(cityAssetTemplates.get(id), req); return; }
    if (cityAssetPending.has(id)) { cityAssetPending.get(id).push(req); return; }
    cityAssetPending.set(id, [req]);
    cityAssetLoader.load('./vendor/city-pack/' + def.file, (gltf) => {
        cityAssetTemplates.set(id, gltf.scene);
        for (const r of cityAssetPending.get(id)) instantiateCityAsset(gltf.scene, r);
        cityAssetPending.delete(id);
    }, undefined, (err) => {
        console.warn(`[testing] city-pack asset "${id}" didn't load, skipping`, err);
        cityAssetPending.delete(id);
    });
}

// every asset in one category (e.g. 'street', 'trash_climbable',
// 'rooftop', 'vegetation') -- pick() over this instead of hand-typing an
// id when any variant of a kind will do.
const cityAssetCategoryCache = new Map();
function cityAssetsByCategory(category) {
    if (!cityAssetCategoryCache.has(category)) {
        cityAssetCategoryCache.set(category, CLAUDE_CITY_ASSETS.filter(a => a.category === category));
    }
    return cityAssetCategoryCache.get(category);
}

// ---------- real photos ----------
// his actual site images, resized/recompressed for a texture instead of
// print resolution (originals ran 20KB-3.5MB; these are 8-50KB) — the
// art gallery and project posters show the real pieces, and the one true
// signal at the farthest dead end carries his actual photo, not just text.
const photoImages = {};
const pendingPhotoPlacements = {};

function loadPhoto(key, file) {
    const img = new Image();
    img.onload = () => {
        photoImages[key] = img;
        for (const req of (pendingPhotoPlacements[key] || [])) buildPhotoPosterMesh(img, req);
        pendingPhotoPlacements[key] = [];
        // same pattern, for the Art Gallery's real-aspect panels (see
        // mountGalleryPiece) -- pendingGalleryPanels is declared later in
        // the file, but this callback only ever runs once the image
        // actually loads (well after the whole module has finished
        // executing top-to-bottom), so it's always defined by then.
        for (const req of (pendingGalleryPanels[key] || [])) buildGalleryArtPanel(img, req.x, req.y, req.z, req.rotY, req.widthUnits, req.title, req.subtitle);
        pendingGalleryPanels[key] = [];
    };
    img.onerror = () => console.warn(`[testing] photo "${key}" didn't load, skipping`);
    img.src = './vendor/photos/' + file;
}

function buildPhotoPosterMesh(img, req) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 168;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = req.paper || '#e8ddc2';
    ctx.fillRect(0, 0, 128, 168);
    const imgH = Math.min(112, (img.height / img.width) * 112);
    const imgY = 8 + (112 - imgH) / 2;
    ctx.drawImage(img, 8, imgY, 112, imgH);
    ctx.strokeStyle = req.frameColor || '#2a2420';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 112, 112);
    ctx.fillStyle = req.frameColor || '#2a2420';
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillText(req.title, 64, 136, 118);
    ctx.font = '9px "Courier New", monospace';
    ctx.fillText(req.subtitle, 64, 152, 118);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const width = req.width || randRange(1.4, 2.0);
    mountStandoffPanel(
        req.x, req.y, req.z, req.rotY, width, width * (168 / 128),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    );
}

// placement is decoupled the same way real models are (loading is async,
// scene layout is synchronous) -- call this any time, it either mounts
// immediately (photo already loaded) or queues until it is.
function placePhotoPoster(key, x, y, z, rotY, title, subtitle, opts = {}) {
    const req = { x, y, z, rotY, title, subtitle, ...opts };
    if (photoImages[key]) buildPhotoPosterMesh(photoImages[key], req);
    else (pendingPhotoPlacements[key] ??= []).push(req);
}

loadPhoto('portrait', 'me_smiling.jpg');
loadPhoto('teeth', 'teeth.jpg');
loadPhoto('selfPortrait', 'self_portrait.jpg');
loadPhoto('bike', 'bike.jpg');
loadPhoto('linoPrint', 'lino_print.jpg');
loadPhoto('puppet', 'puppet_image.jpg');
loadPhoto('vitalsage', 'vitalsage.jpg');
loadPhoto('brandyou', 'brandyou.jpg');
loadPhoto('bibitinator', 'bibitinator.jpg');
loadPhoto('slidingTiles', 'sliding_tiles.jpg');
// a fresh batch of real photos of him -- foundry/server-rack/hard-drive
// shots slot naturally into the "take it apart" bio material this site
// already leans on; the graduation and mirror shots are personal rather
// than project photos, so they ride along with CONFIG.siteContent.about
// instead of art/webProjects (see PHOTO_BY_TITLE + mountContentCards).
loadPhoto('graduation', 'graduation.jpg');
loadPhoto('foundry', 'foundry.jpg');
loadPhoto('serverRack', 'server_rack.jpg');
loadPhoto('hardDrives', 'hard_drives.jpg');
loadPhoto('mirrorPortrait', 'mirror_portrait.jpg');

// maps CONFIG.siteContent titles to the real photo that goes with them
const PHOTO_BY_TITLE = {
    "'TEETH'": 'teeth',
    'SELF PORTRAIT': 'selfPortrait',
    "'GARY FISCHER'": 'bike',
    "'THE FISH'": 'linoPrint',
    'PUPPET HEAD': 'puppet',
    'VITALSAGE': 'vitalsage',
    'BRANDYOUPROMO': 'brandyou',
    'BIBITINATOR': 'bibitinator',
    'SLIDING TILES': 'slidingTiles',
    'GRADUATION': 'graduation',
    'FOUNDRY DAY': 'foundry',
    'SERVER RACK': 'serverRack',
    'DISK ARRAY': 'hardDrives',
    'MIRROR, 2AM': 'mirrorPortrait',
};

// ---------- small helpers ----------

function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randRange(min, max) { return min + rng() * (max - min); }

// shared style axes for every *generic noise* text surface (wanted
// posters, wall posters, flyers, stickers, mega billboards, airborne text
// shards -- everything except real infrastructure signage like stop
// signs, and the CRT terminal-plaque identity used for real code-project
// content). Same idea as SIGN_FONTS/SIGN_BACKINGS below, just factored
// out early so surfaces defined before addSign (e.g. makeWantedTexture)
// can roll their own look too instead of sharing one fixed font/paper.
const TEXT_FONTS = [
    '"Courier New", monospace', 'Consolas, monospace', '"Lucida Console", monospace',
    'Verdana, sans-serif', '"Arial Black", sans-serif', 'Georgia, serif',
    'Tahoma, sans-serif', '"Trebuchet MS", sans-serif',
];
const PAPER_COLORS = ['#e8ddc2', '#d8d0e8', '#e8d8c8', '#c8e0d8', '#f0e8d0', '#e8dfc0', '#e0e0d8', '#ece2d0'];
const INK_COLORS = ['#2a2420', '#1a1a1a', '#241814', '#1c2420', '#221a2a'];
function pickTextFont() { return pick(TEXT_FONTS); }
function pickPaperColor() { return pick(PAPER_COLORS); }
function pickInkColor() { return pick(INK_COLORS); }

function weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [key, w] of entries) {
        r -= w;
        if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
}

// canvas texture, supersampled + linear-filtered so text actually reads
// -- used to be a literal tiny canvas at nearest-filter (chunky low-fi
// pixel signage on purpose), but that made every fillText illegible past
// a couple steps away. Draw callbacks are unchanged: they still draw in
// logical w x h coordinates and have no idea the backing store is bigger.
const TEXTURE_SUPERSAMPLE = 3;
function makePixelTexture(draw, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w * TEXTURE_SUPERSAMPLE; canvas.height = h * TEXTURE_SUPERSAMPLE;
    const ctx = canvas.getContext('2d');
    ctx.scale(TEXTURE_SUPERSAMPLE, TEXTURE_SUPERSAMPLE);
    ctx.imageSmoothingEnabled = true;
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function hexToCss(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

function toContent([title, subtitle]) { return { title, subtitle }; }

// picks sign copy for a given grid row — nav pages (real site links) are
// scarce on purpose, decoys and system noise dominate everywhere else.
let navPageIndex = 0;
function pickSignContent(x, z) {
    const weights = { ...CONFIG.billboards.contentWeights };
    if (navPageIndex >= CONFIG.billboards.navPages.length) delete weights.nav;
    const kind = weightedPick(weights);
    switch (kind) {
        case 'nav': return { ...CONFIG.billboards.navPages[navPageIndex++], flicker: false };
        case 'decoy': return { ...toContent(pick(CONFIG.billboards.decoyIdentities)), flicker: false };
        // system noise flickers — it's the machinery admitting the signal
        // is unreliable, so it should visibly read as unreliable.
        case 'noise': return { ...toContent(pick(CONFIG.billboards.systemNoise)), flicker: true };
        // the giant public-data corpus -- highest weight on purpose, see
        // NOISE_DISTRICTS above. Location-biased where a location exists.
        case 'data': return { ...toContent(pickCityNoisePair(rng, x, z)), flicker: rng() < 0.16 };
        default: return { ...toContent(pick(CONFIG.billboards.flavorWords)), flicker: false };
    }
}

// lights that pulse/blink over time instead of holding steady. Populated
// by addSign (noise signage) and security cameras; ticked in animate().
const flickerLights = [];

// neon color leans warm toward the light-web pole (south), cool toward
// the dark-web pole (north) — the palette itself carries the gradient.
function pickNeonForRow(row) {
    const t = webAlignment(cellToWorld(0, row).z);
    return rng() < t ? pick(CONFIG.neonWarm) : pick(CONFIG.neonCool);
}

// ---------- ground (whole maze footprint, one pixelated pavement plane) ----------

const GRID_COLS = CONFIG.maze.cols;
const GRID_ROWS = CONFIG.maze.rows;
const CELL = CONFIG.maze.cellSize;
const GRID_W = GRID_COLS * CELL;
const GRID_H = GRID_ROWS * CELL;

function cellToWorld(col, row) {
    return {
        x: (col - (GRID_COLS - 1) / 2) * CELL,
        z: (row - (GRID_ROWS - 1) / 2) * CELL,
    };
}

// a real 140-year DJIA jag, plotted year (x) against log(value) (y) —
// etched as a crack. The real 1930-1953 dead stretch and the 2007-2013
// crisis gap read as genuine flat stretches, not decoration.
function makeCrackTexture() {
    const data = CONFIG.realData.djiaMilestones;
    const years = data.map(([y]) => y);
    const logs = data.map(([, v]) => Math.log10(v));
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const lMin = Math.min(...logs), lMax = Math.max(...logs);
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#141414';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#050505';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach(([year, val], i) => {
            const px = ((year - yMin) / (yMax - yMin)) * w;
            const py = h - ((Math.log10(val) - lMin) / (lMax - lMin)) * h;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }, 160, 48);
}

// vertical band gradient built from real elevations, trench to summit.
// Illinois' real (nearly flat) range sits near the low-middle of the
// stack — the ordinary, actual center this whole thing is built around.
function makeTopologyStainTexture() {
    const points = CONFIG.realData.elevationsFt;
    const vals = points.map(([, ft]) => ft);
    const min = Math.min(...vals), max = Math.max(...vals);
    return makePixelTexture((ctx, w, h) => {
        points.forEach(([name, ft], i) => {
            const t0 = i / points.length, t1 = (i + 1) / points.length;
            const norm = (ft - min) / (max - min);
            const shade = Math.floor(18 + norm * 60);
            const tint = name.startsWith('Illinois') ? [shade, shade + 10, shade] : [shade, shade, shade + 4];
            ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
            ctx.fillRect(0, Math.floor(h * (1 - t1)), w, Math.ceil(h * (t1 - t0)) + 1);
        });
    }, 24, 128);
}

// per-building window-grid facade texture. buildOrganicTowerGeometry now
// maps u=0..1 across each of its 8 facets and v=0..1 across the full
// height, so this reads as a real floor-by-floor, facet-by-facet grid
// of panes instead of the flat single-color prisms every tower used to
// be. Painted fresh per building (never shared/cached) so no two towers
// show an identical grid -- lit/dark is independent per pane, with an
// occasional AC-unit blotch under the sill, both seeded off the same
// rng() everything else in the maze draws from.
function makeWindowGridTexture(height, baseColorHex, litRatio = 0.22) {
    const floorH = randRange(2.4, 3.2);
    const rows = Math.max(3, Math.min(48, Math.round(height / floorH)));
    const cols = 3 + Math.floor(rng() * 3); // 3-5 panes per facet
    const cellW = 14, cellH = 18;
    const base = hexToCss(baseColorHex);
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let r = 0; r < rows; r++) {
            const py = h - (r + 1) * cellH; // ground floor sits at v=0 (bottom)
            for (let c = 0; c < cols; c++) {
                const px = c * cellW;
                const lit = rng() < litRatio;
                ctx.fillStyle = lit ? '#ffdf8c' : (rng() < 0.5 ? '#232c38' : '#171d26');
                ctx.fillRect(px + 2, py + 3, cellW - 4, cellH - 6);
                if (rng() < 0.08) { // window AC unit -- sits under the sill
                    ctx.fillStyle = '#7d8288';
                    ctx.fillRect(px + 2, py + cellH - 6, cellW - 4, 3);
                }
            }
        }
    }, cols * cellW, rows * cellH);
}

// a real fissure in the pavement, dropped as ground clutter — pulls
// straight from makeCrackTexture rather than a synthetic crack pattern.
// "wanted" posters for random Wikipedia rabbit holes -- a real 3am-
// wikipedia-spiral joke. Static fallback (real, verifiably-existing
// article titles) placed immediately at layout time; live random
// articles from Wikipedia's public REST API (CORS-enabled, no key
// needed) swap into already-placed posters as they resolve -- fails
// silently and keeps the static fallback if offline/blocked, same
// "never hang the page on a live third-party call" principle as
// everywhere else here, just applied to a decoration instead of core
// content so a network hiccup costs nothing.
const WIKI_FALLBACK = [
    ['DANCING MANIA', 'medieval outbreak, unexplained'],
    ['SPONTANEOUS HUMAN COMBUSTION', 'disputed phenomenon'],
    ['THE GREAT EMU WAR', 'Australia, 1932'],
    ["ROKO'S BASILISK", 'thought experiment'],
    ['TUNGUSKA EVENT', '1908, Siberia'],
    ['VOYNICH MANUSCRIPT', 'undeciphered, 15th c.'],
    ['LIST OF UNUSUAL DEATHS', 'exactly what it sounds like'],
    ['MOTHMAN', 'Point Pleasant, WV'],
    ['THE BLOOP', 'unexplained ocean sound'],
    ['WOW! SIGNAL', '1977, unexplained'],
    ['FERMI PARADOX', 'where is everybody'],
    ['TULIP MANIA', '1637, Dutch bubble'],
    ['BARNUM EFFECT', 'personality feedback'],
    ['DYATLOV PASS INCIDENT', '1959, unresolved'],
    ['ANTIKYTHERA MECHANISM', 'ancient analog computer'],
    ['CICADA 3301', 'internet mystery'],
    ['KASPAR HAUSER', 'feral child mystery'],
    ['PHANTOM TIME HYPOTHESIS', 'conspiracy theory'],
    ['BALL LIGHTNING', 'unexplained atmospheric'],
    ['THE DYATLOV PASS', 'nine hikers, 1959'],
];

// real biographical fragments, styled and shuffled into the exact same
// pool as the Wikipedia rabbit holes above -- on purpose. The whole maze
// runs on the idea that the one true signal shouldn't structurally stand
// out from the noise around it, so these don't get a special frame, a
// special mount, or a special anything: just another wanted poster
// somebody happened to also be right about, indistinguishable from a
// hundred that aren't. Never pushed into wantedPosterMeshes below (see
// addWantedPoster) -- these are real, so they don't get overwritten by
// the live Wikipedia swap the way the fallback fodder does.
const PERSONAL_WANTED_FACTS = [
    ['NEVER FIT IN', 'hippie, skater, gay, freak, hacker'],
    ['MOSTLY STRAIGHT EDGE NOW', 'reformed, allegedly'],
    ['RAN TRACK', 'high school, distance events'],
    ['@BRUCEFALLITM', 'instagram -- unconfirmed sightings'],
    ['@SMALLPLANTENTHUSIAST', 'instagram -- succulents, mostly'],
    ['ARMED WITH OPINIONS', 'approach with snacks'],
    // straight out of his own self-mythology (The Great Book of 8gH) --
    // same in-voice absurdism as the facts above, just further out.
    ['JUDGE OF THE FIFTH BUTTON', 'convened one microwave tribunal'],
    ['KEEPER OF THE CYCLE', 'compress -- condense -- expand -- evaporate'],
    ['THE WORKBENCH IS AN ALTAR', 'not a mess, allegedly'],
    ['NO USER-SERVICEABLE PARTS', 'disputed, opened anyway'],
];
const wantedPosterMeshes = [];
// tagline pairs for the generic (non-personal) wanted poster -- picked per
// poster instead of one fixed pair everywhere, so the wall of them doesn't
// read as a single photocopy repeated over and over.
const WANTED_TAGLINES = [
    ['KNOWLEDGE OF THIS TOPIC', 'REWARD: PEACE OF MIND'],
    ['ANY FURTHER DETAIL', 'REWARD: A GOOD STORY'],
    ['A CREDIBLE SOURCE', 'REWARD: DISBELIEF, EARNED'],
    ['ONE STRAIGHT ANSWER', 'REWARD: NONE OFFERED'],
    ['THE ORIGINAL CITATION', 'REWARD: GOOD LUCK'],
    ['A SECOND WITNESS', 'REWARD: STILL LOOKING'],
    // the six hand-written pairs above paired one subject with one fixed
    // reward each; cross-joining a bigger subject/reward pool the same
    // way GRAFFITI_TAGS and CONFIG.billboards.flavorWords already do
    // turns 6 into 150 without writing 144 more jokes by hand.
    ...(() => {
        const subjects = [
            'A WORKING LINK', 'THE REST OF THE SENTENCE', 'A NAME THAT MATCHES',
            'ANY CORROBORATION', 'A DATE THAT CHECKS OUT', 'THE MISSING CONTEXT',
            'A SOURCE THAT ISN\'T THIS PAGE', 'WHOEVER SAID THIS FIRST', 'THE FULL STORY',
            'ONE VERIFIABLE FACT', 'A SECOND OPINION', 'THE ORIGINAL POST',
            'A PLAUSIBLE EXPLANATION', 'ANYONE WHO REMEMBERS', 'THE FINE PRINT',
        ];
        const rewards = [
            'REWARD: PEACE OF MIND', 'REWARD: A GOOD STORY', 'REWARD: DISBELIEF, EARNED',
            'REWARD: NONE OFFERED', 'REWARD: GOOD LUCK', 'REWARD: STILL LOOKING',
            'REWARD: NOTHING, PROBABLY', 'REWARD: AN EXPLANATION, EVENTUALLY',
            'REWARD: A SHRUG', 'REWARD: YOU TELL ME',
        ];
        const out = [];
        for (const s of subjects) for (const r of rewards) out.push([s, r]);
        return out;
    })(),
];

function makeWantedTexture(title, subtitle, tagline1 = 'KNOWLEDGE OF THIS TOPIC', tagline2 = 'REWARD: PEACE OF MIND') {
    // every axis below rolls independently -- paper tone, ink, font,
    // border weight -- so a wall of these doesn't read as one photocopy
    // run off a hundred times, same treatment addSign's SIGN_FONTS gets.
    const paper = pickPaperColor();
    const ink = pickInkColor();
    const font = pickTextFont();
    const borderWidth = Math.round(randRange(2, 4));
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ink;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.font = `bold 15px ${font}`;
        ctx.fillText('WANTED', w / 2, 20);
        ctx.font = `bold 9px ${font}`;
        ctx.fillText(title, w / 2, h / 2, w - 12);
        ctx.font = `8px ${font}`;
        ctx.fillText(subtitle, w / 2, h / 2 + 16, w - 12);
        ctx.font = `7px ${font}`;
        ctx.fillText(tagline1, w / 2, h - 20);
        ctx.fillText(tagline2, w / 2, h - 10);
    }, 96, 128);
}

function addWantedPoster(x, z, rotY) {
    // ~1 in 5 -- scarce enough that finding one still feels like a find,
    // same logic as everything else in this maze that's actually real.
    const isPersonal = rng() < 0.2;
    // WIKI_FALLBACK is a good but small (20-entry) curated pool -- dropped
    // its weight so the giant/verbal corpus (which never runs dry) carries
    // most of the non-personal load; the curated trivia still shows up
    // often enough to be a nice surprise instead of the default.
    const [title, subtitle] = isPersonal
        ? pick(PERSONAL_WANTED_FACTS)
        : (rng() < 0.25 ? pick(WIKI_FALLBACK) : pickCityNoisePair(rng, x, z));
    const [tagline1, tagline2] = pick(WANTED_TAGLINES);
    const tex = isPersonal
        ? makeWantedTexture(title, subtitle, 'ON FILE, ALLEGEDLY', "REWARD: NONE, HE'S FINE")
        : makeWantedTexture(title, subtitle, tagline1, tagline2);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(randRange(0.55, 0.8), randRange(0.75, 1.1)),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    plane.position.set(x, randRange(1.3, 2.0), z);
    plane.rotation.y = rotY;
    scene.add(plane);
    // only the wiki fallback fodder is swap-eligible for the live random
    // article fetch below -- the personal facts are real and stay put.
    if (!isPersonal) wantedPosterMeshes.push(plane);
    return 0.05;
}

// live random Wikipedia articles -- swaps into whatever posters are
// already on the wall. Runs after layout, so wantedPosterMeshes is
// already fully populated by the time any of these resolve.
function fetchRandomWikiArticles(count) {
    for (let i = 0; i < count; i++) {
        fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary')
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (!data?.title || !wantedPosterMeshes.length) return;
                const mesh = pick(wantedPosterMeshes);
                mesh.material.map = makeWantedTexture(
                    data.title.toUpperCase(),
                    (data.description || 'wikipedia article').slice(0, 42)
                );
                mesh.material.needsUpdate = true;
            })
            .catch(() => {}); // offline/blocked -- static fallback stands, no harm done
    }
}

function addFissureCrack(x, z) {
    const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(randRange(1.2, 2.4), randRange(0.4, 0.8)),
        new THREE.MeshBasicMaterial({ map: makeCrackTexture() })
    );
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = randRange(0, Math.PI * 2);
    crack.position.set(x, 0.013, z);
    scene.add(crack);
    return 0;
}

function makeGroundTexture() {
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0c0808';
        ctx.fillRect(0, 0, w, h);
        // grimy pavement speckle
        for (let i = 0; i < 260; i++) {
            const shade = 10 + Math.floor(rng() * 14);
            ctx.fillStyle = `rgb(${shade + 8},${shade},${shade + 4})`;
            ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
        }
        // faint expansion-joint grid
        ctx.strokeStyle = '#1c1414';
        ctx.lineWidth = 1;
        for (let i = 0; i <= w; i += 8) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
        }
        for (let i = 0; i <= h; i += 8) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
        }
    }, 128, 128);
}

const groundTex = makeGroundTexture();
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(GRID_COLS * 1.5, GRID_ROWS * 1.5);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_W, GRID_H),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- maze generation ----------
// grid[row][col] = true -> building (solid), false -> alley (open).
// perimeter ring is always solid. DFS carves a spanning-tree maze through
// the interior, then a loop pass randomly opens a few extra walls so it
// reads as a tangled market district rather than one strict corridor.

const grid = [];
for (let r = 0; r < GRID_ROWS; r++) {
    grid.push(new Array(GRID_COLS).fill(true));
}

function inBounds(c, r) { return c >= 1 && c < GRID_COLS - 1 && r >= 1 && r < GRID_ROWS - 1; }

const startCol = Math.floor(GRID_COLS / 2);
const startRow = Math.floor(GRID_ROWS / 2);
grid[startRow][startCol] = false;

const stack = [[startCol, startRow]];
const DIRS = [[0, -2], [0, 2], [-2, 0], [2, 0]];
while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const dirs = [...DIRS].sort(() => rng() - 0.5);
    let carved = false;
    for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (inBounds(nc, nr) && grid[nr][nc]) {
            grid[nr][nc] = false;
            grid[r + dr / 2][c + dc / 2] = false; // open the cell between
            stack.push([nc, nr]);
            carved = true;
            break;
        }
    }
    if (!carved) stack.pop();
}

// loop pass: turn some redundant walls into plazas/shortcuts
for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
        if (!grid[r][c]) continue;
        const openNeighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]]
            .filter(([dc, dr]) => !grid[r + dr]?.[c + dc]).length;
        if (openNeighbors >= 2 && rng() < CONFIG.maze.loopChance) {
            grid[r][c] = false;
        }
    }
}

// classify open cells: dead-end (1 open neighbor), corridor (2), plaza (3+)
function openNeighborCount(c, r) {
    return [[0, -1], [0, 1], [-1, 0], [1, 0]]
        .filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false).length;
}

const plazaCells = [];
const allOpenCells = [];
for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
        if (grid[r][c]) continue;
        allOpenCells.push([c, r]);
        if (openNeighborCount(c, r) >= 3) plazaCells.push([c, r]);
    }
}

// random spawn point every load — the maze generation seed (startCol/
// startRow) stays fixed as the DFS anchor, but where *you* start is not
// the same place twice. The "farthest signal" search below runs from here.
const [spawnCol, spawnRow] = allOpenCells[Math.floor(rng() * allOpenCells.length)];
console.log(`[gen] maze grid ready at ${bootElapsed()}: ${GRID_COLS}x${GRID_ROWS} cells, ${allOpenCells.length} open, ${plazaCells.length} plazas, spawn=(${spawnCol},${spawnRow})`);
bootStatus(`maze carved (${allOpenCells.length} open cells) -- building the city…`);

// ---------- building sites: real, possibly multi-cell parcels ----------
// A maze cell is topology, not architecture. Up through the previous
// pass, "one solid cell -> one building" was still the hard rule --
// even an "L-shaped" building was really one big rectangular core with
// a token wing bolted on, because the core was always sized to fill
// nearly all of ONE cell first. That's the actual bug, not the wing
// weights.
//
// A BuildingSite is a connected group of 1-N solid cells that becomes
// ONE building. Because every cell in the group gets its own full-scale
// module (see addBuildingSite below), a site shaped like an L, T, U, or
// long bar produces a building that's GENUINELY that shape at full
// architectural scale -- each arm is a full cell wide/deep, not a
// small appendage on a dominant rectangle.
const SITE_SIZE_WEIGHTS = { 1: 22, 2: 25, 3: 20, 4: 15, 5: 9, 6: 6, 7: 3 };
const siteIdOf = [];
for (let r = 0; r < GRID_ROWS; r++) siteIdOf.push(new Array(GRID_COLS).fill(-1));
const buildingSites = [];

// ---------- signature locations: reservation ----------
// Five authored micro-levels (see CONFIG.signatureBuildings + the
// SIGNATURE_BUILDERS dispatch table near addBuildingSite's call site).
// Reserved BEFORE assembleBuildingSites' generic most-constrained-first
// pass claims anything -- "maze topology -> reserve signature locations
// -> partition remaining solid land into generic BuildingSites", not the
// other way around. Each reserved site becomes a normal buildingSites
// entry (same siteIdOf/cellEdgeKind/party-wall-sealing machinery every
// generic site uses) tagged with `signatureType` + `signatureInstance`,
// so nothing downstream (maze-seal walls, facade classification,
// traversal validation) needs a special case for "this one's authored."
const SIGNATURE_TYPES = ['artGallery', 'as400Archive', 'justinIndex', 'systemsWorkshop', 'loreShrine'];
const signatureInstances = []; // populated below; consumed by ?landmark=, ?debugSignatures=1, and the final report
function reserveSignatureSites(unclaimedSet) {
    const sigConfig = CONFIG.signatureBuildings;
    if (!sigConfig?.enabled) { console.log('[signature] CONFIG.signatureBuildings.enabled=false -- no signature locations this load'); return; }
    const placementCfg = sigConfig.placement;
    const cheby = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
    const minDistToPlaced = (cell, placedCells) => placedCells.length ? Math.min(...placedCells.map(p => cheby(cell, p))) : Infinity;
    const placedCells = []; // every cell of every signature already placed, across all types -- spacing is global, not per-type
    // BFS over solid+unclaimed cells reachable from `seed`, capped at
    // `cap` -- an upper bound on how big a site rooted here could ever
    // grow, computed BEFORE committing to a seed. Without this, a seed
    // cell with a real street edge but sitting in (say) a 1-cell isolated
    // pocket "reserves" successfully and then immediately grows to just
    // 1/5-7 cells, nowhere near targetCells -- this is what makes that
    // structurally impossible instead of a rare bad roll.
    function unclaimedBlobSize(seed, cap) {
        const seen = new Set([`${seed.col},${seed.row}`]);
        const stack = [seed];
        while (stack.length && seen.size < cap) {
            const cur = stack.pop();
            for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nc = cur.col + dc, nr = cur.row + dr, k = `${nc},${nr}`;
                if (seen.size >= cap) break;
                if (grid[nr]?.[nc] && unclaimedSet.has(k) && !seen.has(k)) { seen.add(k); stack.push({ col: nc, row: nr }); }
            }
        }
        return seen.size;
    }

    for (const type of SIGNATURE_TYPES) {
        const typeCfg = sigConfig[type];
        if (!typeCfg?.enabled) { console.log(`[signature] ${type}: disabled in config -- skipped`); continue; }
        const [minCells, maxCells] = typeCfg.targetCells;

        // 1) pick a seed cell: unclaimed, solid, has a real street/alley
        // edge (a mandatory entrance), far enough (Chebyshev, cell-space)
        // from every other signature placed so far. Scored toward
        // preferredDistanceCells rather than "as far as possible" -- the
        // latter just piles every landmark into whichever corner is
        // farthest from the map center.
        let best = null, bestScore = -Infinity, attempts = 0;
        const shuffled = [...unclaimedSet].sort(() => rng() - 0.5);
        for (const key of shuffled) {
            if (++attempts > placementCfg.maxSeedAttempts) break;
            const [c, r] = key.split(',').map(Number);
            const cell = { col: c, row: r };
            const openSides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false).length;
            if (placementCfg.requireStreetEntrance && openSides < 1) continue;
            const d = minDistToPlaced(cell, placedCells);
            if (d < placementCfg.minDistanceCells) continue;
            if (unclaimedBlobSize(cell, minCells) < minCells) continue; // can't reach the minimum footprint from here -- don't even try
            // d is Infinity for the very first signature placed (nothing
            // to be far from yet) -- Math.abs(Infinity) is Infinity, so an
            // un-guarded distance term would make EVERY candidate's score
            // -Infinity, which never beats bestScore's own -Infinity
            // starting value and silently leaves `best` null forever. Only
            // apply the preferred-distance term once there's an actual
            // finite distance to score against.
            const distScore = Number.isFinite(d) ? -Math.abs(d - placementCfg.preferredDistanceCells) : 0;
            const score = distScore + openSides * 0.5 + rng() * 0.75;
            if (score > bestScore) { bestScore = score; best = cell; }
        }
        if (!best) {
            console.warn(`[signature] ${type}: no valid seed cell found in ${attempts} attempts (spacing=${placementCfg.minDistanceCells} cells + street-entrance constraint too tight for this seed/map) -- DISABLED this load`);
            continue;
        }

        // 2) grow it exactly like a generic site (same random-adjacent-
        // claim rule as assembleBuildingSites below), just against this
        // signature's own [min,max] cell-count target instead of
        // SITE_SIZE_WEIGHTS, and only ever claiming cells `unclaimedSet`
        // still owns (earlier signatures/this one's own seed already
        // removed theirs).
        const target = minCells + Math.floor(rng() * (maxCells - minCells + 1));
        const cells = [best];
        const claimed = new Set([`${best.col},${best.row}`]);
        unclaimedSet.delete(`${best.col},${best.row}`);
        while (cells.length < target) {
            const candidates = [];
            for (const cell of cells) {
                for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    const nc = cell.col + dc, nr = cell.row + dr, k = `${nc},${nr}`;
                    if (grid[nr]?.[nc] && unclaimedSet.has(k) && !claimed.has(k)) candidates.push({ col: nc, row: nr });
                }
            }
            if (!candidates.length) break; // boxed in -- smaller-than-target footprint is a valid outcome, same as generic sites
            const next = pick(candidates);
            cells.push(next);
            claimed.add(`${next.col},${next.row}`);
            unclaimedSet.delete(`${next.col},${next.row}`);
        }
        if (cells.length < minCells) {
            console.warn(`[signature] ${type}: grew to only ${cells.length}/${minCells}-${maxCells} target cells (boxed in by earlier reservations) -- keeping the smaller footprint`);
        }

        // 3) re-derive every real open (street/alley) edge against the
        // FINAL cell set -- growth can add or remove adjacency the seed
        // cell alone didn't have. This is also the actual validation that
        // "mainEntrance -> open navigation region": grid[...]===false is
        // real carved alley pavement, guaranteed reachable (every open
        // cell is on the DFS spanning tree), never another solid building.
        const openEdges = [];
        for (const cell of cells)
            for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
                if (grid[cell.row + dr]?.[cell.col + dc] === false) openEdges.push({ cell, dc, dr });
        if (!openEdges.length) {
            console.warn(`[signature] ${type}: grew with NO street-facing edge left (fully boxed in) -- unenterable, DISABLED this load; cells returned to the generic pool`);
            for (const c of cells) unclaimedSet.add(`${c.col},${c.row}`);
            continue;
        }
        const mainEdge = pick(openEdges);
        const secondaryPool = openEdges.filter(e => e !== mainEdge);
        const secondaryEdge = secondaryPool.length ? pick(secondaryPool) : null;
        if (placementCfg.requireSecondaryConnection && !secondaryEdge) {
            console.warn(`[signature] ${type}: only one street-facing edge -- proceeding without a secondary route (footprint too small/pinched this seed)`);
        }

        const id = buildingSites.length;
        for (const c of cells) siteIdOf[c.row][c.col] = id;
        const toEntrance = (edge) => {
            const { x: cx, z: cz } = cellToWorld(edge.cell.col, edge.cell.row);
            const doorX = cx + edge.dc * CELL / 2, doorZ = cz + edge.dr * CELL / 2;
            // the neighboring open cell's own CENTER, not an arbitrary
            // offset from the door -- exactly the same "safe interior of
            // an open cell" point the normal random spawn already uses
            // (see `spawn = cellToWorld(spawnCol, spawnRow)` below), so
            // ?landmark= can never place the player inside a wall or
            // clipping the building across a narrow alley. Half a cell
            // (3.5 units) out from the door lands squarely in the
            // "3-5 meters in front of the entrance" the spec asks for.
            const outside = cellToWorld(edge.cell.col + edge.dc, edge.cell.row + edge.dr);
            return {
                cell: edge.cell, dc: edge.dc, dr: edge.dr,
                doorX, doorZ,
                outwardRotY: outwardRotationY(edge.dc, edge.dr),   // wall-mounted-object convention (local +Z is "front") -- this makes a sign's front face point (dc,dr), away from the building.
                // A THREE.PerspectiveCamera (or PointerLockControls) uses
                // the opposite convention -- local -Z is "forward" -- so
                // the SAME angle that points a sign's +Z face outward
                // points a camera's forward axis the other way, back
                // toward the door: rotation.y=outwardRotationY(dc,dr)
                // sends a sign's +Z to world (dc,dr) but a camera's -Z to
                // world (-dc,-dr). Verified against the cardinal-
                // orientation self-test's own convention, not guessed.
                facingRotY: outwardRotationY(edge.dc, edge.dr),
                outsideX: outside.x, outsideZ: outside.z,
            };
        };
        const instance = {
            type, id, cells,
            mainEntrance: toEntrance(mainEdge),
            secondaryEntrance: secondaryEdge ? toEntrance(secondaryEdge) : null,
        };
        signatureInstances.push(instance);
        buildingSites.push({ id, cells, signatureType: type, signatureInstance: instance });
        placedCells.push(...cells);
        console.log(`[signature] ${typeCfg.exteriorName ?? type} reserved: site=${id} cells=${cells.length} (target ${minCells}-${maxCells}) entrance=(${instance.mainEntrance.doorX.toFixed(1)},${instance.mainEntrance.doorZ.toFixed(1)}) ${secondaryEdge ? '+secondary' : '(no secondary)'}`);
    }
}

function assembleBuildingSites() {
    // this maze's perimeter ring is always solid and touches most of the
    // interior's solid cells too -- the "natural" contiguous solid mass
    // this carves sites out of is often 15-70+ cells, not small isolated
    // blobs. Seeding new sites in pure random order left oddly-shaped
    // single-cell remainders scattered through that mass (measured: over
    // 40% single-cell sites against the real maze algorithm) -- whichever
    // cells happened to be processed last were simply whatever nearby
    // sites hadn't already claimed, often just one boxed-in leftover.
    const unclaimedSet = new Set();
    for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++)
            if (grid[r][c]) unclaimedSet.add(`${c},${r}`);
    reserveSignatureSites(unclaimedSet); // MUST run before the generic pass below claims anything
    const availableDegree = (c, r) => [[0, -1], [0, 1], [-1, 0], [1, 0]]
        .filter(([dc, dr]) => grid[r + dr]?.[c + dc] && siteIdOf[r + dr][c + dc] === -1).length;

    while (unclaimedSet.size) {
        // seed the next site at whichever unclaimed cell is CURRENTLY the
        // most constrained (fewest still-unclaimed solid neighbors) --
        // a "most-constrained-first" pass, not a random one. Already-
        // boxed-in cells get first pick at growing into whatever room is
        // still around them, instead of getting left for last after
        // everything around them is already claimed.
        let best = null, bestDegree = Infinity;
        for (const key of unclaimedSet) {
            const [c, r] = key.split(',').map(Number);
            const d = availableDegree(c, r);
            if (d < bestDegree) { bestDegree = d; best = [c, r]; if (d === 0) break; }
        }
        const [c0, r0] = best;
        unclaimedSet.delete(`${c0},${r0}`);
        const id = buildingSites.length;
        const cells = [{ row: r0, col: c0 }];
        siteIdOf[r0][c0] = id;
        const target = Number(weightedPick(SITE_SIZE_WEIGHTS));
        // grow by repeatedly claiming a random unclaimed solid cell
        // adjacent to ANY cell already in the site (not just the most
        // recent one) -- candidates are gathered from every member each
        // round, which naturally favors compact/chunky growth over long
        // snaking lines, and is what occasionally produces a cell fully
        // enclosed by its own site (a real courtyard candidate, see
        // addBuildingSite). Duplicate candidates (adjacent to 2+ members
        // at once) are fine -- picking one just biases toward the more
        // "enclosed" growth direction, which is desirable here.
        while (cells.length < target) {
            const candidates = [];
            for (const cell of cells) {
                for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    const nc = cell.col + dc, nr = cell.row + dr;
                    if (grid[nr]?.[nc] && siteIdOf[nr][nc] === -1) candidates.push([nc, nr]);
                }
            }
            if (!candidates.length) break; // boxed in by other sites/open cells -- stop short of target, single/small site is a valid outcome
            const [nc, nr] = pick(candidates);
            siteIdOf[nr][nc] = id;
            unclaimedSet.delete(`${nc},${nr}`);
            cells.push({ row: nr, col: nc });
        }
        buildingSites.push({ id, cells });
    }
}
assembleBuildingSites();
{
    const totalCells = buildingSites.reduce((s, x) => s + x.cells.length, 0);
    const bySize = {};
    for (const s of buildingSites) bySize[s.cells.length] = (bySize[s.cells.length] || 0) + 1;
    console.log(`[gen] ${buildingSites.length} building sites over ${totalCells} solid cells (mean ${(totalCells / buildingSites.length).toFixed(2)} cells/site) -- size histogram:`, bySize);
}

// which relationship a cell's given side has to whatever is on the
// other side of it -- this (not the old single "margin from cell edge"
// idea) is what actually decides whether that side gets a real wall:
//   'internal'  -- another cell of the SAME site: no wall at all, a
//                  full-width open connection (two modules merge into
//                  one interior)
//   'party'     -- a solid cell belonging to a DIFFERENT site: a real,
//                  near-flush wall, no door (an attached-row party wall,
//                  not a connection between buildings)
//   'street'    -- an open (alley) cell, or the map's outer edge: a
//                  real wall with the usual door/setback treatment
function cellEdgeKind(r, c, dr, dc) {
    const nr = r + dr, nc = c + dc;
    if (grid[nr]?.[nc] === undefined) return 'street'; // out of grid bounds
    if (grid[nr][nc] === false) return 'street';
    return siteIdOf[nr][nc] === siteIdOf[r][c] ? 'internal' : 'party';
}

// ---------- maze topology: explicit OPEN/CLOSED edges ----------
// grid[r][c] marks a cell solid/open, but a *rendered* building only
// fills an inset footprint (CELL - margin) of its cell -- up to ~1.4
// units smaller than the cell, on each side. Two adjacent SOLID
// (building) cells can therefore leave a real 0.5-1.4 unit gap between
// their facades, wide enough for the player capsule to slip through
// what the maze topology says is a sealed wall -- the rendered geometry
// defeats the DFS topology. Enforcing the maze is now a structural
// system independent of whatever geometry (buildings, wings, annexes,
// decor) happens to be inset within each cell: every building/building
// boundary gets a guaranteed collision seal spanning the full cell
// width, regardless of what's drawn nearby.
//
// Deliberately does NOT touch building/open (alley) boundaries: a
// building's own exterior wall is already the correct, complete
// collision there -- if it has a door on that face (see addBuilding),
// that door is a real, intentional entrance, not a topology bug to
// close. An earlier version of this sealed every non-open-open
// boundary indiscriminately, which silently walled up every building's
// front door along with the actual gaps it was meant to fix -- entering
// any building became impossible. Building-to-building is the only
// case where a seal is actually needed (and open-to-open needs none at
// all -- that's just the maze's own carved alley pavement).
//
// One more exception now that a building can span multiple cells: two
// SOLID cells belonging to the SAME site are an intentional, fully open
// interior connection (see cellEdgeKind's 'internal' case) -- sealing
// that boundary would erect an invisible wall through the middle of a
// real room. Only building/building edges where the two cells belong to
// DIFFERENT sites (a genuine party wall between two separate buildings)
// still get sealed.
const mazeSealWalls = []; // {x1,z1,x2,z2,yMin,yMax} -- ground-level only, see MAZE_SEAL_HEIGHT
// just above eye height + jump apex (~0.94) -- tall enough nothing can
// walk or hop over it at ground level, but well under even the
// shortest warehouse's real roof (enterHeight >= 3.0 always), so
// rooftop-to-rooftop traversal -- an intentional alternate route, not a
// crack in the maze -- is never blocked by ground-level sealing.
const MAZE_SEAL_HEIGHT = 2.2;
for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
        const { x: cx, z: cz } = cellToWorld(c, r);
        // east boundary, (c,r)-(c+1,r) -- only between two DIFFERENT buildings
        if (c + 1 < GRID_COLS && grid[r]?.[c] && grid[r]?.[c + 1] && siteIdOf[r][c] !== siteIdOf[r][c + 1]) {
            const bx = cx + CELL / 2;
            mazeSealWalls.push({ x1: bx, z1: cz - CELL / 2, x2: bx, z2: cz + CELL / 2, yMin: 0, yMax: MAZE_SEAL_HEIGHT });
            for (let i = 0; i < 4; i++) addFenceSegment(bx, cz - CELL / 2 + (i + 0.5) * (CELL / 4), Math.PI / 2);
        }
        // south boundary, (c,r)-(c,r+1) -- only between two DIFFERENT buildings
        if (r + 1 < GRID_ROWS && grid[r]?.[c] && grid[r + 1]?.[c] && siteIdOf[r][c] !== siteIdOf[r + 1][c]) {
            const bz = cz + CELL / 2;
            mazeSealWalls.push({ x1: cx - CELL / 2, z1: bz, x2: cx + CELL / 2, z2: bz, yMin: 0, yMax: MAZE_SEAL_HEIGHT });
            for (let i = 0; i < 4; i++) addFenceSegment(cx - CELL / 2 + (i + 0.5) * (CELL / 4), bz, 0);
        }
    }
}
console.log(`[testing] maze topology: ${mazeSealWalls.length} cell boundaries sealed -- squeezing between adjacent buildings is no longer physically possible (same-site internal edges correctly excluded)`);

// ---------- reusable geometry/materials ----------

const skirtBoxGeo = new THREE.BoxGeometry(1, 1, 1);

// generic one-time vertex jitter — perturbs a geometry's own vertices at
// creation so cheap primitives (crates, cans, machines) read as hand-built
// rather than perfectly regular. Zero runtime cost: it runs once, not
// per-frame, and doesn't add a single vertex or draw call.
function jitterGeometry(geo, amount) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
            i,
            pos.getX(i) + randRange(-amount, amount),
            pos.getY(i) + randRange(-amount, amount) * 0.4,
            pos.getZ(i) + randRange(-amount, amount)
        );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
}

// an organic tower: an 8-sided chamfered footprint (every corner cut by an
// independently randomized amount — never a clean rectangle), tapered and
// twisted between base and roof. Crucially, the 4 cardinal edge MIDPOINTS
// (x=0 on the ±z edges, z=0 on the ±x edges) are untouched by the corner
// cuts, since cuts are capped at half the footprint — so sign mounting and
// grid collision (both keyed to those midpoints) don't need to change at
// all; only the visible silhouette does.
function buildOrganicTowerGeometry(hwx, hwz, height) {
    // corner cuts rolled per-axis -- an elongated core (hwx != hwz) now
    // produces an elongated chamfered tower instead of silently rounding
    // off to a square the moment it rises above the real enterable floors.
    const cutX = () => randRange(hwx * 0.12, hwx * 0.5);
    const cutZ = () => randRange(hwz * 0.12, hwz * 0.5);
    const nwX = cutX(), nwZ = cutZ(), neX = cutX(), neZ = cutZ(),
        seX = cutX(), seZ = cutZ(), swX = cutX(), swZ = cutZ();
    const basePts = [
        [-hwx + nwX, -hwz], [hwx - neX, -hwz],  // north edge, z = -hwz
        [hwx, -hwz + neZ], [hwx, hwz - seZ],    // east edge, x = hwx
        [hwx - seX, hwz], [-hwx + swX, hwz],    // south edge, z = hwz
        [-hwx, hwz - swZ], [-hwx, -hwz + nwZ],  // west edge, x = -hwx
    ];

    const taper = randRange(0.7, 1.2);
    const twist = randRange(-0.15, 0.15);
    const cosT = Math.cos(twist), sinT = Math.sin(twist);
    const topPts = basePts.map(([px, pz]) => {
        const sx = px * taper, sz = pz * taper;
        return [sx * cosT - sz * sinT, sx * sinT + sz * cosT];
    });

    const n = basePts.length;
    const positions = [];
    const uvs = [];
    const pushTri = (a, b, c) => { positions.push(...a, ...b, ...c); };

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const b0 = [basePts[i][0], 0, basePts[i][1]];
        const b1 = [basePts[j][0], 0, basePts[j][1]];
        const t0 = [topPts[i][0], height, topPts[i][1]];
        const t1 = [topPts[j][0], height, topPts[j][1]];
        // CCW winding when viewed from outside (three.js front-face
        // convention) -- (b0,b1,t1)/(b0,t1,t0) was backwards, which
        // culled the visible face entirely and left the wall invisible
        // from the alley side while still solid from inside.
        // u now runs 0->1 across each facet (used to be hardcoded 0.5
        // everywhere) so a window-grid texture reads as a real per-floor,
        // per-facet grid instead of one stretched vertical sliver.
        pushTri(b0, t1, b1); uvs.push(0, 0, 1, 1, 1, 0);
        pushTri(b0, t0, t1); uvs.push(0, 0, 0, 1, 1, 1);
    }
    for (let i = 1; i < n - 1; i++) { // top cap fan (footprint is convex)
        const t0 = [topPts[0][0], height, topPts[0][1]];
        const ti = [topPts[i][0], height, topPts[i][1]];
        const tj = [topPts[i + 1][0], height, topPts[i + 1][1]];
        pushTri(t0, tj, ti); uvs.push(0.5, 1, 0.5, 1, 0.5, 1); // same fix, normal was pointing down into the roof
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}

// actual footprint per building cell, so collision always matches what's
// rendered instead of assuming a worst-case size (that mismatch is exactly
// the "invisible wall where it looks walkable" bug).
const footprintOf = [];
for (let r = 0; r < GRID_ROWS; r++) footprintOf.push(new Array(GRID_COLS).fill(null));

// ---------- real per-wall interior collision ----------
// every building has a walkable ground-floor shell now -- this replaces
// the earlier "whole cell walkable" simplification entirely. Solid walls
// are stored as line segments and the player collides with each one
// individually; only the actual door gap is open. buildingWallSegments
// also doubles as the "does this cell have registered collision" map
// used by resolveCollisions, replacing the old whole-footprint-square
// check for every building cell, not just the special-cased few.
// "row,col" -> { floors: [{yMin, yMax, segments: [{x1,z1,x2,z2}, ...]}, ...] }
// -- per-floor now, not one shared list + a single topY cutoff: a wall
// registered for floor 2 only ever blocks a player whose feet are within
// THAT floor's own [yMin,yMax] band (see resolveCollisions), so an upper
// floor's (now independently laid-out) walls can never block a lower
// floor at the same X/Z, and standing above every registered floor's
// yMax means this building can't block you horizontally at all -- out
// over the roof/skyline, same as before.
const buildingWallSegments = new Map();
const WALL_THICKNESS = 0.12;

// diagnostic only -- counts real exterior walls created because a
// same-site neighbor stops at a lower floor (see floorMax gaps in
// addBuildingModule). A nonzero count on a map with any multi-floor site
// is the regression signal for the "internal edges ignored floor count"
// bug: before the fix this was structurally always 0 (baseGaps had no
// floor concept at all), even on the exact A=5/B=3-floor same-site
// adjacency the bug report describes.
let totalExposedSetbackWalls = 0;

// elevation: mezzanines inside ~30% of building interiors, reached by a
// straight (always axis-aligned, never an arbitrary angle) run of steps.
// groundHeightAt() below is what actually moves the camera up/down.
const elevatedPlatforms = []; // {x,z,hx,hz,y}
// building rooftops specifically, a subset of elevatedPlatforms tagged
// with which building they belong to -- lets a post-generation pass
// (buildRooftopCatwalks) find genuine nearby-rooftop pairs to bridge
// without trawling every mezzanine/ladder-rung/wing-floor entry too.
const rooftopDecks = []; // {x,z,hx,hz,y,buildingKey}
const rampRuns = []; // {axis, from, to, fixedCoord, halfWidth, y0, y1}
// every building's ground-floor roof cap is a hard ceiling for whoever's
// jumping around inside that room -- separate from elevatedPlatforms
// (which are ALSO a ceiling when approached from below, just one that's
// also a legitimate floor once you're standing on top of it instead).
const overheadCeilings = []; // {x,z,hx,hz,y} -- always blocks upward, never a floor

// feetY (the player's actual current world foot height, from last frame)
// is what makes prop-tops (and now platforms/ramps too) work as real
// ground rather than either always blocking or always yanking you
// upward: a candidate only counts if you're already at/above it within
// MAX_STEP_HEIGHT slack, the same rule resolveCollisions uses to decide
// whether that same prop is a wall. Picks the tallest valid candidate
// under you, not just the first match.
//
// The platform/ramp gating matters for a real, previously-live bug: a
// fire escape's flights reuse the exact same horizontal footprint at
// every height (buildFireEscapeStair zigzags in place, it doesn't
// actually move sideways), so a landing near the top and a landing near
// the bottom can share the same (x,z). Without gating, "tallest matching
// candidate" meant walking up to the BASE of a fire escape snapped you
// straight to its top landing -- ungated, a match is a match regardless
// of how far above you it actually is. Gated, only a landing/ramp height
// you've actually climbed within reach of counts.
function groundHeightAt(x, z, feetY = Infinity) {
    let best = 0; // bare ground
    for (const p of elevatedPlatforms) {
        if (p.y <= best || p.y > feetY + MAX_STEP_HEIGHT) continue;
        if (Math.abs(x - p.x) < p.hx && Math.abs(z - p.z) < p.hz) best = p.y;
    }
    for (const r of rampRuns) {
        const along = r.axis === 'x' ? x : z;
        const cross = r.axis === 'x' ? z : x;
        if (Math.abs(cross - r.fixedCoord) > r.halfWidth) continue;
        const t = (along - r.from) / (r.to - r.from);
        if (t < 0 || t > 1) continue;
        const y = r.y0 + (r.y1 - r.y0) * t;
        if (y > best && y <= feetY + MAX_STEP_HEIGHT) best = y;
    }
    for (const p of propColliders) {
        if (p.height === Infinity) continue; // always a wall, never a floor
        if (p.height <= best) continue;
        if (p.height > feetY + MAX_STEP_HEIGHT) continue; // too tall to have stepped/landed up onto yet
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz <= p.radius * p.radius) best = p.height;
    }
    return best;
}

// every floor-like surface whose XZ footprint contains (x,z), regardless
// of how far away its Y is -- ground plane is always included as the
// ultimate backstop. Used only for the airborne landing check below;
// walking/auto-step still goes through groundHeightAt's MAX_STEP_HEIGHT
// gating above, a genuinely different rule (can you step up onto this
// while grounded) from "did you just fall through this while airborne."
function surfaceHeightsAt(x, z) {
    const ys = [0];
    for (const p of elevatedPlatforms) {
        if (Math.abs(x - p.x) < p.hx && Math.abs(z - p.z) < p.hz) ys.push(p.y);
    }
    for (const r of rampRuns) {
        const along = r.axis === 'x' ? x : z;
        const cross = r.axis === 'x' ? z : x;
        if (Math.abs(cross - r.fixedCoord) > r.halfWidth) continue;
        const t = (along - r.from) / (r.to - r.from);
        if (t < 0 || t > 1) continue;
        ys.push(r.y0 + (r.y1 - r.y0) * t);
    }
    for (const p of propColliders) {
        if (p.height === Infinity) continue;
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz <= p.radius * p.radius) ys.push(p.height);
    }
    return ys;
}

// the airborne half of vertical motion: world-Y is authoritative while
// airborne (see the big comment on `grounded` near where it's declared)
// -- this only ever SNAPS feet Y down onto a surface at the moment of a
// real crossing (was at/above it, about to be at/below it, within this
// surface's own footprint), never merely because some unrelated surface
// now happens to sit within reach of last frame's foot height. Returns
// the landing Y, or null if nothing was crossed this frame.
const LANDING_EPS = 0.02;
function findLandingSurface(x, z, feetY, predictedFeetY, verticalVelocity) {
    if (verticalVelocity > 0) return null; // still ascending -- can't land mid-rise
    let landing = null;
    for (const y of surfaceHeightsAt(x, z)) {
        if (feetY >= y - LANDING_EPS && predictedFeetY <= y + LANDING_EPS) {
            if (landing === null || y > landing) landing = y; // highest crossed surface -- the first one you'd actually hit falling
        }
    }
    return landing;
}

// a single interior partition wall with one doorway gap -- the building
// block the room-layout pass below uses to carve a single floor into
// several rooms. axis='x' means a wall of constant x (its normal points
// along x), spanning z across [spanA, spanB]; axis='z' is the same thing
// rotated 90 degrees. yBase lets the same wall (same XZ layout) be redrawn
// at a different floor's height -- every floor in a building shares one
// layout (see buildFloorLayout) so the collision segments below stay
// correct no matter which floor's Y the player is actually at (collision
// is Y-independent -- see resolveCollisions -- so every floor MUST agree
// on where the walls are, or an upper floor's wall would silently block
// movement on a lower floor with a different layout). Returns collision
// segments the same shape buildingWallSegments already expects, so no
// other code needs to know interior walls exist at all.
// draws a straight wall along `axis` at `fixedCoord`, spanning
// [spanA, spanB], with zero or more rectangular gaps left fully open --
// doorways, archways into an attached wing module, a stairwell entrance,
// whatever. Generalizes what used to be two separate single-gap
// functions (addInteriorWall's own door cut, and buildExteriorPerimeter's
// duplicate jamb-cutting logic) into one. Returns collision segments for
// the solid parts only -- gaps are genuinely open, not implied doors.
// remaps a fresh wall BoxGeometry's UVs from local vertex position, so
// the SAME facade texture (see makeWindowGridTexture -- one texture
// describes the building's ENTIRE height) reads as one continuous
// surface across every separately-built wall segment, instead of each
// segment showing its own independently-squashed 0..1 copy of the whole
// thing. u0/u1 are this segment's real fraction of the FULL wall span
// (spanA..spanB, not just this one gap-split piece); v0/v1 are this
// FLOOR's real fraction of the full building height (not 0..1 of just
// this floor). Works uniformly on all 6 box faces (the 2 large ones AND
// the 4 thin jamb/cap edges) since it's driven by real local position,
// not by which face index happens to be which.
function remapWallUV(geo, axis, len, height, u0, u1, v0, v1) {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const tangentCoord = axis === 'x' ? pos.getZ(i) : pos.getX(i);
        const tu = tangentCoord / len + 0.5, tv = pos.getY(i) / height + 0.5;
        uv.setXY(i, u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
    uv.needsUpdate = true;
}

function buildWallWithGaps(axis, fixedCoord, spanA, spanB, gaps, height, mat, yBase = 0, fullHeight = height) {
    const sorted = gaps.slice().sort((a, b) => a.lo - b.lo);
    const segs = [];
    // real volume, not a zero-thickness plane -- WALL_THICKNESS matches
    // collision exactly (see resolveCollisions), so what you see is what
    // you bump into. At a grazing angle an infinitely thin PlaneGeometry
    // all but disappears; a real box always has a visible edge, an
    // interior face, an exterior face, and real jamb thickness at every
    // door/gap. Built axis-aligned directly (thickness on whichever axis
    // is fixed) instead of a plane + a 90-degree rotation hack -- a box's
    // dimensions can just BE the wall's real footprint.
    const spanLen = spanB - spanA;
    const addSolid = (a0, a1) => {
        if (a1 - a0 < 0.05) return;
        const len = a1 - a0, mid = (a0 + a1) / 2;
        const geo = axis === 'x' ? new THREE.BoxGeometry(WALL_THICKNESS, height, len) : new THREE.BoxGeometry(len, height, WALL_THICKNESS);
        // see remapWallUV -- u is this segment's real position within the
        // FULL span (so a door split doesn't restart the texture on
        // either side), v is this floor's real position within the full
        // building height (so floor N shows floor N's own slice of the
        // window-grid texture, not another squashed copy of the whole
        // building).
        remapWallUV(geo, axis, len, height,
            spanLen > 0 ? (a0 - spanA) / spanLen : 0, spanLen > 0 ? (a1 - spanA) / spanLen : 1,
            yBase / fullHeight, (yBase + height) / fullHeight);
        const wall = new THREE.Mesh(geo, mat);
        if (axis === 'x') {
            wall.position.set(fixedCoord, yBase + height / 2, mid);
            segs.push({ x1: fixedCoord, z1: a0, x2: fixedCoord, z2: a1 });
        } else {
            wall.position.set(mid, yBase + height / 2, fixedCoord);
            segs.push({ x1: a0, z1: fixedCoord, x2: a1, z2: fixedCoord });
        }
        scene.add(wall);
    };
    let cursor = spanA;
    for (const g of sorted) {
        const lo = Math.max(spanA, Math.min(g.lo, g.hi)), hi = Math.min(spanB, Math.max(g.lo, g.hi));
        if (hi <= cursor) continue; // degenerate/out-of-range gap -- ignore rather than corrupt the cursor
        addSolid(cursor, Math.max(cursor, lo));
        cursor = Math.max(cursor, hi);
    }
    addSolid(cursor, spanB);
    return segs;
}

// the 4 exterior walls of one floor of one module -- solid on all sides,
// or a real doorway toward `door` (the building's single street entrance,
// ground floor of the core module only), plus zero or more extra open
// gaps (`openGaps`, {dx,dz,lo,hi}) -- an archway into an attached wing on
// whichever side it's attached, full floor-to-ceiling open, no lintel
// (that's what makes it read as one connected interior rather than two
// rooms joined by a doorway). hwx/hwz let a module be a genuine rectangle
// (needed for wings), not just a square. Returns wall segments for
// collision.
function buildExteriorPerimeter(x, z, hwx, hwz, y0, floorHeight, door, mat, openGaps = [], fullHeight = floorHeight) {
    const doorWidth = 1.5, doorHeight = 2.3;
    const faces = [
        { dx: 0, dz: -1, axis: 'z', fixedCoord: z - hwz, spanA: x - hwx, spanB: x + hwx, along: x },
        { dx: 0, dz: 1, axis: 'z', fixedCoord: z + hwz, spanA: x - hwx, spanB: x + hwx, along: x },
        { dx: -1, dz: 0, axis: 'x', fixedCoord: x - hwx, spanA: z - hwz, spanB: z + hwz, along: z },
        { dx: 1, dz: 0, axis: 'x', fixedCoord: x + hwx, spanA: z - hwz, spanB: z + hwz, along: z },
    ];
    const segments = [];
    for (const f of faces) {
        const gaps = [];
        const isDoorWall = door && f.dx === door.dx && f.dz === door.dz;
        if (isDoorWall) gaps.push({ lo: f.along - doorWidth / 2, hi: f.along + doorWidth / 2 });
        for (const g of openGaps) if (g.dx === f.dx && g.dz === f.dz) gaps.push({ lo: g.lo, hi: g.hi });
        segments.push(...buildWallWithGaps(f.axis, f.fixedCoord, f.spanA, f.spanB, gaps, floorHeight, mat, y0, fullHeight));
        if (isDoorWall) {
            // header above the doorway, floor-to-ceiling minus doorHeight
            // -- the gap below it is real open space, no segment there.
            // Archway gaps (into a wing) skip this on purpose: those read
            // as one open room, not a doorway. Same real-thickness box as
            // buildWallWithGaps, axis-aligned directly -- no rotation
            // needed, and no seam/z-fight against the real wall it sits
            // flush on top of.
            const lintelH = floorHeight - doorHeight;
            const lintelGeo = f.axis === 'x' ? new THREE.BoxGeometry(WALL_THICKNESS, lintelH, doorWidth) : new THREE.BoxGeometry(doorWidth, lintelH, WALL_THICKNESS);
            remapWallUV(lintelGeo, f.axis, doorWidth, lintelH,
                (f.along - doorWidth / 2 - f.spanA) / (f.spanB - f.spanA), (f.along + doorWidth / 2 - f.spanA) / (f.spanB - f.spanA),
                (y0 + doorHeight) / fullHeight, (y0 + doorHeight + lintelH) / fullHeight);
            const lintel = new THREE.Mesh(lintelGeo, mat);
            if (f.axis === 'x') lintel.position.set(f.fixedCoord, y0 + doorHeight + lintelH / 2, f.along);
            else lintel.position.set(f.along, y0 + doorHeight + lintelH / 2, f.fixedCoord);
            scene.add(lintel);
        }
    }
    return segments;
}

// computes (but doesn't draw) the interior partition-wall layout for one
// floor of one module -- 2-4 rooms, every doorway carved to open onto
// whatever's already reachable from the entrance, so connectivity falls
// out of construction order instead of needing a graph search. Called
// FRESH for every floor now (each floor gets its own independent layout
// -- see buildWallWithGaps/the per-floor collision banding in
// buildingWallSegments for why floors no longer need to agree on one
// shared X/Z layout the way they used to).
function buildFloorLayout(x, z, hwx, hwz, door) {
    const awayX = door ? -door.dx : 0;
    const awayZ = door ? -door.dz : -1;
    const depthAxis = awayX !== 0 ? 'x' : 'z';
    const depthCenter = depthAxis === 'x' ? x : z;
    const depthAway = depthAxis === 'x' ? awayX : awayZ;
    const depthHalf = depthAxis === 'x' ? hwx : hwz;
    const widthCenter = depthAxis === 'x' ? z : x;
    const widthHalf = depthAxis === 'x' ? hwz : hwx;
    // world coordinate along the depth axis at fraction f, from the door
    // wall (f=0) to the far wall (f=1)
    const depthAt = (f) => depthCenter + depthAway * depthHalf * (2 * f - 1);

    // 'single' (no interior walls at all) used to be in this pool -- at
    // 20% odds, it read as "most buildings are still just one room."
    // Dropped entirely: every floor is now guaranteed to be subdivided.
    const layout = weightedPick({ twoRoom: 5, threeRow: 4, lshape: 3 });
    const walls = []; // {axis, fixedCoord, spanA, spanB, doorFrac}
    if (layout === 'twoRoom') {
        const f1 = randRange(0.38, 0.6);
        walls.push({ axis: depthAxis, fixedCoord: depthAt(f1), spanA: widthCenter - widthHalf, spanB: widthCenter + widthHalf, doorFrac: randRange(0.25, 0.75) });
    } else if (layout === 'threeRow') {
        const f1 = randRange(0.28, 0.4), f2 = randRange(0.62, 0.75);
        walls.push({ axis: depthAxis, fixedCoord: depthAt(f1), spanA: widthCenter - widthHalf, spanB: widthCenter + widthHalf, doorFrac: randRange(0.2, 0.45) });
        walls.push({ axis: depthAxis, fixedCoord: depthAt(f2), spanA: widthCenter - widthHalf, spanB: widthCenter + widthHalf, doorFrac: randRange(0.55, 0.8) });
    } else if (layout === 'lshape') {
        const f1 = randRange(0.42, 0.58);
        // front/back divider -- doorway forced to the low-width side so
        // the room it opens into is always the same one the 2nd wall
        // (below) also opens into, chaining front -> side A -> side B
        // instead of risking a room only reachable through a wall.
        walls.push({ axis: depthAxis, fixedCoord: depthAt(f1), spanA: widthCenter - widthHalf, spanB: widthCenter + widthHalf, doorFrac: randRange(0.18, 0.38) });
        const widthAxis = depthAxis === 'x' ? 'z' : 'x';
        const backLo = Math.min(depthAt(f1), depthAt(1)), backHi = Math.max(depthAt(f1), depthAt(1));
        walls.push({ axis: widthAxis, fixedCoord: widthCenter, spanA: backLo, spanB: backHi, doorFrac: randRange(0.3, 0.7) });
    }
    return { walls };
}

// draws buildFloorLayout's partition walls at one floor's height and
// pushes their collision segments -- every floor now gets its own real,
// independently-registered segments (see buildingWallSegments), not a
// shared layout registered once on the ground floor.
function drawFloorLayout(layoutWalls, floorHeight, mat, yBase, outSegments) {
    const doorInteriorWidth = 1.3;
    for (const w of layoutWalls) {
        const doorCenter = w.spanA + (w.spanB - w.spanA) * w.doorFrac;
        const segs = buildWallWithGaps(w.axis, w.fixedCoord, w.spanA, w.spanB, [{ lo: doorCenter - doorInteriorWidth / 2, hi: doorCenter + doorInteriorWidth / 2 }], floorHeight, mat, yBase);
        outSegments.push(...segs);
    }
}

// footprint minus an arbitrary interior hole, as up to 4 axis-aligned
// rects (a "picture frame" decomposition) -- works whether the hole
// touches 0, 1, or 2 edges of the footprint, not just a corner square.
// Used for both a floor's ceiling (the hole a stair rises through) and
// the floor above it (the hole that stair rises INTO). {x,z,hx,hz}
// matches what overheadCeilings and elevatedPlatforms already expect.
function computeNotchedRects(x, z, hwx, hwz, holeXLo, holeXHi, holeZLo, holeZHi) {
    const fx0 = x - hwx, fx1 = x + hwx, fz0 = z - hwz, fz1 = z + hwz;
    const hx0 = Math.max(fx0, Math.min(holeXLo, holeXHi));
    const hx1 = Math.min(fx1, Math.max(holeXLo, holeXHi));
    const hz0 = Math.max(fz0, Math.min(holeZLo, holeZHi));
    const hz1 = Math.min(fz1, Math.max(holeZLo, holeZHi));
    const rectFrom = (x0, x1, z0, z1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 });
    const rects = [];
    if (hz0 > fz0) rects.push(rectFrom(fx0, fx1, fz0, hz0)); // band below the hole, full width
    if (hz1 < fz1) rects.push(rectFrom(fx0, fx1, hz1, fz1)); // band above the hole, full width
    if (hx0 > fx0) rects.push(rectFrom(fx0, hx0, hz0, hz1)); // left of the hole, hole's own z-band
    if (hx1 < fx1) rects.push(rectFrom(hx1, fx1, hz0, hz1)); // right of the hole, hole's own z-band
    return rects;
}

function addHorizontalPlane(rect, y, mat) {
    if (rect.hx < 0.05 || rect.hz < 0.05) return;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(rect.hx * 2, rect.hz * 2), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(rect.x, y, rect.z);
    scene.add(plane);
}

// ---------- building sites -> cell modules ----------
// see assembleBuildingSites above: a site is a connected group of 1-N
// solid grid cells, and every cell in it becomes its own full-scale
// module (see addBuildingModule below) -- an L/T/U/bar/cluster-shaped
// SITE therefore produces a genuinely that-shaped BUILDING, each arm a
// real full cell wide/deep, not a small wing bolted onto one dominant
// rectangle. addBuildingSite (further down) is what replaces the old
// per-cell addBuilding entry point.

// ?debugFootprints=1 -- one dim rectangle per site cell's full envelope,
// one bright rectangle per actual built module, a distinct color for
// void/courtyard cells. Flown over with freecam (F), this is the literal
// "gray box overhead" test: if the bright shapes still look like a plain
// grid of centered squares, the generator has regressed.
function addDebugRectOutline(cx, cz, hwx, hwz, y, color) {
    const pts = [
        new THREE.Vector3(cx - hwx, y, cz - hwz),
        new THREE.Vector3(cx + hwx, y, cz - hwz),
        new THREE.Vector3(cx + hwx, y, cz + hwz),
        new THREE.Vector3(cx - hwx, y, cz + hwz),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const loop = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(loop);
}

// builds one floor of the core module: exterior (with the street door on
// floor 0, plus an archway toward the wing if it's active this floor),
// a fresh interior partition layout, and -- the one thing that's still
// shared/fixed across every floor, since it's one continuous physical
// shaft -- the stairwell in the same corner every time. Returns this
// floor's own collision segments.
function buildCoreFloor(core, fl, floorCount, floorHeight, door, extMat, shellMat, wingGaps, stairwell) {
    const { cx, cz, hwx, hwz } = core; // no longer assumed square -- see building sites/cell modules
    const y0 = fl * floorHeight;
    // the module's REAL total height -- see remapWallUV/buildWallWithGaps:
    // this floor's wall shows its own true vertical slice of the shared
    // facade texture (which describes the whole building, see
    // makeWindowGridTexture) instead of every floor independently
    // restarting the same squashed 0..1 copy of it.
    const fullHeight = floorCount * floorHeight;
    const segments = [];
    segments.push(...buildExteriorPerimeter(cx, cz, hwx, hwz, y0, floorHeight, door, extMat, wingGaps, fullHeight));
    const { walls } = buildFloorLayout(cx, cz, hwx, hwz, door);
    drawFloorLayout(walls, floorHeight, shellMat, y0, segments);

    if (fl === 0 && dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light2 = new THREE.PointLight(0xffe9b0, 2.2, floorHeight * 2, 2);
        light2.position.set(cx + randRange(-hwx * 0.3, hwx * 0.3), floorHeight * 0.7, cz + randRange(-hwz * 0.3, hwz * 0.3));
        scene.add(light2);
    }

    if (stairwell) {
        const { swZ, swHalf, cornerSignZ, doorX, flightEndX } = stairwell;
        // shaft-closing walls, redrawn (real collision) at every floor now
        segments.push(...buildWallWithGaps('x', doorX, swZ - swHalf, swZ + swHalf, [{ lo: swZ - 0.55, hi: swZ + 0.55 }], floorHeight, shellMat, y0));
        segments.push(...buildWallWithGaps('z', swZ - cornerSignZ * swHalf, Math.min(doorX, flightEndX), Math.max(doorX, flightEndX), [], floorHeight, shellMat, y0));

        const hasStairUp = fl < floorCount - 1;
        // real roof access FROM INSIDE at the top floor -- the stair
        // core is one continuous shaft floor 0 -> floorCount-1 already
        // (hasStairUp above); this is just its last flight, rising from
        // the top floor's own y0 to y0+floorHeight, which is EXACTLY
        // this module's roof deck height (enterHeight === floorCount *
        // floorHeight) -- climbing it steps you straight out onto the
        // already-registered rooftop deck, not into another floor. No
        // longer only reachable by free-climbing from outside.
        const isTopFloor = fl === floorCount - 1;
        const roofHatch = isTopFloor && rng() < 0.55;
        if (fl > 0) {
            // this floor's own walkable surface, notched around the hole
            // the stair below rises into.
            const floorRects = computeNotchedRects(cx, cz, hwx, hwz, doorX, flightEndX, swZ - swHalf, swZ + swHalf);
            for (const r of floorRects) {
                elevatedPlatforms.push({ ...r, y: y0 });
                addHorizontalPlane(r, y0 + 0.02, shellMat);
            }
        }
        if (hasStairUp || roofHatch) {
            addStairFlight('x', doorX, flightEndX, swZ, y0, y0 + floorHeight, { width: swHalf * 1.1 });
            const ceilRects = computeNotchedRects(cx, cz, hwx, hwz, doorX, flightEndX, swZ - swHalf, swZ + swHalf);
            for (const r of ceilRects) {
                overheadCeilings.push({ ...r, y: y0 + floorHeight });
                addHorizontalPlane(r, y0 + floorHeight, shellMat);
            }
        } else {
            overheadCeilings.push({ x: cx, z: cz, hx: hwx, hz: hwz, y: y0 + floorHeight });
            addHorizontalPlane({ x: cx, z: cz, hx: hwx, hz: hwz }, y0 + floorHeight, shellMat);
        }
    } else {
        overheadCeilings.push({ x: cx, z: cz, hx: hwx, hz: hwz, y: y0 + floorHeight });
        addHorizontalPlane({ x: cx, z: cz, hx: hwx, hz: hwz }, y0 + floorHeight, shellMat);
    }

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xffe9b0, fl === 0 ? 3 : 2.4, floorHeight * 2.2, 2);
        light.position.set(cx + randRange(-hwx * 0.25, hwx * 0.25), y0 + floorHeight * (fl === 0 ? 0.35 : 0.6), cz + randRange(-hwz * 0.25, hwz * 0.25));
        scene.add(light);
    }
    if (fl === 0) {
        const floorTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = '#6a5030';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#4a3520';
            for (let i = 0; i < w; i += 10) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        }, 64, 64);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(hwx * 1.9, hwz * 1.9), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(cx, 0.02, cz);
        scene.add(floor);
    }
    return segments;
}

// a real enterable rooftop mechanical room -- a genuine module (its own
// walls/door/floor/ceiling, real collision), not another prop scattered
// on top of the deck like the antenna/tank/AC clutter already there.
// Offset from the deck's own center so it reads as a real penthouse
// addition rather than a centerpiece. Returns its own {yMin,yMax,
// segments} band, meant to be appended to this building's ALREADY-
// registered buildingWallSegments entry (the main per-floor loop that
// set it runs earlier in addBuilding, before the roof/archetype code
// that calls this).
function buildRooftopMechanicalRoom(cx, cz, deckHalf, roofY) {
    const roomHw = Math.max(0.8, Math.min(deckHalf * 0.5, 1.5));
    const roomH = 2.3;
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide });
    const maxOffset = Math.max(0, deckHalf - roomHw - 0.3);
    const rcx = cx + randRange(-maxOffset, maxOffset), rcz = cz + randRange(-maxOffset, maxOffset);
    const door = pick([{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 1, dz: 0 }]);
    const segments = buildExteriorPerimeter(rcx, rcz, roomHw, roomHw, roofY, roomH, door, mat, []);
    overheadCeilings.push({ x: rcx, z: rcz, hx: roomHw, hz: roomHw, y: roofY + roomH });
    addHorizontalPlane({ x: rcx, z: rcz, hx: roomHw, hz: roomHw }, roofY + roomH, mat);
    // real floor plate at deck level, and a couple of interior pipes/junk
    addHorizontalPlane({ x: rcx, z: rcz, hx: roomHw, hz: roomHw }, roofY + 0.02, mat);
    scatterJunk('indoor', rcx, rcz, 1 + Math.floor(rng() * 2), roomHw * 0.6);
    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xdfe8e0, 2, roomH * 2.2, 2);
        light.position.set(rcx, roofY + roomH * 0.6, rcz);
        scene.add(light);
    }
    return { yMin: roofY, yMax: roofY + roomH, segments };
}

// a real walkable bridge/catwalk between two nearby rooftops -- an
// intentional alternate route between buildings, not a crack in the
// maze (see the maze-topology sealing comment near mazeSealWalls: this
// is exactly the kind of "explicit graph connection" that's allowed).
// Deliberately axis-aligned only (the two decks' centers line up on X or
// Z within a small tolerance) so its footprint is a real axis-aligned
// rect matching the walkway exactly -- elevatedPlatforms has no notion
// of a rotated/diagonal walkable strip, and approximating one with a
// bounding box would either leave gaps or claim walkable space where
// there's no actual bridge deck.
function addCatwalk(a, b) {
    const y = (a.y + b.y) / 2;
    const alongX = Math.abs(a.z - b.z) < 0.6; // decks line up on Z -- bridge runs along X
    const width = 1.1;
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.8, metalness: 0.4 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55, metalness: 0.5 });

    // span the actual GAP between the two decks' own edges, not their
    // centers -- using centers here would make the "bridge" overlap deep
    // into both rooftops instead of just crossing the open air between
    // them (caught by a harness check: a real 8-unit center-to-center
    // pair produced a "bridge" reaching 2.5 units into one deck and 2
    // into the other).
    let rect;
    if (alongX) {
        const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
        const lo = left.x + left.hx, hi = right.x - right.hx;
        const len = hi - lo;
        const cz = (a.z + b.z) / 2;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, width), deckMat);
        deck.position.set((lo + hi) / 2, y, cz);
        scene.add(deck);
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.05), railMat);
            rail.position.set((lo + hi) / 2, y + 0.3, cz + side * width / 2);
            scene.add(rail);
        }
        rect = { x: (lo + hi) / 2, z: cz, hx: len / 2, hz: width / 2, y };
    } else {
        const near = a.z < b.z ? a : b, far = a.z < b.z ? b : a;
        const lo = near.z + near.hz, hi = far.z - far.hz;
        const len = hi - lo;
        const cx = (a.x + b.x) / 2;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, len), deckMat);
        deck.position.set(cx, y, (lo + hi) / 2);
        scene.add(deck);
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, len), railMat);
            rail.position.set(cx + side * width / 2, y + 0.3, (lo + hi) / 2);
            scene.add(rail);
        }
        rect = { x: cx, z: (lo + hi) / 2, hx: width / 2, hz: len / 2, y };
    }
    elevatedPlatforms.push(rect);
    if (dynamicLightsRemaining > 0 && rng() < 0.4) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xffcf8a, 1.8, 6, 2);
        light.position.set(rect.x, y + 0.6, rect.z);
        scene.add(light);
    }
}

// scans real rooftop decks (not every elevatedPlatforms entry -- ladder
// rungs/mezzanines/wing floors would produce nonsense pairings) for ones
// close enough, level enough, and axis-aligned enough to bridge. Rare on
// purpose -- most rooftops stay isolated, reached by climbing that one
// building; a catwalk is a deliberate, occasional shortcut, not a grid.
function buildRooftopCatwalks() {
    let built = 0;
    for (let i = 0; i < rooftopDecks.length && built < 40; i++) {
        for (let j = i + 1; j < rooftopDecks.length && built < 40; j++) {
            const a = rooftopDecks[i], b = rooftopDecks[j];
            if (a.buildingKey === b.buildingKey) continue;
            // capped so the catwalk deck (sat at the midpoint height)
            // never sits more than MAX_STEP_HEIGHT (0.65) off of either
            // rooftop's own y -- otherwise stepping from the bridge onto
            // the (slightly higher/lower) deck it's supposed to connect
            // to would need a hop instead of a walk.
            if (Math.abs(a.y - b.y) > 1.2) continue;
            const alignedX = Math.abs(a.z - b.z) < 0.6;
            const alignedZ = Math.abs(a.x - b.x) < 0.6;
            if (!alignedX && !alignedZ) continue;
            const centerDist = alignedX ? Math.abs(a.x - b.x) : Math.abs(a.z - b.z);
            const gap = centerDist - ((alignedX ? a.hx : a.hz) + (alignedX ? b.hx : b.hz));
            if (gap < 0.8 || gap > 5.5) continue; // too close (already touching/overlapping -- no bridge needed) or too far (not a believable span)
            if (rng() > 0.15) continue;
            addCatwalk(a, b);
            built++;
        }
    }
    console.log(`[gen] ${built} rooftop catwalks built (${rooftopDecks.length} candidate rooftop decks)`);
}

// purely cosmetic exterior expression of the stair core -- a thin
// protruding bump on the face nearest the actual interior stairwell
// corner, with a stacked column of window slits, one per floor, reading
// as the real vertical shaft behind it. No collision of its own (it
// rides on the outside of the core's already-registered wall, the same
// way a sign bracket or security camera does); this is about making the
// stair/elevator core LOOK like its own module from outside, not
// changing where the actual climbable stairwell lives.
function addStairTowerExpression(bx, bz, cornerSignX, swZ, enterHeight, hw, floorHeight) {
    const bumpDepth = 0.35, bumpWidth = 1.3;
    const faceX = bx + cornerSignX * hw;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.6, metalness: 0.4 });
    const bump = new THREE.Mesh(new THREE.BoxGeometry(bumpDepth, enterHeight, bumpWidth), mat);
    bump.position.set(faceX + cornerSignX * bumpDepth / 2, enterHeight / 2, swZ);
    scene.add(bump);
    const winMat = new THREE.MeshStandardMaterial({
        color: 0x8adfe0, roughness: 0.3, metalness: 0.1, emissive: 0x113030, emissiveIntensity: 0.4,
    });
    const floorsHere = Math.max(1, Math.round(enterHeight / floorHeight));
    for (let i = 0; i < floorsHere; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.1), winMat);
        win.position.set(faceX + cornerSignX * (bumpDepth + 0.005), (i + 0.5) * floorHeight, swZ);
        win.rotation.y = cornerSignX > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(win);
    }
}

// ~30% of interiors get a raised mezzanine + a straight run of steps --
// real vertical elevation, not just a taller room. Always axis-aligned
// (built along whichever cardinal axis "away from the door" already is)
// so there's no rotation/tilt math to get wrong.
function maybeAddMezzanine(x, z, hw, groundFloorHeight, door) {
    if (rng() > 0.3) return;
    // the room's own roof cap is a real ceiling now (see overheadCeilings
    // in animate()) -- the platform has to leave standing headroom above
    // it or a player up there bumps their head on their own building.
    // Not enough vertical room for that means no mezzanine at all here,
    // rather than one nobody can stand up straight on.
    const maxPlatformY = groundFloorHeight - CONFIG.camera.eyeHeight - 0.3;
    if (maxPlatformY < 0.4) return;
    const awayX = door ? -door.dx : 0;
    const awayZ = door ? -door.dz : -1;
    const axis = awayX !== 0 ? 'x' : 'z';
    const platformY = Math.min(maxPlatformY, groundFloorHeight * 0.5);
    const platformHalf = hw * 0.4;

    const px = x + awayX * (hw - platformHalf - 0.2);
    const pz = z + awayZ * (hw - platformHalf - 0.2);

    const platform = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(platformHalf * 2, 0.12, platformHalf * 2), 0.02),
        new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.85 })
    );
    platform.position.set(px, platformY, pz);
    scene.add(platform);

    // railing on the far edge, so falling off reads as an actual choice
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(
        axis === 'x' ? 0.06 : platformHalf * 2, 0.5, axis === 'x' ? platformHalf * 2 : 0.06
    ), railMat);
    rail.position.set(
        px + (axis === 'x' ? awayX * platformHalf : 0),
        platformY + 0.28,
        pz + (axis === 'z' ? awayZ * platformHalf : 0)
    );
    scene.add(rail);

    // a thin ladder up to the platform edge, mounted facing back toward
    // the room -- used to be a wide box staircase spanning most of the
    // room's width, which read as bulky and (once real step-by-step
    // physics landed) janky to actually climb. A ladder is a fraction of
    // the footprint and climbs through the same auto-step rule every
    // other prop in this maze already climbs by.
    const ladderX = axis === 'x' ? px - awayX * platformHalf : x;
    const ladderZ = axis === 'x' ? z : pz - awayZ * platformHalf;
    // faces back toward the room, i.e. the OPPOSITE of "away" (see
    // outwardRotationY) -- this dropped the z-axis negation before,
    // the same recurring bug: north/south platforms had their ladder
    // facing further away from the room instead of back into it.
    const ladderRotY = outwardRotationY(-awayX, -awayZ);
    addLadder(ladderX, ladderZ, ladderRotY, 0, platformY);

    elevatedPlatforms.push({ x: px, z: pz, hx: platformHalf, hz: platformHalf, y: platformY });
}

// a decorative elevator bank -- doors, a lit floor-indicator readout, a
// call button -- as an alternate flavor of vertical circulation
// alongside the mezzanine stairs. Deliberately not a functional ride (a
// simulated, timed moving platform is a whole different system); this
// reads as "this building also has an elevator," the same way a real
// lobby does, without pretending to carry you somewhere the stairs
// don't already reach. Independent of maybeAddMezzanine -- a building
// can have neither, either, or both.
function maybeAddElevator(x, z, hw, groundFloorHeight, door) {
    if (rng() > 0.18) return;
    const wallDirs = [{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 1, dz: 0 }]
        .filter(d => !door || d.dx !== door.dx || d.dz !== door.dz); // any wall but the one with the actual doorway
    const w = pick(wallDirs);
    const cabW = 1.1, cabH = Math.min(2.4, groundFloorHeight - 0.3);
    if (cabH < 1.2) return; // too short a room for this to read as anything but a closet

    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
    const frame = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(cabW + 0.2, cabH + 0.2, 0.12), 0.01), frameMat);
    frame.position.set(0, cabH / 2, 0.06);
    g.add(frame);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a8068, roughness: 0.4, metalness: 0.7 });
    for (const side of [-1, 1]) {
        const cabDoor = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(cabW / 2 - 0.02, cabH - 0.1, 0.06), 0.008), doorMat);
        cabDoor.position.set(side * (cabW / 4), (cabH - 0.1) / 2, 0.1);
        g.add(cabDoor);
    }

    // floor-indicator readout above the doors -- static, like the doors
    // themselves; this elevator isn't going anywhere, it's furniture
    const floorNum = 1 + Math.floor(rng() * 12);
    const indicatorTex = makePixelTexture((ctx, iw, ih) => {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, iw, ih);
        ctx.fillStyle = '#ff3a1e';
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(String(floorNum), iw / 2, ih / 2 + 7);
    }, 28, 28);
    const indicator = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshBasicMaterial({ map: indicatorTex })
    );
    indicator.position.set(0, cabH + 0.05, 0.13);
    g.add(indicator);

    const buttonMat = new THREE.MeshStandardMaterial({ color: 0xd8b820, emissive: 0x5a4200, roughness: 0.4 });
    const button = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), 0.004), buttonMat);
    button.rotation.x = Math.PI / 2;
    button.position.set(cabW / 2 + 0.12, 1.1, 0.1);
    g.add(button);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xff3a1e, 0.5, 1, 2);
        light.position.set(0, cabH + 0.05, 0.2);
        g.add(light);
    }

    // face away from the wall it's mounted on -- outward normal is -w
    // (see outwardRotationY). Same missing z-negation bug as the other
    // independently hand-rolled cardinal rotations in this file: north/
    // south walls had this elevator facing INTO the wall instead of out
    // into the room; east/west were unaffected (z-term is 0 there).
    g.rotation.y = outwardRotationY(-w.dx, -w.dz);
    g.position.set(x + w.dx * (hw - 0.05), 0, z + w.dz * (hw - 0.05));
    scene.add(g);
}

// ---------- generalized climbable stairs ----------
// the exact same primitive maybeAddMezzanine uses above (push a rampRun,
// groundHeightAt does the rest every frame) pulled out into a reusable
// builder -- so exterior fire escapes and the tall vertical-layer
// staircases climb exactly like an interior mezzanine already does,
// real elevation and real collision, not a new physics system.
function addStairFlight(axis, along0, along1, cross, y0, y1, opts = {}) {
    const width = opts.width ?? 0.9;
    const along = along1 - along0, rise = y1 - y0;
    const n = Math.max(3, Math.round(Math.abs(rise) / 0.28));
    const stepMat = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x2e2a26, roughness: 0.85, metalness: 0.35 });
    for (let i = 0; i < n; i++) {
        const tMid = (i + 0.5) / n;
        const posAlong = along0 + along * tMid;
        const posY = y0 + rise * tMid;
        const stepDepth = Math.abs(along) / n;
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(axis === 'x' ? stepDepth * 1.05 : width, 0.1, axis === 'x' ? width : stepDepth * 1.05),
            stepMat
        );
        step.position.set(axis === 'x' ? posAlong : cross, posY, axis === 'x' ? cross : posAlong);
        scene.add(step);
    }
    // railings both sides -- also doubles as the visual tell that this
    // one, unlike a decorative-only fire escape, is meant to be climbed
    const railMat = new THREE.MeshStandardMaterial({ color: opts.railColor ?? 0x1c1c1c, roughness: 0.55, metalness: 0.5 });
    for (const side of [-1, 1]) {
        const rc = cross + side * (width / 2 + 0.03);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(
            axis === 'x' ? Math.abs(along) * 1.03 : 0.05, 0.45, axis === 'x' ? 0.05 : Math.abs(along) * 1.03
        ), railMat);
        rail.position.set(
            axis === 'x' ? along0 + along / 2 : rc, y0 + rise / 2 + 0.28, axis === 'x' ? rc : along0 + along / 2
        );
        scene.add(rail);
    }
    rampRuns.push({ axis, from: along0, to: along1, fixedCoord: cross, halfWidth: width / 2 + 0.15, y0, y1 });
}

function addLandingPlatform(x, z, halfW, y, opts = {}) {
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(halfW * 2, 0.1, halfW * 2),
        new THREE.MeshStandardMaterial({ color: opts.color ?? 0x352f28, roughness: 0.85, metalness: 0.3 })
    );
    platform.position.set(x, y, z);
    scene.add(platform);
    elevatedPlatforms.push({ x, z, hx: halfW, hz: halfW, y });
}

// a real, climbable fire escape: a switchback of flights zigzagging up
// the outside of a wall face, functionally identical to the interior
// mezzanine stairs above -- walk onto it and groundHeightAt actually
// lifts you. (x, z, rotY) is the same wall-face anchor point the
// decorative GLTF model is placed at; this builds alongside it rather
// than replacing it, so the detailed model still reads as the fire
// escape's silhouette while these plain switchback treads are what
// you're actually standing on (they won't pixel-align, and that's a
// deliberate tradeoff -- this whole aesthetic is already "crude on
// purpose" everywhere else).
function buildFireEscapeStair(x, z, rotY, topY) {
    const nx = Math.round(Math.sin(rotY)), nz = -Math.round(Math.cos(rotY));
    const axis = nx === 0 ? 'x' : 'z';
    let along = axis === 'x' ? x + nx * 0.7 : z + nz * 0.7;
    const cross = axis === 'x' ? z + nz * 0.7 : x + nx * 0.7;
    const flightLen = 1.7, risePerFlight = 2.4;
    // the real modular_fire_escape.gltf placed alongside this (same x/z/
    // rotY) is one fixed unit, not an infinitely tall repeating structure
    // -- its own platforms top out a bit above 5 units. Collision used to
    // climb 2-3x higher than the model actually reaches, so most of a
    // tall building's "fire escape" was an invisible ramp with no fire
    // escape left under your feet -- exactly what made it feel broken.
    // Capping it here means the crude switchback treads stay inside the
    // model's real visible footprint.
    const modelTopY = 5.4;
    const clampedTop = Math.min(topY, modelTopY);
    let y = 0, dir = 1;
    let lastWx = along, lastWz = cross; // tracks the final landing so the bridging ladder below picks up from where the stairs actually end, not the original wall anchor
    const landings = []; // {y} -- returned so a balcony can anchor to a real, reachable height
    while (y < clampedTop) {
        const y1 = Math.min(clampedTop, y + risePerFlight);
        const along1 = along + dir * flightLen;
        addStairFlight(axis, along, along1, cross, y, y1);
        const wx = axis === 'x' ? along1 : cross, wz = axis === 'x' ? cross : along1;
        addLandingPlatform(wx, wz, 0.65, y1);
        landings.push({ y: y1 });
        lastWx = wx; lastWz = wz;
        y = y1; along = along1; dir *= -1;
    }
    // anything taller than the model itself (mainly warehouses, short
    // enough their own roof is still in reach) bridges the remaining gap
    // with a real ladder instead of pretending the stairs keep going --
    // also doubles as the model's own built-in drop-ladder actually doing
    // something, not just sitting there as decoration. Anchored to the
    // stairs' actual last landing (which has drifted sideways by however
    // many switchback flights it took to get there), not the original
    // wall-mount point -- a ladder rooted back at the start would be
    // stranded off to the side of wherever the stairs actually left you.
    if (topY > clampedTop + 0.3) {
        // lastWx/lastWz is already out past the wall (the landing's own
        // stand-off) -- a small climbStandoff here, not the usual
        // against-a-wall default, so the ladder rises right from the
        // landing instead of drifting even further out.
        addLadder(lastWx, lastWz, rotY, clampedTop, topY, { climbStandoff: 0.15 });
    }
    return landings;
}

// a real, climbable ladder: thin rails + rungs mounted on a wall face,
// climbed the exact same way stacked crates already are -- a tight
// column of shallow elevatedPlatforms landings, each within auto-step
// range of the last, so walking up to the base and holding forward
// climbs you all the way to the top one rung at a time. No new physics
// needed, just the existing "step up onto a short prop" rule applied
// vertically instead of onto a single crate. (x, z, rotY) is the same
// wall-anchor convention every other wall-mounted prop here uses.
//
// The actual walkable column is kept well clear of the wall itself --
// resolveCollisions won't let the player's center get closer than
// PLAYER_RADIUS + WALL_THICKNESS (~0.44) to a wall segment, so a climb
// point sitting flush against the wall (like the visual rungs are) could
// never actually be reached; the player would be shoved back out before
// ever standing in the tiny box groundHeightAt needs them in. climbStandoff
// defaults well past that, and the box itself is generous, not the tight
// footprint a purely visual prop would need.
function addLadder(x, z, rotY, y0, y1, opts = {}) {
    const standoff = opts.standoff ?? 0.22; // visual only -- how flush the rails/rungs read against the wall
    const climbStandoff = opts.climbStandoff ?? 0.55; // the real, walkable column
    const climbHalf = opts.climbHalf ?? 0.4;
    const width = opts.width ?? 0.42;
    const rise = y1 - y0;
    if (rise <= 0.05) return;
    const g = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x2a2a28, roughness: 0.6, metalness: 0.55 });
    const railR = 0.025;
    for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(railR, railR, rise, 6), 0.006),
            railMat
        );
        rail.position.set(side * width / 2, rise / 2, standoff);
        g.add(rail);
    }
    const rungGap = 0.3;
    const rungCount = Math.max(2, Math.round(rise / rungGap));
    for (let i = 0; i <= rungCount; i++) {
        const ry = (rise * i) / rungCount;
        const rung = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(railR * 0.8, railR * 0.8, width, 6), 0.004),
            railMat
        );
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, ry, standoff);
        g.add(rung);
    }
    g.rotation.y = rotY;
    g.position.set(x, y0, z);
    scene.add(g);

    // the actual climb: a tight stack of shallow floor candidates at the
    // ladder's (generously offset) standoff point, spaced well under the
    // auto-step limit (MAX_STEP_HEIGHT, defined later in this file as
    // 0.65 -- kept as a literal here since this runs long before that
    // const exists).
    const climbX = x + Math.sin(rotY) * climbStandoff;
    const climbZ = z + Math.cos(rotY) * climbStandoff;
    const stepGap = 0.48;
    const steps = Math.max(1, Math.ceil(rise / stepGap));
    for (let i = 1; i <= steps; i++) {
        const y = y0 + (rise * i) / steps;
        elevatedPlatforms.push({ x: climbX, z: climbZ, hx: climbHalf, hz: climbHalf, y });
    }
}

// a balcony jutting off a facade -- a real floor (registered the same
// way a fire-escape landing is), a railing on the 3 outward sides, and
// two diagonal braces underneath reading as the reason it doesn't just
// fall off the wall. (x, z, rotY) is a wall-anchor point same as every
// other wall-mounted prop here; y is the platform's own height.
function addBalcony(x, y, z, rotY, maintenance = 0.5) {
    const depth = randRange(0.9, 1.3), width = randRange(1.6, 2.4);
    const g = new THREE.Group();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.85 });
    const floor = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(width, 0.1, depth), 0.02), floorMat);
    floor.position.set(0, 0, depth / 2);
    g.add(floor);

    const braceMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.6 });
    for (const side of [-1, 1]) {
        const brace = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(depth, depth * 0.6), 5), 0.004),
            braceMat
        );
        brace.rotation.x = Math.atan2(depth, depth * 0.6);
        brace.position.set(side * width * 0.42, -depth * 0.28, depth / 2);
        g.add(brace);
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.6, metalness: 0.5 });
    const railH = 0.55;
    const railFar = new THREE.Mesh(new THREE.BoxGeometry(width, railH, 0.04), railMat);
    railFar.position.set(0, railH / 2, depth);
    g.add(railFar);
    for (const side of [-1, 1]) {
        const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.04, railH, depth), railMat);
        railSide.position.set(side * width / 2, railH / 2, depth / 2);
        g.add(railSide);
    }

    // a planter box, more likely the better-kept this building rolled --
    // a neglected one just gets the bare railing.
    if (rng() < 0.25 + maintenance * 0.35) {
        const planter = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(width * 0.5, 0.18, depth * 0.3), 0.015),
            new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 })
        );
        planter.position.set(randRange(-width * 0.15, width * 0.15), 0.14, depth * 0.7);
        g.add(planter);
        const leafTex = makePixelTexture((ctx, w, h) => {
            ctx.fillStyle = rng() < 0.6 ? '#2a5a2a' : '#5a4a20';
            ctx.fillRect(0, 0, w, h);
        }, 8, 8);
        const leaves = new THREE.Mesh(
            new THREE.SphereGeometry(width * 0.16, 6, 5),
            new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.9 })
        );
        leaves.position.set(planter.position.x, 0.32, depth * 0.7);
        g.add(leaves);
    }

    g.rotation.y = rotY;
    g.position.set(x, y, z);
    scene.add(g);

    const wx = x + Math.sin(rotY) * (depth / 2), wz = z + Math.cos(rotY) * (depth / 2);
    elevatedPlatforms.push({ x: wx, z: wz, hx: width / 2 * 0.9, hz: depth / 2 * 0.9, y });
}

// the one true vertical secret: a real, climbable staircase that just
// keeps going, all the way up into the white-fog "heaven" band
// (LAYER_Y.heavenBase is only 20 -- this clears it by 7x and keeps
// climbing). One exists in the entire map, planted on a reserved plaza
// cell (real open room on every side, unlike a boxed-in dead end), with
// nothing marking it from a distance -- it has to be stumbled onto and
// then actually committed to. Built from the exact same primitives as
// every other stair here (addStairFlight/addLandingPlatform), just run
// for dozens of flights instead of 2-3.
//
// The path is a genuine random walk around a central mast, not a fixed
// repeating shape -- every flight continues straight, turns left, or
// turns right (never doubles straight back on itself), weighted to
// wander back toward a comfortable radius band whenever it's drifted
// too close to the mast or too far from it, so the whole thing still
// generally wraps the mast (and whatever real buildings happen to be
// nearby) without ever tracing the same clean square twice.
// ascent palette: one continuous gradient from grimy industrial at the
// bottom to pale/warm/gold near the top -- NOT a hue cycle. `t` is
// normalized ascent (y / topHeight); every material/light call below
// samples the same gradient at its own height, so the whole structure
// reads as one architectural progression, not a rainbow.
const HEAVEN_BOTTOM_STEP = new THREE.Color(0x3a3228), HEAVEN_TOP_STEP = new THREE.Color(0xdcd2ba);
const HEAVEN_BOTTOM_RAIL = new THREE.Color(0x161616), HEAVEN_TOP_RAIL = new THREE.Color(0xe0c078);
const HEAVEN_BOTTOM_LIGHT = new THREE.Color(0xaab0b8), HEAVEN_TOP_LIGHT = new THREE.Color(0xfff2d0);
function heavenAscentColors(t) {
    return {
        step: HEAVEN_BOTTOM_STEP.clone().lerp(HEAVEN_TOP_STEP, t).getHex(),
        rail: HEAVEN_BOTTOM_RAIL.clone().lerp(HEAVEN_TOP_RAIL, t).getHex(),
        light: HEAVEN_BOTTOM_LIGHT.clone().lerp(HEAVEN_TOP_LIGHT, t).getHex(),
    };
}

// a real arch a climber walks straight through -- opening centered
// exactly on the landing it's built onto, so it can only ever frame the
// route, never block it. Two posts plus a lintel; more refined (thinner,
// paler) the higher it sits.
function addAscentArch(x, z, y, t) {
    const colors = heavenAscentColors(t);
    const width = 1.6, postH = 2.3, postR = THREE.MathUtils.lerp(0.09, 0.05, t);
    const mat = new THREE.MeshStandardMaterial({
        color: colors.rail, roughness: THREE.MathUtils.lerp(0.7, 0.25, t), metalness: THREE.MathUtils.lerp(0.5, 0.75, t),
    });
    for (const side of [-1, 1]) {
        const post = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(postR, postR, postH, 8), 0.01), mat);
        post.position.set(x + side * width / 2, y + postH / 2, z);
        scene.add(post);
    }
    const lintel = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(width + postR * 2, postR * 2, postR * 2), 0.005), mat);
    lintel.position.set(x, y + postH, z);
    scene.add(lintel);
    if (t > 0.5 && dynamicLightsRemaining > 0) {
        // a hanging light under the arch, higher up only -- the
        // "occasional larger rest platform" band already reads busy
        // enough lower down without one under every arch too.
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(colors.light, 3, 6, 2);
        light.position.set(x, y + postH - 0.3, z);
        scene.add(light);
    }
}

// the one true vertical secret: a real, climbable staircase that just
// keeps going, all the way up into the white-fog "heaven" band
// (LAYER_Y.heavenBase is only 20 -- this clears it by 7x and keeps
// climbing). One exists in the entire map, planted on a reserved plaza
// cell (real open room on every side, unlike a boxed-in dead end), with
// nothing marking it from a distance -- it has to be stumbled onto and
// then actually committed to. Built from the exact same primitives as
// every other stair here (addStairFlight/addLandingPlatform), just run
// for dozens of flights instead of 2-3.
//
// The path is a genuine random walk around a central mast, not a fixed
// repeating shape -- every flight continues straight, turns left, or
// turns right (never doubles straight back on itself), weighted to
// wander back toward a comfortable radius band whenever it's drifted
// too close to the mast or too far from it, so the whole thing still
// generally wraps the mast (and whatever real buildings happen to be
// nearby) without ever tracing the same clean square twice.
//
// The climb itself changes character as it goes: grimy industrial at
// the bottom (dark battered steel, utility-white light), continuously
// warmer/paler toward pale gold near the top, with occasional real
// rest/observation landings (not just identical turn squares) and a
// couple of walk-through arches -- an architectural ascent, not a
// palette swap.
function buildStairwayToHeaven(cx, cz) {
    const topHeight = 150;
    const minRadius = 1.5, maxRadius = 3.4;

    const mastMat = new THREE.MeshStandardMaterial({ color: 0x24221e, roughness: 0.5, metalness: 0.65 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, topHeight, 8), mastMat);
    mast.position.set(cx, topHeight / 2, cz);
    scene.add(mast);

    // a real cable run and a couple of graffiti tags near the base --
    // the bottom of the climb should still feel like it belongs to the
    // grimy city it rises out of.
    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const baseLight = new THREE.PointLight(0xaab0b8, 2.5, 6, 2);
        baseLight.position.set(cx, 2.2, cz);
        scene.add(baseLight);
    }
    addGraffitiTag(cx + minRadius * 0.7, 1.2, cz + minRadius * 0.7, randRange(0, Math.PI * 2));

    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z
    let dirIdx = Math.floor(rng() * 4);
    let px = cx + dirs[dirIdx][0] * randRange(minRadius, maxRadius);
    let pz = cz + dirs[dirIdx][1] * randRange(minRadius, maxRadius);
    let y = 0;
    let lastX = px, lastZ = pz, lastLandingHalf = 0.75;
    let archesBuilt = 0;
    while (y < topHeight) {
        const segLen = randRange(1.6, 3.2);
        const risePerSide = randRange(2.4, 3.4);
        const [dx, dz] = dirs[dirIdx];
        const nx = px + dx * segLen, nz = pz + dz * segLen;
        const y1 = Math.min(topHeight, y + risePerSide);
        const tMid = ((y + y1) / 2) / topHeight;
        const colors = heavenAscentColors(tMid);
        if (dx !== 0) {
            addStairFlight('x', px, nx, pz, y, y1, { width: 1.0, color: colors.step, railColor: colors.rail });
        } else {
            addStairFlight('z', pz, nz, px, y, y1, { width: 1.0, color: colors.step, railColor: colors.rail });
        }

        // occasional real rest/observation landing -- substantially
        // bigger than the usual turn square, more likely the higher the
        // climb has already gone (the view earns the pause). Still
        // exactly where the flight actually ends, same as every other
        // landing here -- bigger, never offset.
        const isRestLanding = rng() < 0.1 + tMid * 0.22;
        const landingHalf = isRestLanding ? randRange(1.6, 2.3) : 0.75;
        addLandingPlatform(nx, nz, landingHalf, y1, { color: colors.step });
        lastLandingHalf = landingHalf;

        // decoration lives on the landing's outer edge (away from the
        // mast), never the walkable center the flight/next flight
        // actually connects through -- it can dress the route, it can
        // never be in it.
        const outDirX = Math.sign(nx - cx) || 1, outDirZ = Math.sign(nz - cz) || 1;
        const decorX = nx + outDirX * landingHalf * 0.65, decorZ = nz + outDirZ * landingHalf * 0.65;
        if (tMid < 0.3 && rng() < 0.35) {
            addGraffitiTag(decorX, y1 + 0.9, decorZ, randRange(0, Math.PI * 2));
        } else if (tMid > 0.35 && isRestLanding) {
            // a small planter box -- lighter metals/stone and real
            // greenery the higher this goes, same idea as a real
            // elevated garden terrace.
            const planter = new THREE.Mesh(
                jitterGeometry(new THREE.BoxGeometry(0.5, 0.35, 0.5), 0.03),
                new THREE.MeshStandardMaterial({ color: colors.step, roughness: 0.8 })
            );
            planter.position.set(decorX, y1 + 0.18, decorZ);
            scene.add(planter);
            const bush = new THREE.Mesh(
                new THREE.SphereGeometry(0.28, 6, 5),
                new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 0.9 })
            );
            bush.position.set(decorX, y1 + 0.5, decorZ);
            scene.add(bush);
        }
        if (isRestLanding) {
            // fabric banner between the landing and the mast -- reads as
            // ceremonial/architectural higher up, purely decorative,
            // hung well above head height so it never reads as a wall.
            const banner = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 1.4),
                new THREE.MeshStandardMaterial({ color: colors.rail, roughness: 0.6, side: THREE.DoubleSide })
            );
            banner.position.set((nx + cx) / 2, y1 + 2.6, (nz + cz) / 2);
            banner.rotation.y = Math.atan2(nx - cx, nz - cz);
            scene.add(banner);
            if (dynamicLightsRemaining > 0) {
                dynamicLightsRemaining--;
                const light = new THREE.PointLight(colors.light, 2 + tMid * 2.5, 8, 2);
                light.position.set(nx, y1 + 1.6, nz);
                scene.add(light);
            }
        }

        // two walk-through arches on the climb -- right at the
        // "heaven" threshold, and again nearing the very top -- built
        // ON the landing so their opening is centered on the route by
        // construction, not just placed nearby.
        const crossedHeaven = y < LAYER_Y.heavenBase && y1 >= LAYER_Y.heavenBase;
        const nearTop = y1 >= topHeight * 0.92 && archesBuilt < 2;
        if ((crossedHeaven || nearTop) && archesBuilt < 2) {
            addAscentArch(nx, nz, y1, tMid);
            archesBuilt++;
        }

        px = nx; pz = nz; y = y1;
        lastX = px; lastZ = pz;

        // next direction: anything but reversing straight back over the
        // flight just built, weighted toward whichever options keep the
        // path inside the radius band -- soft, not absolute, so it still
        // reads as a real wander instead of snapping to a perfect ring.
        const reverseIdx = (dirIdx + 2) % 4;
        const candidates = dirs.map((d, i) => i).filter(i => i !== reverseIdx);
        const weights = candidates.map(i => {
            const [cdx, cdz] = dirs[i];
            const tx = px + cdx * segLen, tz = pz + cdz * segLen;
            const dist = Math.hypot(tx - cx, tz - cz);
            const penalty = dist < minRadius ? (minRadius - dist) : dist > maxRadius ? (dist - maxRadius) : 0;
            return Math.max(0.2, 1 - penalty * 0.8);
        });
        const total = weights.reduce((a, b) => a + b, 0);
        let r = rng() * total;
        dirIdx = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0) { dirIdx = candidates[i]; break; }
        }
    }

    // the payoff -- a real light and a real sign, so finding this and
    // actually climbing all the way up gets you something at the top,
    // not just a ledge that stops. Pale/gold/luminous, matching the top
    // of the ascent gradient rather than a flat white.
    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xfff2d0, 5, 40, 2);
        light.position.set(lastX, topHeight + 1.5, lastZ);
        scene.add(light);
    }
    const signRotY = Math.atan2(lastX - cx, lastZ - cz) + Math.PI; // faces back toward the mast, readable standing on the top landing
    addSign(lastX, topHeight + 1.6, lastZ, signRotY, 'THE TOP', 'nothing up here but you', 0xfff2d0, false);
}

// ---------- facade surfaces: real, occupancy-tracked wall segments ----------
// replaces "4 imaginary faces, place a sign dead-center" -- which is
// exactly why 2-3 signs on one wall used to visibly stack: they were all
// mounted at the SAME point, only offset in height. Every sign now
// reserves the u (tangential) x v (vertical) rectangle it actually
// occupies before the next placement on that same wall is even tried.
// persistent -- every real exterior wall in the city becomes exactly one
// of these, pushed to buildingFacades (see addBuildingModule) whether or
// not anything ever gets mounted on it. Every wall-mounted system --
// signs, posters, fire escapes, and eventually windows/pipes/awnings/
// graffiti (see the occupancy work in later phases) -- reserves space on
// THIS shared object instead of privately deciding a facade "happened"
// only when it personally needed one.
let nextFacadeId = 0;
function makeFacade(rect, dx, dz, yMin, yMax, door, exposure = 'street', moduleKey = null) {
    const axisIsX = dz !== 0; // wall runs along the x axis (a north/south face)
    const half = axisIsX ? rect.hwx : rect.hwz;
    const rotY = outwardRotationY(dx, dz);
    const cx = rect.cx + dx * (rect.hwx + 0.03), cz = rect.cz + dz * (rect.hwz + 0.03);
    const isDoorWall = door && door.dx === dx && door.dz === dz;
    return {
        id: nextFacadeId++,
        moduleKey, // "row,col" of the module this wall belongs to -- see buildingFacades consumers that need to find a specific building's specific wall (e.g. the forced "signal" sign)
        dx, dz, cx, cz, rotY, axisIsX, half, length: half * 2,
        yMin, yMax,
        normalX: dx, normalZ: dz, // see outwardRotationY/pointOnFacade -- the canonical outward direction
        tangentX: axisIsX ? 1 : 0, tangentZ: axisIsX ? 0 : 1,
        exposure, // 'street' (this module's own perimeter) or 'setback' (exposed by a shorter same-site neighbor, see addBuildingModule)
        occupied: isDoorWall ? [{ type: 'door', uMin: -0.85, uMax: 0.85, vMin: 0, vMax: 2.4 }] : [],
        projections: [], // world-space projecting volumes reserved on this facade (blade signs, awnings, ...) -- see phase 6
    };
}

// occupancy classes -- what a facade reservation is FOR decides what it
// can coexist with, not just whether its rectangle happens to overlap
// another one. A dense, messy wall is the goal (see phase 5 commit) --
// this is what keeps "messy" from meaning "physically interpenetrated":
//   structural (door, fire escape) -- blocks everything, blocked by
//     nothing (nothing gets to overlap a doorway or a fire escape)
//   sign / poster / photo / terminal -- a flat mounted panel; blocks
//     other panels and major hardware, but not overlays
//   hardware (camera, pipe, awning, balcony) -- real physical fixtures;
//     block each other and panels, but not overlays
//   overlay (graffiti, ivy, flyers, stickers) -- surface treatment, not
//     volume. Never blocks anything, and is itself only blocked by
//     structural (nothing paints graffiti across a doorway) -- a flyer
//     taped over old graffiti, ivy climbing past a pipe strap, is
//     exactly the accumulated-mess look this city wants.
const FACADE_CLASS = {
    door: 'structural', fireEscape: 'structural',
    sign: 'panel', poster: 'panel', photo: 'panel', terminal: 'panel',
    camera: 'hardware', pipe: 'hardware', awning: 'hardware', balcony: 'hardware',
    flyer: 'overlay', graffiti: 'overlay', ivy: 'overlay', sticker: 'overlay',
};
function facadeBlocks(typeA, typeB) {
    const a = FACADE_CLASS[typeA] || typeA, b = FACADE_CLASS[typeB] || typeB;
    if (a === 'structural' || b === 'structural') return true;
    if (a === 'overlay' || b === 'overlay') return false;
    return true; // panel-panel, panel-hardware, hardware-hardware all genuinely compete for the same wall space
}
function facadeFits(facade, type, uMin, uMax, vMin, vMax, padding) {
    if (uMin < -facade.half || uMax > facade.half) return false;
    if (vMin < facade.yMin - 0.001 || vMax > facade.yMax + 0.001) return false;
    for (const r of facade.occupied) {
        if (!facadeBlocks(type, r.type)) continue;
        if (uMin - padding < r.uMax && r.uMin < uMax + padding && vMin < r.vMax && vMax > r.vMin) return false;
    }
    return true;
}
function facadeReserve(facade, type, uMin, uMax, vMin, vMax) { facade.occupied.push({ type, uMin, uMax, vMin, vMax }); }

// the generic decor-placement primitive -- tries `attempts` random
// (u,v) rectangles of `type` sized width x height within the vertical
// band [vMin,vMax] (clamped to the facade's own real yMin/yMax, same
// "don't expand past real geometry" rule the sign-bounds fix uses),
// reserves and returns the first that fits, or null if none did in
// `attempts` tries (or the type's real height doesn't fit this facade's
// real height at all). Callers should treat null as "skip this
// decoration on this facade", exactly like placeSignsOnFacade already
// does for signs -- retaining density means trying the next facade or
// the next decoration roll, not forcing a fit that isn't there.
function findFreeFacadeRect(facade, type, width, height, vMin, vMax, attempts = 6, padding = 0.15) {
    const halfW = width / 2, halfH = height / 2;
    if (facade.half * 2 < width) return null;
    const loY = Math.max(vMin, facade.yMin + halfH), hiY = Math.min(vMax, facade.yMax - halfH);
    if (loY > hiY) return null;
    for (let i = 0; i < attempts; i++) {
        const u = randRange(-facade.half + halfW, facade.half - halfW);
        const v = randRange(loY, hiY);
        if (facadeFits(facade, type, u - halfW, u + halfW, v - halfH, v + halfH, padding)) {
            facadeReserve(facade, type, u - halfW, u + halfW, v - halfH, v + halfH);
            return { u, v };
        }
    }
    return null;
}

// how far a sign's bottom edge must clear the ground/sidewalk (an
// aesthetic choice -- keeps signs from reading as eye-level clutter
// beside the door -- NOT a function of floorHeight; that conflation is
// exactly what let signs float above a one-floor building's own roof,
// see the note on placeSignsOnFacade below) and how far its top edge
// must clear the roofline.
const SIGN_BOTTOM_CLEARANCE = 2.0;
const SIGN_TOP_MARGIN = 0.3;

// addSign builds a PROJECTING/BLADE sign -- a wall plate, an arm running
// outward, and a panel mounted past the arm's tip so the panel's own
// "width" dimension extends further OUTWARD still (see addSign: the
// panel is rotated 90 degrees off the wall so it reads to someone
// walking the sidewalk, not standing dead-on in front of it). Its real
// facade footprint (how much WALL frontage it actually consumes) is just
// the small mounting plate; its real bulk (armLength + width) sticks out
// into the alley, not sideways along the wall. Treating the whole
// panel width as facade-tangent occupancy (the old behavior) reserved
// the wrong axis entirely -- a wide sign wrongly ate a wide horizontal
// slice of WALL, while the actual alley-projecting arm was never
// checked against anything.
const SIGN_WALL_MOUNT_WIDTH = 0.5;

// a sign's real, final dimensions, decided BEFORE it's placed anywhere --
// shape/aspect first, width/height/armLength together as one linked
// spec, never independently-rolled numbers. Placement (placeSignsOnFacade)
// then reserves exactly this footprint -- both the small facade mount AND
// the real world-space alley projection -- and addSign is handed the
// same spec so the mesh it builds can never end up a different size (or
// project a different depth) than what was reserved.
function createSignSpec() {
    const shape = pick(SIGN_SHAPES);
    const width = randRange(1.1, 2.6);
    const height = width * (shape.h / shape.w);
    const armLength = randRange(0.55, 1.0);
    return {
        shape, width, height, armLength,
        wallFootprintWidth: SIGN_WALL_MOUNT_WIDTH, // real facade (u-axis) occupancy
        projectionDepth: armLength + width, // real world-space (outward) occupancy -- see addSign's panel layout
    };
}

// tries `count` signs on one facade. Each one rolls its own real spec
// (shape/width/height, see createSignSpec) FIRST, then searches for a
// free spot that actually fits THAT height -- not a fixed 0.9-1.5 band
// picked independently of the sign's real (possibly portrait, possibly
// >1 unit taller than that) aspect ratio. The old flow reserved a band
// sized by guesswork and only afterward asked addSign to pick a shape,
// so the reserved occupancy and the actual rendered mesh routinely
// disagreed -- occupancy said "empty", the real mesh said otherwise.
//
// Vertical bounds are derived from the facade's own real yMin/yMax, not
// from floorHeight -- a one-floor building (height === floorHeight) used
// to compute a minimum band starting at floorHeight+0.3, i.e. already
// above its own roof, then place signs there anyway. Here the sign's
// center is only ever chosen inside [yMin+bottomClearance+halfH,
// yMax-topMargin-halfH]; if that range is inverted for this sign's real
// height, the sign genuinely does not fit THIS facade, full stop -- it
// is skipped, never pushed above the roof or below the ground to make it
// fit anyway. Returns how many actually landed.
function placeSignsOnFacade(facade, count, row) {
    let placed = 0;
    for (let i = 0; i < count; i++) {
        let chosen = null;
        for (let tries = 0; tries < 10; tries++) {
            const spec = createSignSpec();
            const halfMount = spec.wallFootprintWidth / 2, halfH = spec.height / 2;
            if (facade.half * 2 < spec.wallFootprintWidth + 0.3) continue; // this wall can't fit even the small mount plate
            const minCenterY = facade.yMin + SIGN_BOTTOM_CLEARANCE + halfH;
            const maxCenterY = facade.yMax - SIGN_TOP_MARGIN - halfH;
            if (minCenterY > maxCenterY) continue; // this sign's real height doesn't fit this facade at all -- not this wall's problem to solve by floating outside it
            const centerY = randRange(minCenterY, maxCenterY);
            const u = randRange(-facade.half + halfMount, facade.half - halfMount);
            if (!facadeFits(facade, 'sign', u - halfMount, u + halfMount, centerY - halfH, centerY + halfH, 0.3)) continue;
            // the real bulk of a blade sign is its outward projection
            // (armLength+width), not its facade footprint -- checked in
            // WORLD SPACE (see exteriorDecorationVolumes) since a
            // perpendicular facade at a nearby corner could be about to
            // push something into this exact same alley volume without
            // this facade's own u/v occupancy ever knowing.
            const box = makeProjectionBox(facade, u, centerY - halfH, spec.height, spec.projectionDepth, halfMount + 0.15);
            if (!projectionFits(box)) continue;
            chosen = { spec, u, centerY, box };
            break;
        }
        if (chosen === null) continue; // correct to skip -- wall (or the alley space in front of it) is full, or genuinely too short for any tried spec
        const { spec, u, centerY, box } = chosen;
        facadeReserve(facade, 'sign', u - spec.wallFootprintWidth / 2, u + spec.wallFootprintWidth / 2, centerY - spec.height / 2, centerY + spec.height / 2);
        reserveProjectionVolume(box);
        const p = pointOnFacade(facade, u, centerY);
        const content = pickSignContent(p.x, p.z);
        const neon = pickNeonForRow(row);
        addSign(p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, neon, content.flicker, spec.width, spec.shape, spec.armLength);
        placed++;
    }
    return placed;
}

// classifies one of a cell's 4 sides against the site it belongs to --
// see assembleBuildingSites/cellEdgeKind above for the base 'internal' /
// 'party' / 'street' cases; this adds 'courtyard' when the neighbor is
// specifically this site's chosen void cell (see addBuildingSite).
function edgeKindForSite(cell, dr, dc, voidCell) {
    const base = cellEdgeKind(cell.row, cell.col, dr, dc);
    if (base === 'internal' && voidCell && cell.row + dr === voidCell.row && cell.col + dc === voidCell.col) return 'courtyard';
    return base;
}

const CELL_SIDE_DEFS = [
    { key: 'N', dx: 0, dz: -1 }, { key: 'S', dx: 0, dz: 1 },
    { key: 'W', dx: -1, dz: 0 }, { key: 'E', dx: 1, dz: 0 },
];
function kindForSide(kinds, dx, dz) { return kinds[CELL_SIDE_DEFS.find(s => s.dx === dx && s.dz === dz).key]; }

// THE canonical wall-facing convention -- every exterior wall's outward
// direction (nx,nz) is a unit vector (see CELL_SIDE_DEFS: it's literally
// that side's own dx/dz) pointing FROM the building OUT into free space.
// Every wall-mounted object (signs, cameras, ivy, pipes, awnings,
// posters, the fire escape, ...) is built in local space with local +Z
// as "away from the wall", then carries that to world space with a
// single group.rotation.y -- so the rotationY that makes local +Z equal
// world (nx,nz) is the ONLY rotation any of them should ever use.
// Three.js's rotation.y convention maps local +Z to world
// (sin(rotY), cos(rotY)) -- so solving sin(rotY)=nx, cos(rotY)=nz gives
// exactly atan2(nx, nz). Before this, makeFacade/addBuildingModule's
// per-face rotY and buildingFaceDefs each hand-maintained their own
// north/south/east/west rotation table -- and north/south had it
// backwards (rotY=0 for north's (0,-1) normal actually faces +Z / south),
// so every sign, camera, ivy patch, pipe run, and awning mounted on a
// north- or south-facing wall was built pointing back INTO the building
// instead of out over the street. East/west happened to already match
// this formula, which is exactly why only north/south looked wrong.
// See the cardinal-orientation self-test right below this.
function outwardRotationY(nx, nz) { return Math.atan2(nx, nz); }

(function selfTestCardinalOrientation() {
    // HARD TEST: for each cardinal direction, the world direction that
    // outwardRotationY's rotY actually carries local +Z to must be that
    // same direction's own (nx,nz), not merely "some rotation" -- this is
    // the exact invariant every wall-mounted prop depends on to project
    // outward instead of through the wall. Deterministic, no rng -- runs
    // identically on every seed/page load.
    const dirs = [{ name: 'N', nx: 0, nz: -1 }, { name: 'S', nx: 0, nz: 1 }, { name: 'W', nx: -1, nz: 0 }, { name: 'E', nx: 1, nz: 0 }];
    let allOk = true;
    for (const d of dirs) {
        const rotY = outwardRotationY(d.nx, d.nz);
        const wx = Math.sin(rotY), wz = Math.cos(rotY);
        const dot = wx * d.nx + wz * d.nz;
        if (dot < 0.999) {
            allOk = false;
            console.warn(`[testing] FAILED cardinal orientation self-test for ${d.name}: rotY=${rotY.toFixed(3)} world dir=(${wx.toFixed(3)},${wz.toFixed(3)}) expected (${d.nx},${d.nz})`);
        }
    }
    console.log(`[testing] cardinal orientation self-test: ${allOk ? 'PASS' : 'FAIL'} -- all 4 wall-mounted-object rotations point outward`);
})();

// a facade's u-axis (its own "left-to-right" tangent, perpendicular to
// its outward normal) -- an arbitrary but consistent direction (+x for a
// north/south wall, +z for an east/west wall), not itself meaningful,
// just shared by every anchor computed on that facade.
function facadeTangent(facade) {
    return facade.axisIsX ? { tx: 1, tz: 0 } : { tx: 0, tz: 1 };
}

// THE wall-anchor primitive -- every wall-mounted object should compute
// its world position from this, not by hand-rolling
// `cx + ox * 0.97`-style magic multipliers of the building's own
// half-width. u is signed distance along the facade's tangent from its
// center; outwardOffset is real distance (world units) off the wall's
// actual outer surface along its normal -- 0 sits exactly on the wall
// plane, WALL_THICKNESS/2 sits exactly on its physical outer face.
function pointOnFacade(facade, u, y, outwardOffset = 0) {
    const { tx, tz } = facadeTangent(facade);
    return {
        x: facade.cx + tx * u + facade.normalX * outwardOffset,
        y,
        z: facade.cz + tz * u + facade.normalZ * outwardOffset,
    };
}

// world-space occupancy for anything that projects meaningfully outward
// from its wall -- a facade's own u/v occupancy only knows about THAT
// facade; it can't catch two projections from DIFFERENT facades (the
// classic case: two perpendicular walls meeting at a corner, each
// pushing something out into the same shared alley volume) clipping
// through each other. Every wall in this city is cardinal (normal is
// always a unit axis vector), so an exact oriented box IS already an
// axis-aligned box -- no separating-axis math needed, just min/max per
// axis. Conservative is fine here (see the spec's "conservative boxes
// are fine" -- this never needs to be pixel-exact, just non-overlapping).
const exteriorDecorationVolumes = [];
function makeProjectionBox(facade, u, yBase, height, outwardDepth, tangentHalfWidth) {
    const { tx, tz } = facadeTangent(facade);
    const baseX = facade.cx + tx * u, baseZ = facade.cz + tz * u;
    const outX = facade.normalX * outwardDepth, outZ = facade.normalZ * outwardDepth;
    const spanX = tx ? tangentHalfWidth : 0.05, spanZ = tz ? tangentHalfWidth : 0.05;
    return {
        xMin: Math.min(baseX, baseX + outX) - spanX, xMax: Math.max(baseX, baseX + outX) + spanX,
        yMin: yBase, yMax: yBase + height,
        zMin: Math.min(baseZ, baseZ + outZ) - spanZ, zMax: Math.max(baseZ, baseZ + outZ) + spanZ,
        facadeId: facade.id, // which facade this projection came from -- debugging/inspection only, never read by placement logic itself
    };
}
function boxesIntersect(a, b) {
    return a.xMin < b.xMax && b.xMin < a.xMax && a.yMin < b.yMax && b.yMin < a.yMax && a.zMin < b.zMax && b.zMin < a.zMax;
}
function projectionFits(box) {
    for (const v of exteriorDecorationVolumes) if (boxesIntersect(box, v)) return false;
    return true;
}
function reserveProjectionVolume(box) { exteriorDecorationVolumes.push(box); }

// ?debugFacades=1 -- see the flag's own comment. A rectangle in a
// facade's own (u,v) space, drawn as a real world-space line loop via
// pointOnFacade -- the same primitive every actual wall-mounted object
// uses, so this overlay is checking the exact same math it's meant to
// visualize, not a separate approximation of it.
function facadeDebugRectOutline(facade, uMin, uMax, vMin, vMax, color, outwardOffset = 0.02) {
    const corners = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]
        .map(([u, v]) => pointOnFacade(facade, u, v, outwardOffset));
    const geo = new THREE.BufferGeometry().setFromPoints(corners.map(p => new THREE.Vector3(p.x, p.y, p.z)));
    scene.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color })));
}

const OCCUPANCY_DEBUG_COLORS = {
    door: 0x2255ff, fireEscape: 0xff3333,
    sign: 0xffaa00, poster: 0xffaa00,
    camera: 0xaa33ff, pipe: 0xaa33ff, awning: 0xaa33ff, balcony: 0xaa33ff,
    graffiti: 0x33ff88, ivy: 0x33ff88, flyer: 0x33ff88, sticker: 0x33ff88,
};

function addFacadeDebugOverlay() {
    if (!DEBUG_FACADES) return;
    for (const facade of buildingFacades) {
        facadeDebugRectOutline(facade, -facade.half, facade.half, facade.yMin, facade.yMax, facade.exposure === 'setback' ? 0x00ffff : 0x00ff88);

        // outward-normal arrow -- walk all 4 cardinal sides of a building;
        // an arrow pointing back through the wall means the rotation math
        // (outwardRotationY) is wrong for that side.
        const midV = (facade.yMin + facade.yMax) / 2;
        const base = pointOnFacade(facade, 0, midV, 0.05);
        const tip = pointOnFacade(facade, 0, midV, 1.5);
        const arrowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(tip.x, tip.y, tip.z)]);
        scene.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0xff00ff })));
        const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        tipDot.position.set(tip.x, tip.y, tip.z);
        scene.add(tipDot);

        for (const r of facade.occupied) {
            facadeDebugRectOutline(facade, r.uMin, r.uMax, r.vMin, r.vMax, OCCUPANCY_DEBUG_COLORS[r.type] ?? 0xffffff, 0.04);
        }
    }
    // world-space projection volumes (blade sign arms/panels, awnings,
    // fire escapes) -- purple wireframe boxes.
    for (const v of exteriorDecorationVolumes) {
        const box = new THREE.Box3(new THREE.Vector3(v.xMin, v.yMin, v.zMin), new THREE.Vector3(v.xMax, v.yMax, v.zMax));
        scene.add(new THREE.Box3Helper(box, 0xaa33ff));
    }
    console.log(`[testing] debugFacades overlay: drew ${buildingFacades.length} facades + ${exteriorDecorationVolumes.length} projection volumes`);
}

// ?debugSignatures=1 -- every reserved signature site's cells (colored
// per type) + a marker at its main (white dot, tall line) and secondary
// (gray dot, short line) entrance. Room/stair-core labels get added here
// as each landmark's real room graph lands -- for now, placeholder
// massing (see buildSignaturePlaceholder) has no interior layout to
// label yet.
const SIGNATURE_DEBUG_COLORS = {
    artGallery: 0xffe14d, as400Archive: 0x4dc8ff, justinIndex: 0xff4d9e,
    systemsWorkshop: 0x4dff8e, loreShrine: 0xff8a4d,
};
function addSignatureDebugOverlay() {
    if (!DEBUG_SIGNATURES) return;
    for (const inst of signatureInstances) {
        const color = SIGNATURE_DEBUG_COLORS[inst.type] ?? 0xffffff;
        for (const cell of inst.cells) {
            const { x, z } = cellToWorld(cell.col, cell.row);
            addDebugRectOutline(x, z, CELL / 2 - 0.15, CELL / 2 - 0.15, 0.2, color);
        }
        for (const entrance of [inst.mainEntrance, inst.secondaryEntrance]) {
            if (!entrance) continue;
            const isMain = entrance === inst.mainEntrance;
            const topY = isMain ? 6 : 3.5;
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(entrance.doorX, 0, entrance.doorZ),
                new THREE.Vector3(entrance.doorX, topY, entrance.doorZ),
            ]);
            scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: isMain ? 0xffffff : 0x999999 })));
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color }));
            dot.position.set(entrance.outsideX, topY, entrance.outsideZ);
            scene.add(dot);
        }
    }
    console.log(`[signature] debugSignatures overlay: drew ${signatureInstances.length} reserved sites`);
}

// the actual buildable rectangle for one cell -- independent per-side
// setbacks (0 for a same-site neighbor, a small shared value for a
// party wall, the normal street setback otherwise) instead of one margin
// shrinking the cell uniformly on all 4 sides. Two adjacent same-site
// cells get EXACTLY flush (zero-gap) shared edges this way -- that flush
// merge, not a family/wing system, is what makes an L-shaped SITE read
// as a genuinely L-shaped BUILDING (each arm a full cell wide/deep).
function computeCellRect(x, z, kinds, streetSetbackX, streetSetbackZ, partySetback) {
    const setbackFor = (kind, streetSetback) => kind === 'internal' ? 0 : kind === 'party' ? partySetback : streetSetback;
    const zMin = z - CELL / 2 + setbackFor(kinds.N, streetSetbackZ);
    const zMax = z + CELL / 2 - setbackFor(kinds.S, streetSetbackZ);
    const xMin = x - CELL / 2 + setbackFor(kinds.W, streetSetbackX);
    const xMax = x + CELL / 2 - setbackFor(kinds.E, streetSetbackX);
    return { cx: (xMin + xMax) / 2, cz: (zMin + zMax) / 2, hwx: (xMax - xMin) / 2, hwz: (zMax - zMin) / 2 };
}

// a real, fully-enclosed courtyard void -- dressed as a paved yard
// filling roughly the whole cell, not built as a module at all. Only
// ever chosen for a cell whose all 4 neighbors belong to the SAME site
// (see addBuildingSite), so it has no direct alley/different-site/
// perimeter exposure -- every side of it is a real wall belonging to one
// of its neighboring modules (see 'courtyard' in edgeKindForSite).
function buildCourtyardVoid(cell) {
    const { x: cx, z: cz } = cellToWorld(cell.col, cell.row);
    const half = CELL / 2 - 0.3;
    const paverTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#8a8270';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#5a5648';
        for (let i = 0; i < w; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        for (let i = 0; i < h; i += 12) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    }, 96, 96);
    const pavers = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.9 }));
    pavers.rotation.x = -Math.PI / 2;
    pavers.position.set(cx, 0.015, cz);
    scene.add(pavers);
    addPottedPlant(cx + half * 0.5, cz + half * 0.5);
    addPottedPlant(cx - half * 0.5, cz - half * 0.5);
    addBench(cx - half * 0.4, cz + half * 0.3, randRange(0, Math.PI * 2));
    addBench(cx + half * 0.3, cz - half * 0.4, randRange(0, Math.PI * 2));
    scatterJunk('alley', cx, cz, 1 + Math.floor(rng() * 2), half * 0.5);
    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xfff0d0, 2.2, 8, 2);
        light.position.set(cx, 2.2, cz);
        scene.add(light);
    }
}

// ?debugFootprints=1 -- one dim rectangle per site cell's full envelope,
// one bright rectangle per actually built module, magenta for a
// courtyard void. Flown over with freecam (F), this is the literal
// "gray box overhead" test: a plain grid of centered squares means the
// generator has regressed.
function addSiteDebugOverlay(cells, builtModules, voidCell) {
    if (!DEBUG_FOOTPRINTS) return;
    for (const cell of cells) {
        const { x, z } = cellToWorld(cell.col, cell.row);
        addDebugRectOutline(x, z, CELL / 2, CELL / 2, 0.15, 0x3355aa);
    }
    for (const m of builtModules) addDebugRectOutline(m.cx, m.cz, m.hwx, m.hwz, 0.16, 0x00ff88);
    if (voidCell) {
        const { x, z } = cellToWorld(voidCell.col, voidCell.row);
        addDebugRectOutline(x, z, CELL / 2 - 0.3, CELL / 2 - 0.3, 0.17, 0xff33cc);
    }
}

// one full-scale module -- one grid cell of a building site, inset per
// real per-side edge classification (see computeCellRect). Returns its
// own {cx,cz,hwx,hwz} (debug overlay only).
function addBuildingModule(cell, opts) {
    const { isPrimary, isWarehouse, floorCount, floorHeight, height, color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell, siteFloorCounts, signatureMode } = opts;
    const { row, col } = cell;
    const { x, z } = cellToWorld(col, row);

    const kinds = {};
    for (const s of CELL_SIDE_DEFS) kinds[s.key] = edgeKindForSite(cell, s.dz, s.dx, voidCell);

    const rect = computeCellRect(x, z, kinds, streetSetbackX, streetSetbackZ, partySetback);
    const { cx, cz, hwx, hwz } = rect;
    footprintOf[row][col] = { hwx, hwz };

    const shellMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    const streetSides = CELL_SIDE_DEFS.filter(s => kinds[s.key] === 'street');
    // signature buildings can request a SPECIFIC side (matching the exact
    // edge reserveSignatureSites already recorded as mainEntrance/
    // secondaryEntrance) instead of a random one -- so the door that
    // actually gets built lines up with the entrance markers/spawn point
    // the reservation already committed to. Falls back to the normal
    // random pick if the requested side isn't actually a street side on
    // this cell (shouldn't happen, but never silently drop the door).
    const forcedSide = opts.forceDoorSide && streetSides.find(s => s.dx === opts.forceDoorSide.dc && s.dz === opts.forceDoorSide.dr);
    const door = forcedSide || (streetSides.length ? pick(streetSides) : null);

    // base gaps -- present on qualifying floors: full-width open
    // connections to same-site neighbors ('internal'), doorway-width
    // openings into a courtyard void ('courtyard'). 'party' sides get a
    // real, gap-free wall; 'street' sides get a real wall too, with the
    // primary door (floor 0 only, handled separately below with the usual
    // lintel).
    //
    // 'internal' is NOT simply "no wall, ever" -- adjacent modules of the
    // SAME site can have different floor counts (real setbacks, see
    // addBuildingSite's floorCountByCellKey). The shared interior
    // connection is only real on the floors BOTH modules actually have --
    // above whichever one is shorter, this floor's edge is a genuine
    // exterior wall, not a hole into open air. `floorMax` on the gap
    // (checked below, same mechanism `floorOnly` already used for the
    // fire-escape opening) is exactly that cutoff: the gap only applies
    // while fl < floorMax, i.e. while the neighbor still has this floor.
    const baseGaps = [];
    for (const s of CELL_SIDE_DEFS) {
        const kind = kinds[s.key];
        if (kind === 'internal') {
            const neighborKey = `${row + s.dz},${col + s.dx}`;
            const neighborFloorCount = siteFloorCounts?.get(neighborKey) ?? floorCount;
            baseGaps.push(s.dx !== 0
                ? { dx: s.dx, dz: 0, lo: cz - hwz, hi: cz + hwz, floorMax: neighborFloorCount }
                : { dx: 0, dz: s.dz, lo: cx - hwx, hi: cx + hwx, floorMax: neighborFloorCount });
        } else if (kind === 'courtyard') {
            baseGaps.push(s.dx !== 0 ? { dx: s.dx, dz: 0, lo: cz - 0.8, hi: cz + 0.8 } : { dx: 0, dz: s.dz, lo: cx - 0.8, hi: cx + 0.8 });
        }
    }

    let stairwell = null;
    // a fixed-corner shaft needs real room on both axes -- a narrow
    // module (a short wing, a rowhouse-thin cell) skips an interior stair
    // rather than build a degenerate/inverted one. buildCoreFloor already
    // has a real fallback for a null stairwell (a plain solid ceiling per
    // floor, same as any floorCount === 1 module) -- upper floors still
    // exist there, they're just not interior-reachable in that module.
    if (floorCount > 1 && Math.min(hwx, hwz) > 1.6) {
        const swHalf = Math.min(1.1, Math.min(hwx, hwz) - 0.5);
        const cornerSignX = rng() < 0.5 ? -1 : 1, cornerSignZ = rng() < 0.5 ? -1 : 1;
        const swX = cx + cornerSignX * (hwx - swHalf - 0.15);
        const swZ = cz + cornerSignZ * (hwz - swHalf - 0.15);
        const doorX = swX - cornerSignX * swHalf;
        const flightEndX = swX + cornerSignX * swHalf * 0.3;
        stairwell = { swX, swZ, swHalf, cornerSignX, cornerSignZ, doorX, flightEndX };
    }
    // cosmetic stair-core expression -- only where there's an actual wall
    // to bump out from (not an open archway into a neighboring module).
    if (stairwell && kindForSide(kinds, stairwell.cornerSignX, 0) !== 'internal') {
        addStairTowerExpression(cx, cz, stairwell.cornerSignX, stairwell.swZ, height, hwx, floorHeight);
    }

    // upper-floor exterior opening: a real fire escape now connects to
    // an actual floor, not just a decorative mesh bolted onto a sealed
    // box. The real fire-escape model/collision (buildFireEscapeStair,
    // below) tops out around y=5.4 regardless of how tall this building
    // is (its landings only ever land in floor 0/1's band) -- so the
    // connection this makes is always to floor 1 specifically, a real
    // but bounded slice of "upper floors have exterior routes", not
    // every floor. Decided BEFORE floors are built so the opening can be
    // carved into that one specific floor.
    // signature buildings (see buildArtGallery et al.) route their own
    // exterior connections through an authored secondary entrance --
    // never a random fire escape punched through wherever this roll
    // happens to land (spec: "no random fire escape through gallery
    // artwork"). null here just means "no fire-escape opening this
    // module", same as any other module that lost the coin flip.
    const fireEscapeSide = (floorCount >= 2 && !signatureMode) ? pick([...streetSides, null, null]) : null; // null bias -- not every multi-floor module gets one
    if (fireEscapeSide) {
        baseGaps.push(fireEscapeSide.dx !== 0
            ? { dx: fireEscapeSide.dx, dz: 0, lo: cz - 0.8, hi: cz + 0.8, floorOnly: 1 }
            : { dx: 0, dz: fireEscapeSide.dz, lo: cx - 0.8, hi: cx + 0.8, floorOnly: 1 });
    }

    // exterior sides exposed on THIS floor specifically because a
    // same-site neighbor stops below it (floorMax gaps above no longer
    // apply) -- these are genuine setback walls, not the module's normal
    // street/party perimeter, and get folded into the facade pass below
    // (see exposedSetbackSidesByFloor) so they still become real,
    // decoratable facades instead of a blank untextured box side.
    const exposedSetbackSidesByFloor = [];

    const floors = [];
    for (let fl = 0; fl < floorCount; fl++) {
        const gaps = baseGaps.filter(g => (g.floorOnly === undefined || g.floorOnly === fl) && (g.floorMax === undefined || fl < g.floorMax));
        const exposedThisFloor = CELL_SIDE_DEFS.filter(s => {
            const g = baseGaps.find(bg => bg.dx === s.dx && bg.dz === s.dz && bg.floorMax !== undefined);
            return g && fl >= g.floorMax;
        });
        exposedSetbackSidesByFloor.push(exposedThisFloor);
        totalExposedSetbackWalls += exposedThisFloor.length;
        const coreDoor = fl === 0 ? door : null;
        const extMat = fl === 0 ? shellMat : material;
        const segments = buildCoreFloor(rect, fl, floorCount, floorHeight, coreDoor, extMat, shellMat, gaps, stairwell);
        floors.push({ yMin: fl * floorHeight, yMax: fl * floorHeight + floorHeight, segments });
    }
    buildingWallSegments.set(`${row},${col}`, { floors });

    // exposed-setback facades -- a same-site neighbor stopped short (see
    // floorMax gaps above), so this side is a genuine exterior wall for
    // floors [firstExposedFloor, floorCount), not the module's normal
    // street perimeter. It still gets a real FacadeSurface (item 19 of
    // the spec this pass implements): same normal/tangent math, same
    // material/UVs as any other exterior wall, eligible for the same
    // decoration pass (windows already come from the wall's own texture;
    // ivy/pipes/grime/a setback-facing sign are the general facade-
    // occupancy pass's job, see phase 5) -- not a blank untextured box
    // side that happens to exist.
    for (const s of CELL_SIDE_DEFS) {
        let firstExposedFloor = -1;
        for (let fl = 0; fl < floorCount; fl++) {
            if (exposedSetbackSidesByFloor[fl].includes(s)) { firstExposedFloor = fl; break; }
        }
        if (firstExposedFloor === -1) continue;
        buildingFacades.push(makeFacade(rect, s.dx, s.dz, firstExposedFloor * floorHeight, height, null, 'setback', `${row},${col}`));
    }

    // interior dressing -- ground floor only (upper-floor prop helpers
    // all assume a y=0 baseline). Signature buildings skip ALL of this:
    // their own builder places its own authored furniture/exhibits
    // instead of generic crates/junk/a random table (spec: "the generic
    // building generator MUST NOT... randomly add warehouse logic").
    const hw = Math.min(hwx, hwz);
    if (!signatureMode) {
        maybeAddMezzanine(cx, cz, hw, floorHeight, door);
        maybeAddElevator(cx, cz, hw, floorHeight, door);
        addCrate(cx - hwx * 0.4, cz + hwz * 0.3);
        addPottedPlant(cx + hwx * 0.5, cz - hwz * 0.4);
        const indoorJunkCount = 2 + Math.floor((1 - buildingContext.maintenance) * 5 + rng() * 3);
        scatterJunk('indoor', cx, cz, indoorJunkCount, hw * 0.55);
        if (rng() < 0.2 + buildingContext.maintenance * 0.35) addTableWithClutter(cx + randRange(-hwx * 0.35, hwx * 0.35), cz + randRange(-hwz * 0.35, hwz * 0.35));
    }

    // roof -- always the flat top of this module's own real floors. No
    // more decorative tower above enterHeight: every unit of visible
    // height is a real, stair-connected floor (buildCoreFloor's own roof
    // hatch reaches it from inside), so height === floorCount *
    // floorHeight exactly and this deck sits right where the building
    // actually stops.
    elevatedPlatforms.push({ x: cx, z: cz, hx: hwx, hz: hwz, y: height });
    rooftopDecks.push({ x: cx, z: cz, hx: hwx, hz: hwz, y: height, buildingKey: `${row},${col}` });
    // signature buildings decide their own roof (terrace, mechanical hut,
    // antenna array...) explicitly in their own builder -- an auto-rolled
    // mechanical room or a random dome/spire would fight that (spec:
    // "the generic building generator MUST NOT... randomly choose its
    // height" and the roof-access requirements are per-landmark, not a
    // coin flip).
    if (!signatureMode && isPrimary && !isWarehouse && hw > 1.6 && rng() < 0.3) {
        const room = buildRooftopMechanicalRoom(cx, cz, hw, height);
        buildingWallSegments.get(`${row},${col}`).floors.push(room);
    }
    // a small roof ornament -- a non-traversable cupola/spire a couple of
    // units tall, NOT a second fake tower (real height still only ever
    // comes from floorCount above). Primary module only.
    if (!signatureMode && isPrimary && !isWarehouse) {
        const topper = weightedPick({ none: 6, dome: 2, spire: 2 });
        if (topper === 'dome') {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(hw * 0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), material);
            dome.position.set(cx, height, cz);
            scene.add(dome);
        } else if (topper === 'spire') {
            const spireH = randRange(2, 4);
            const spire = new THREE.Mesh(
                jitterGeometry(new THREE.ConeGeometry(0.15, spireH, 6), 0.02),
                new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.5, metalness: 0.6 })
            );
            spire.position.set(cx, height + spireH / 2, cz);
            scene.add(spire);
        }
    }

    // curb/base skirt so the module reads as sitting on something, not floating
    const curb = CONFIG.buildings.curb;
    const skirt = new THREE.Mesh(skirtBoxGeo, new THREE.MeshStandardMaterial({ color: curb.color, roughness: 1 }));
    skirt.scale.set(hwx * 2 + curb.overhang, curb.height, hwz * 2 + curb.overhang);
    skirt.position.set(cx, curb.height / 2, cz);
    scene.add(skirt);

    // facade surfaces + decoration -- 'street' sides only; party/
    // internal/courtyard sides get no signage/street dressing.
    //
    // TWO passes over the same sides, not one. Pass 1 creates every
    // FacadeSurface and reserves permanent structural fixtures (the fire
    // escape) on ALL of them; pass 2 does every facade's sign/decoration
    // search. A single combined loop reserved a structural fixture only
    // when ITS OWN side came up -- a blade sign on side A (processed
    // first) could already have checked projectionFits and found a
    // nearby corner clear, simply because side B's fire escape
    // (processed later in that same loop) hadn't registered its
    // world-space volume yet. Two passes means every structural
    // reservation on every side of this module exists before any side's
    // decoration search runs at all.
    const sideFacades = streetSides.map(s => {
        const isFireEscapeFace = fireEscapeSide && fireEscapeSide.dx === s.dx && fireEscapeSide.dz === s.dz;
        // a FacadeSurface exists here whether or not a sign ever lands on
        // it -- it's a real piece of architecture (this wall), not a
        // record of "a sign happened".
        const facade = makeFacade(rect, s.dx, s.dz, 0, height, door, 'street', `${row},${col}`);
        if (isFireEscapeFace) {
            facadeReserve(facade, 'fireEscape', -0.7, 0.7, 0, height);
            // KNOWN GAP (pre-existing, root-caused 2026-08-28, not fixed
            // here): every other projecting fixture (awnings at ~4451,
            // blade signs at ~3861) calls projectionFits(box) before
            // reserveProjectionVolume; this is the one path that doesn't.
            // fireEscapeSide is chosen, and this building's interior
            // floor-1 opening already carved (see baseGaps, well above,
            // before this module's own facades even exist), long before
            // it's possible to know whether the projection actually
            // clears an ALREADY-BUILT neighbor's fixture at a shared
            // alley corner -- that's what occasionally trips the
            // "world-space projection intersection self-test" (~1 seed
            // in 5-10, confirmed present before this pass at both 11x11
            // and 17x17, so it's not a regression from anything in this
            // session). A real fix means deciding fireEscapeSide AFTER
            // this module's own facade/projection-box exists (checking it
            // against neighbors) instead of before floors are built --
            // real surgery on a path every generic building in the city
            // runs through, deliberately not attempted mid-signature-
            // location-pass. Guarding the reservation here without also
            // being able to retract the already-carved interior opening
            // would trade a cosmetic mesh overlap for an actual hole in
            // the wall with nothing built outside it, which is worse.
            reserveProjectionVolume(makeProjectionBox(facade, 0, 0, height, 1.3, 0.7));
        }
        buildingFacades.push(facade);
        return { s, facade, isFireEscapeFace };
    });
    // signature buildings get the real FacadeSurface objects above (so
    // their own builder can hang authored signage/art on them through
    // the same findFreeFacadeRect/pointOnFacade occupancy manager
    // everything else uses) but NONE of the random sign/pipe/awning/
    // camera/flyer/ivy/graffiti/balcony decoration below -- that's
    // exactly the "no generic architecture may... spam generic signs
    // over its identity facade" requirement. rect.streetFacades carries
    // them out to the caller (addBuildingSite/buildArtGallery etc.)
    // without changing addBuildingModule's return shape for anyone else.
    rect.streetFacades = sideFacades.map(sf => sf.facade);
    if (signatureMode) {
        addRooftopClutter(cx, cz, hw * 2, height, buildingContext.maintenance);
        return rect;
    }

    for (const { s, facade, isFireEscapeFace } of sideFacades) {
        const ox = s.dx * (hwx + 0.03), oz = s.dz * (hwz + 0.03);
        const rotY = outwardRotationY(s.dx, s.dz);

        // more than one sign per face -- a real signage-choked facade is
        // layered, not one polite billboard each. Each one reserves real
        // facade space (see placeSignsOnFacade) sized to its OWN actual
        // geometry, so layering density no longer means visible overlap.
        const t = webAlignment(cz);
        const signChance = THREE.MathUtils.lerp(CONFIG.narrative.darkWeb.signChance, CONFIG.narrative.lightWeb.signChance, t);
        let signCount = 0;
        if (rng() < signChance) {
            const signRolls = [1, 0.65, 0.35];
            for (const p of signRolls) { if (rng() < p) signCount++; else break; }
        }
        const signsPlaced = placeSignsOnFacade(facade, signCount, row);
        // a face genuinely free of signs is recorded in candidateFaces --
        // the real FacadeSurface itself, not a raw {x,z,rotY} snapshot of
        // it -- so the content-card pass later reserves real occupancy on
        // the SAME persistent object everything else here already used
        // (a fire-escape reservation made above survives into that pass
        // automatically; it used to be lost entirely whenever this
        // branch's sibling ran instead).
        if (signsPlaced === 0) candidateFaces.push(facade);

        // everything below shares ONE occupancy manager (`facade`) instead
        // of independently rolling a world position and hoping nothing
        // else already claimed it -- density is unchanged (same roll
        // chances as before), but a skipped roll now means "this facade
        // had no free real estate for it" instead of nothing at all.
        // Roughly the spec's decoration order: hardware fixtures
        // (pipes/awnings/cameras) before the paper-thin overlays
        // (flyers/graffiti) that are allowed to sit on top of anything.

        // pipes/HVAC -- real hardware, a narrow but often TALL reserved
        // column (addPipeCluster rolls its own real top height internally;
        // this reserves a conservative upper bound on that -- an
        // over-reservation, never an under-reservation, see phase 6's
        // "conservative boxes are fine").
        if (rng() < 0.3) {
            const pipeHeight = Math.min(height - 0.4, 6);
            const spot = findFreeFacadeRect(facade, 'pipe', 0.35, pipeHeight, 0, height);
            if (spot) {
                const p = pointOnFacade(facade, spot.u, 0, WALL_THICKNESS / 2 + 0.01);
                addPipeCluster(p.x, p.z, rotY, height, buildingContext.maintenance);
            }
        }
        // awnings -- hardware, low over the ground floor. Also registers a
        // (shallow -- an awning only really projects ~0.3*width outward,
        // see addAwning) world-space volume, same reasoning as blade
        // signs: a corner where two facades both push something into the
        // same alley shouldn't rely on either one's own facade occupancy
        // alone to catch it.
        if (rng() < 0.42) {
            const awningWidth = randRange(1.6, 2.4);
            const awningHeight = awningWidth * 0.45;
            const awningY = Math.max(2.4, floorHeight + 0.2);
            const spot = findFreeFacadeRect(facade, 'awning', awningWidth, awningHeight, awningY - 0.4, awningY + 0.4);
            if (spot) {
                const box = makeProjectionBox(facade, spot.u, spot.v - awningHeight / 2, awningHeight, awningWidth * 0.35, awningWidth / 2);
                if (projectionFits(box)) {
                    reserveProjectionVolume(box);
                    const p = pointOnFacade(facade, spot.u, spot.v);
                    addAwning(p.x, p.y, p.z, rotY, awningWidth);
                }
            }
        }
        // security cameras -- small hardware fixture, watches the street.
        if (rng() < 0.14) {
            const spot = findFreeFacadeRect(facade, 'camera', 0.3, 0.3, 2.6, Math.min(height - 1, 5.5));
            if (spot) {
                const p = pointOnFacade(facade, spot.u, spot.v);
                addSecurityCamera(p.x, p.z, rotY, height);
            }
        }

        // a flyer (or a small cluster) taped up nearby -- overlay, blocked
        // only by the door, free to sit over/under any hardware or sign.
        if (rng() < 0.4) {
            const flyerCount = rng() < 0.3 ? 2 : 1;
            for (let i = 0; i < flyerCount; i++) {
                const spot = findFreeFacadeRect(facade, 'flyer', 0.55, 0.7, 1.0, 1.8, 4, 0.02);
                if (spot) {
                    const p = pointOnFacade(facade, spot.u, spot.v);
                    addWallFlyer(p.x, p.y, p.z, rotY);
                }
            }
        }
        // ivy -- overlay, spreads up the wall.
        if (rng() < 0.3) {
            const spot = findFreeFacadeRect(facade, 'ivy', 1.0, 1.4, 0.6, Math.min(height - 0.5, 4), 4, 0.02);
            if (spot) {
                const p = pointOnFacade(facade, spot.u, spot.v);
                addIvyPatch(p.x, p.y, p.z, rotY);
            }
        }
        // graffiti tags scrawled near ground level -- overlay, independent
        // of whatever else landed on this facade, and often more than
        // one, the way a real repeatedly-tagged wall accumulates over
        // time (overlapping each other a little is realistic, not a bug
        // -- only the door itself is off-limits, see FACADE_CLASS).
        const graffitiRolls = [0.42, 0.4, 0.25];
        let graffitiPlaced = 0;
        for (const p of graffitiRolls) {
            if (rng() >= p) break;
            const spot = findFreeFacadeRect(facade, 'graffiti', 1.2, 0.5, 0.55, 1.7, 4, 0.02);
            if (!spot) continue;
            graffitiPlaced++;
            const pp = pointOnFacade(facade, spot.u, spot.v);
            addGraffitiTag(pp.x, pp.y, pp.z, rotY);
        }
        if (graffitiPlaced && rng() < 0.3 * QUALITY.propDensity) {
            placeRealModel('sprayCans', cx + ox * 0.85, cz + oz * 0.85, randRange(0, Math.PI * 2));
        }

        // the real fire escape -- only on the one side (if any) actually
        // wired to a floor-1 interior opening above (fireEscapeSide, see
        // isFireEscapeFace above). Its facade footprint (-0.7..0.7, full
        // height) was already reserved before any sign/hardware roll ran.
        if (isFireEscapeFace) {
            placeRealModel('fireEscape', cx + ox * 1.02, cz + oz * 1.02, rotY);
            // (its world-space projection volume was already registered
            // above, alongside its facade reservation, before any other
            // decoration on this or a neighboring facade got a chance to
            // search around it -- see the comment up there)
            const landings = buildFireEscapeStair(cx + ox * 1.02, cz + oz * 1.02, rotY, isWarehouse ? height : randRange(5, 11));
            if (landings.length) {
                // the landing closest to floor 1's own height -- the one
                // that actually lines up with the real door opening.
                const target = floorHeight * 1.5;
                const landing = landings.reduce((best, l) => Math.abs(l.y - target) < Math.abs(best.y - target) ? l : best, landings[0]);
                const tangentHalf = s.dz !== 0 ? hwx : hwz;
                const tangent = (rng() < 0.5 ? -1 : 1) * tangentHalf * 0.55;
                const bx = cx + ox + (s.dz !== 0 ? tangent : 0);
                const bz = cz + oz + (s.dx !== 0 ? tangent : 0);
                facadeReserve(facade, 'balcony', tangent - 0.6, tangent + 0.6, landing.y - 0.3, landing.y + 1.1);
                addBalcony(bx, landing.y, bz, rotY, buildingContext.maintenance);
            }
        } else if (rng() < 0.12 && !isWarehouse) {
            // buildings without a fire escape on this face still
            // occasionally get a (purely decorative) balcony -- real
            // hardware, so it still claims real facade space.
            const spot = findFreeFacadeRect(facade, 'balcony', 1.2, 1.4, floorHeight + 1.5, Math.max(floorHeight + 2, height - 1.5));
            if (spot) {
                const p = pointOnFacade(facade, spot.u, spot.v);
                addBalcony(p.x, p.y, p.z, rotY, buildingContext.maintenance);
            }
        }
    }

    addRooftopClutter(cx, cz, hw * 2, height, buildingContext.maintenance);
    return rect;
}

// replaces the old one-cell addBuilding entry point. A site's cells are
// all rolled as ONE coherent building (shared warehouse/hero/material/
// maintenance context) and built as N independent full-cell modules --
// see computeCellRect for why that alone makes an L/T/U/bar/cluster
// SITE read as a genuinely that-shaped BUILDING, not a big rectangle
// with a token appendage.
function addBuildingSite(site) {
    const { cells } = site;
    const isWarehouse = rng() < 0.12;
    const isHeroTower = !isWarehouse && rng() < CONFIG.buildings.heroTowerChance;
    const color = pick(CONFIG.buildings.palette);
    const buildingContext = { wealth: rng(), maintenance: rng() };
    const useStain = !isWarehouse && rng() < 0.08 + (1 - buildingContext.maintenance) * 0.28;
    const useWindows = !isWarehouse && !useStain;
    const litRatio = Math.max(0.05, Math.min(0.4, 0.15 + buildingContext.wealth * 0.2 - (1 - buildingContext.maintenance) * 0.08));
    const floorHeight = 3.0;

    // setbacks rolled ONCE per site (shared across every module) so the
    // whole building reads as one consistent facade depth.
    const streetSetbackX = isWarehouse ? CONFIG.maze.buildingMarginMin / 2 : randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const streetSetbackZ = isWarehouse ? CONFIG.maze.buildingMarginMin / 2 : randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.3); // near-flush -- an attached row, not a full alley gap

    // floor count IS the height now -- see CONFIG.buildings.
    const maxFloorsForThis = isWarehouse ? Math.min(QUALITY.maxEnterableFloors, 2) : isHeroTower ? QUALITY.maxHeroFloors : QUALITY.maxEnterableFloors;
    const weights = isHeroTower ? CONFIG.buildings.heroFloorCountWeights : CONFIG.buildings.floorCountWeights;
    const primaryFloorCount = Math.max(1, Math.min(maxFloorsForThis, Number(weightedPick(weights))));
    const height = primaryFloorCount * floorHeight;

    const material = useStain
        ? new THREE.MeshStandardMaterial({ map: makeTopologyStainTexture(), roughness: CONFIG.buildings.roughness, side: THREE.DoubleSide })
        : useWindows
            ? new THREE.MeshStandardMaterial({ map: makeWindowGridTexture(height, color, litRatio), roughness: CONFIG.buildings.roughness, side: THREE.DoubleSide })
            : new THREE.MeshStandardMaterial({ color, roughness: CONFIG.buildings.roughness, side: THREE.DoubleSide });

    // per-cell same-site degree -- decides the "primary" mass (most
    // connected, reads as the building's main block -- the only module
    // eligible for a roof mechanical room/topper) and courtyard
    // eligibility (a cell fully enclosed by its own site, degree 4,
    // never the primary).
    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === site.id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const cell of cells) {
        const d = degreeOf(cell);
        if (d > primaryDegree) { primaryDegree = d; primary = cell; }
    }
    let voidCell = null;
    if (cells.length >= 5) {
        for (const cell of cells) {
            if (cell === primary) continue;
            if (degreeOf(cell) === 4) { voidCell = cell; break; }
        }
    }

    // module plan -- EVERY cell's floor count is decided now, before any
    // geometry exists, not rolled module-by-module as each one is built.
    // Two same-site cells can (and often do) end up with different floor
    // counts -- real setbacks -- and a module needs to know a same-site
    // NEIGHBOR's actual floor count while building its OWN walls: an
    // 'internal' edge (see edgeKindForSite) is only a full-width open
    // connection on the floors BOTH modules actually have. Above whichever
    // one is shorter, the taller module needs a genuine exterior wall on
    // that side instead of an opening into empty air (see floorMax on
    // baseGaps in addBuildingModule below). Iterated in the same `cells`
    // order the old inline version used, so the rng() sequence -- and
    // therefore every other seeded roll after this -- is unchanged.
    const floorCountByCellKey = new Map(); // "row,col" -> floorCount; courtyard void excluded
    for (const cell of cells) {
        if (voidCell && cell.row === voidCell.row && cell.col === voidCell.col) continue;
        const isPrimaryCell = cell.row === primary.row && cell.col === primary.col;
        const floorCount = isPrimaryCell ? primaryFloorCount : Math.max(1, primaryFloorCount - Math.floor(rng() * 3));
        floorCountByCellKey.set(`${cell.row},${cell.col}`, floorCount);
    }

    const builtModules = [];
    for (const cell of cells) {
        if (voidCell && cell.row === voidCell.row && cell.col === voidCell.col) {
            buildCourtyardVoid(cell);
            continue;
        }
        const isPrimary = cell.row === primary.row && cell.col === primary.col;
        const floorCount = floorCountByCellKey.get(`${cell.row},${cell.col}`);
        const rect = addBuildingModule(cell, {
            isPrimary, isWarehouse, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell,
            siteFloorCounts: floorCountByCellKey,
        });
        builtModules.push(rect);
    }
    addSiteDebugOverlay(cells, builtModules, voidCell);
}

// ---------- signature locations: dispatch ----------
// SIGNATURE_BUILDERS maps each CONFIG.signatureBuildings key to the
// function that owns its architecture. Every entry currently points at
// the shared placeholder below -- each gets replaced with its own real
// buildArtGallery/buildAS400Archive/buildJustinIndex/
// buildSystemsWorkshop/buildLoreShrine as that landmark is authored (see
// the task list this pass is tracked against). Whichever function is
// registered here is expected to produce the same interfaces a generic
// building does -- real walls/floors/roofs/facades/doors/collision/
// traversal nodes -- so nothing outside this dispatch needs a landmark
// special case.
function buildSignaturePlaceholder(site) {
    const { cells, signatureType, signatureInstance, id } = site;
    const typeCfg = CONFIG.signatureBuildings[signatureType];
    // a distinct near-white "under construction" massing -- deliberately
    // NOT drawn from CONFIG.buildings.palette, so a placeholder always
    // reads as visually different from real city fabric rather than
    // blending in and quietly pretending to be finished.
    const color = 0xf0ece0;
    const buildingContext = { wealth: 0.65, maintenance: 0.85 };
    const floorHeight = 3.0;
    const primaryFloorCount = Math.max(1, Math.min(QUALITY.maxEnterableFloors, typeCfg.preferredFloors || 3));
    const material = new THREE.MeshStandardMaterial({ map: makeWindowGridTexture(primaryFloorCount * floorHeight, color, 0.3), roughness: CONFIG.buildings.roughness, side: THREE.DoubleSide });
    const streetSetbackX = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const streetSetbackZ = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.3);

    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const cell of cells) { const d = degreeOf(cell); if (d > primaryDegree) { primaryDegree = d; primary = cell; } }

    const floorCountByCellKey = new Map();
    for (const cell of cells) {
        const isPrimaryCell = cell.row === primary.row && cell.col === primary.col;
        floorCountByCellKey.set(`${cell.row},${cell.col}`, isPrimaryCell ? primaryFloorCount : Math.max(1, primaryFloorCount - Math.floor(rng() * 2)));
    }

    const builtModules = [];
    for (const cell of cells) {
        const isPrimary = cell.row === primary.row && cell.col === primary.col;
        const floorCount = floorCountByCellKey.get(`${cell.row},${cell.col}`);
        const rect = addBuildingModule(cell, {
            isPrimary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX, streetSetbackZ, partySetback, voidCell: null,
            siteFloorCounts: floorCountByCellKey,
        });
        builtModules.push(rect);
    }
    addSiteDebugOverlay(cells, builtModules, null);

    // forced identity sign at the main entrance -- mounted high (roofline,
    // not the usual sign band) specifically so it doesn't compete for the
    // same facade space the generic decoration pass above already rolled
    // for this wall. Real per-landmark signage (PART of that builder's
    // authored facade, not a bolt-on) replaces this the moment that
    // landmark's real builder lands.
    const e = signatureInstance.mainEntrance;
    // a wide, short marquee (fixed shape/width, not the usual random roll)
    // so every placeholder's identity sign reads the same way regardless
    // of which facade it landed on, and stays clear of the roofline at
    // this mount height.
    addSign(e.doorX, primaryFloorCount * floorHeight - 0.9, e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xffffff, false, 3.2, { w: 120, h: 48 });

    console.log(`[signature] ${typeCfg.exteriorName}: placeholder massing built (${cells.length} cells, ${primaryFloorCount} floors) -- authored interior pending, see task list`);
}

// ============================================================
// ART GALLERY -- authored signature location #1.
// ============================================================
// Real content only -- every entry is drawn straight from
// CONFIG.siteContent.art/webProjects (already in this repo) and
// PHOTO_BY_TITLE; aspectRatio is measured directly from the actual jpg
// in vendor/photos (`python3 -c "from PIL import Image; ..."`, not
// guessed). Nothing here is invented. 'GARY FISCHER' inherits the
// project's own pre-existing (slightly odd) PHOTO_BY_TITLE mapping to
// the 'bike' photo -- that mapping already existed before this pass;
// this catalog reports it faithfully rather than silently "fixing" it
// into a fact nobody actually asserted.
// aspectRatio = height/width, measured directly off the real jpg
// (Pillow: Image.open(f).size), same convention buildGalleryArtPanel's
// own img.height/img.width uses -- known ahead of the image's own
// (async, network) load, which is what lets mountGalleryPiece reserve
// real facade space synchronously during layout instead of guessing a
// placeholder box and hoping the real image comes in the same shape.
const ART_GALLERY_CATALOG = [
    { id: 'teeth', title: "'TEETH'", subtitle: 'acrylic on canvas', photoKey: 'teeth', aspectRatio: 493 / 400, kind: 'wall', featured: false, room: 'sideGalleryA' },
    { id: 'selfPortrait', title: 'SELF PORTRAIT', subtitle: 'acrylic on canvas', photoKey: 'selfPortrait', aspectRatio: 505 / 400, kind: 'wall', featured: true, room: 'mainGallery' },
    { id: 'garyFischer', title: "'GARY FISCHER'", subtitle: 'india ink on paper', photoKey: 'bike', aspectRatio: 310 / 400, kind: 'wall', featured: false, room: 'sideGalleryA' },
    { id: 'theFish', title: "'THE FISH'", subtitle: 'linoleum print', photoKey: 'linoPrint', aspectRatio: 527 / 400, kind: 'wall', featured: false, room: 'sideGalleryB' },
    // the one piece with no backing photo (see PHOTO_BY_TITLE) -- a real
    // sculpture, displayed the way a sculpture actually is (pedestal +
    // placard), not forced into a wall frame it doesn't have a photo for.
    { id: 'organicTV', title: 'ORGANIC TV', subtitle: 'cast iron · lost wax', photoKey: null, aspectRatio: null, kind: 'pedestal', featured: true, room: 'courtyard' },
    { id: 'puppetHead', title: 'PUPPET HEAD', subtitle: 'wire & tissue paper', photoKey: 'puppet', aspectRatio: 546 / 400, kind: 'wall', featured: false, room: 'sideGalleryB' },
    { id: 'vitalsage', title: 'VITALSAGE', subtitle: 'wordpress build, 2024', photoKey: 'vitalsage', aspectRatio: 204 / 400, kind: 'wall', featured: false, room: 'upperGallery' },
    { id: 'brandyoupromo', title: 'BRANDYOUPROMO', subtitle: 'asp.net site, 2022', photoKey: 'brandyou', aspectRatio: 217 / 400, kind: 'wall', featured: false, room: 'upperGallery' },
];

// a real museum wall placard with caller-chosen text -- addMuseumPlacard
// already exists but always rolls its OWN random education/employment
// text internally; this is the same physical object (post + angled
// plate) with the gallery's actual title/subtitle instead.
function addGalleryPlacard(x, z, facingRotY, title, subtitle) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), 0.008),
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 })
    );
    post.position.y = 0.55;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8e2d0';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#201c18';
        ctx.textAlign = 'center';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2 - 3, w - 6);
        ctx.font = '7px "Courier New", monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 9, w - 6);
    }, 96, 32);
    const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.17),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.3 })
    );
    plate.rotation.x = -0.3;
    plate.position.set(0, 1.05, 0.02);
    g.add(post, plate);
    g.rotation.y = facingRotY;
    g.position.set(x, 0, z);
    scene.add(g);
}

// a real-aspect-ratio framed panel -- unlike buildPhotoPosterMesh's fixed
// 128x168 "postcard" (built for the generic city-wide content-card
// scatter, one uniform shape for every category), this sizes the canvas
// to the ACTUAL image's own aspect ratio (a thin fixed-height caption
// strip below is the only addition), so a wide piece reads wide and a
// tall piece reads tall -- "preserves aspect ratio" for real, not just
// letterboxed inside a uniform frame.
function buildGalleryArtPanel(img, x, y, z, rotY, widthUnits, title, subtitle) {
    const imgAspect = img.height / img.width; // measured from the real file, not guessed
    const canvasW = 256;
    const imgAreaH = Math.round(canvasW * imgAspect);
    const captionH = 34;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW; canvas.height = imgAreaH + captionH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f2ede0';
    ctx.fillRect(0, 0, canvasW, canvas.height);
    ctx.drawImage(img, 0, 0, canvasW, imgAreaH);
    ctx.fillStyle = '#201c18';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText(title, canvasW / 2, imgAreaH + 17, canvasW - 10);
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText(subtitle, canvasW / 2, imgAreaH + 29, canvasW - 10);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const heightUnits = widthUnits * (canvas.height / canvasW);
    mountStandoffPanel(x, y, z, rotY, widthUnits, heightUnits, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    return heightUnits;
}

// mounts one catalog piece on the INSIDE face of a real exterior
// FacadeSurface -- same occupancy manager (findFreeFacadeRect/
// pointOnFacade) everything else in the city uses, just with a small
// NEGATIVE outward offset (mounts against the wall's inner face) and
// rotY flipped 180 deg from the facade's own outward normal, so the
// piece hangs facing INTO the room instead of out at the street the way
// every other faca de-mounted object in this codebase does. Returns
// true if it found real wall space; false (never a silent overlap) if
// the facade was already full.
// keyed by photoKey -- mirrors pendingPhotoPlacements' exact pattern
// (see loadPhoto) for the same reason: facade occupancy has to be
// reserved NOW, synchronously, during layout, but the real photo is
// still an in-flight network Image() that may resolve later. Reserving
// with the catalog's own pre-measured aspectRatio means the real mesh
// -- built the moment the photo actually loads, via loadPhoto's
// onload -- always exactly fills the space already carved out for it.
const pendingGalleryPanels = {};
function mountGalleryPiece(facade, vLo, vHi, piece) {
    const width = piece.featured ? randRange(1.5, 1.9) : randRange(0.85, 1.15);
    const height = width * piece.aspectRatio + width * 0.14; // + the caption strip's real share of the panel -- rounded UP from buildGalleryArtPanel's true ~0.133 so the reservation is never smaller than the real mesh
    const spot = findFreeFacadeRect(facade, 'galleryArt', width, height, vLo, vHi, 10, 0.15);
    if (!spot) return false;
    const p = pointOnFacade(facade, spot.u, spot.v, -0.06); // negative -- inside face, not the street face
    const rotY = facade.rotY + Math.PI; // faces into the room
    const img = photoImages[piece.photoKey];
    if (img) buildGalleryArtPanel(img, p.x, p.y, p.z, rotY, width, piece.title, piece.subtitle);
    else (pendingGalleryPanels[piece.photoKey] ??= []).push({ x: p.x, y: p.y, z: p.z, rotY, widthUnits: width, title: piece.title, subtitle: piece.subtitle });
    return true;
}

function buildArtGallery(site) {
    const { cells, id, signatureInstance } = site;
    const typeCfg = CONFIG.signatureBuildings.artGallery;
    const floorHeight = 3.0;
    const floorCount = 2; // ground + upper gallery -- "2 full floors", spec section ART GALLERY SITE
    const color = 0xe8e2d0; // quiet gallery cream -- off CONFIG.buildings.palette on purpose, plain (no window-grid texture)
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
    const buildingContext = { wealth: 0.8, maintenance: 0.95 }; // only feeds addRooftopClutter/curb now -- interior dressing is fully authored below
    const streetSetback = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.2);

    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }

    // courtyard -- same eligibility rule addBuildingSite uses (a non-
    // primary cell fully enclosed by this site's own cells), so a real
    // exterior void only ever appears where the maze topology actually
    // supports one, never forced.
    let voidCell = null;
    if (cells.length >= 5) {
        for (const c of cells) {
            if (c === primary) continue;
            if (degreeOf(c) === 4) { voidCell = c; break; }
        }
    }
    const buildCells = cells.filter(c => !voidCell || c.row !== voidCell.row || c.col !== voidCell.col);

    // room graph: authored ROLES, procedurally assigned to whichever
    // cells this seed's maze actually granted. mainGallery is always the
    // best-connected cell (reads as the building's main volume); the
    // vestibule is whichever remaining cell touches the real mainEntrance
    // edge (falls back to nearest available); the service/rear cell
    // mirrors that against secondaryEntrance. Everything left over is a
    // side gallery, then overflow storage. Same relationships every time
    // -- vestibule -> mainGallery -> sideGalleries -> service -- even
    // though which physical cell plays which role changes per seed.
    const mainEntrance = signatureInstance.mainEntrance;
    const secondaryEntrance = signatureInstance.secondaryEntrance;
    const others0 = buildCells.filter(c => c !== primary);
    const vestibule = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[0] ?? primary;
    const others1 = others0.filter(c => c !== vestibule);
    const service = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - 1] ?? null;
    const others2 = others1.filter(c => c !== service);
    const sideGalleryA = others2[0] ?? null;
    const sideGalleryB = others2[1] ?? null;
    const storageExtras = others2.slice(2);

    const roleByCellKey = new Map();
    roleByCellKey.set(`${primary.row},${primary.col}`, 'mainGallery');
    roleByCellKey.set(`${vestibule.row},${vestibule.col}`, roleByCellKey.get(`${vestibule.row},${vestibule.col}`) ?? 'vestibule');
    if (service) roleByCellKey.set(`${service.row},${service.col}`, roleByCellKey.get(`${service.row},${service.col}`) ?? 'service');
    if (sideGalleryA) roleByCellKey.set(`${sideGalleryA.row},${sideGalleryA.col}`, 'sideGalleryA');
    if (sideGalleryB) roleByCellKey.set(`${sideGalleryB.row},${sideGalleryB.col}`, 'sideGalleryB');
    for (const c of storageExtras) roleByCellKey.set(`${c.row},${c.col}`, 'storage');

    // every buildCell gets the same real floor count -- see
    // addBuildingModule's siteFloorCounts: needed so 'internal' edges
    // between two gallery cells compute the right shared-connection
    // height, exactly like a generic multi-cell site.
    const floorCountByCellKey = new Map(buildCells.map(c => [`${c.row},${c.col}`, floorCount]));

    // whichever cell physically IS mainEntrance.cell/secondaryEntrance.cell
    // (independent of which ROLE it was assigned above) gets forced onto
    // that exact door side -- so the built door always lines up with the
    // edge reserveSignatureSites already committed to, regardless of
    // which role-assignment branch happened to pick that cell.
    const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
    const rectByCellKey = new Map();
    for (const cell of buildCells) {
        const isPrimaryCell = cell === primary;
        const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
            : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                : null;
        const rect = addBuildingModule(cell, {
            isPrimary: isPrimaryCell, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
            voidCell, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
        });
        rectByCellKey.set(`${cell.row},${cell.col}`, rect);
    }
    if (voidCell) buildCourtyardVoid(voidCell); // real exterior void -- pavers/benches/plants/light, see buildCourtyardVoid

    const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
    // ground-floor art band vs. upper-gallery band on the SAME facade
    // object -- makeFacade spans a module's FULL height (both floors),
    // not one FacadeSurface per floor, so "upstairs" vs "downstairs" here
    // is which vertical band of the one wall gets used, exactly like
    // findFreeFacadeRect already does for every other decoration pass.
    const groundBand = [0.35, floorHeight - 0.35];
    const upperBand = [floorHeight + 0.35, floorCount * floorHeight - 0.35];

    // hang every wall piece against its assigned room's real facade --
    // falls back to the main gallery's own wall (guaranteed to exist,
    // guaranteed street-facing) if the assigned room's cell doesn't
    // happen to have street exposure this seed, so a piece is never
    // silently dropped for a topology reason alone.
    const roomCellFor = { mainGallery: primary, vestibule, sideGalleryA, sideGalleryB, upperGallery: primary, service, storage: storageExtras[0] };
    let hung = 0, skipped = 0;
    for (const piece of ART_GALLERY_CATALOG) {
        if (piece.kind === 'pedestal') continue; // handled separately below
        const band = piece.room === 'upperGallery' ? upperBand : groundBand;
        const preferredCell = roomCellFor[piece.room] ?? primary;
        const candidateCells = [preferredCell, primary, vestibule, sideGalleryA, sideGalleryB].filter(Boolean);
        let placed = false;
        for (const cell of candidateCells) {
            for (const facade of facadesFor(cell)) {
                if (mountGalleryPiece(facade, band[0], band[1], piece)) { placed = true; break; }
            }
            if (placed) break;
        }
        placed ? hung++ : skipped++;
        if (!placed) console.warn(`[signature] ART GALLERY: no free wall found for "${piece.title}" -- skipped (never overlapped, never invented a second wall)`);
    }

    // the one sculpture -- a real pedestal model from the city-pack
    // (art_gallery/pedestal_*), an abstract cast-metal form on top (this
    // project has no literal 3D scan of the real piece, so this is
    // honestly a representative abstract shape, not a claim about its
    // real appearance), and a placard with its real title/subtitle.
    // Prefers the courtyard (a real sculpture-garden placement) and
    // falls back to the main gallery floor if this seed has no courtyard.
    {
        const organicTV = ART_GALLERY_CATALOG.find(p => p.id === 'organicTV');
        const target = voidCell ?? primary;
        const { x: tx, z: tz } = cellToWorld(target.col, target.row);
        const jitterR = voidCell ? (CELL / 2 - 1.1) : Math.min(rectByCellKey.get(`${target.row},${target.col}`)?.hwx ?? 2, rectByCellKey.get(`${target.row},${target.col}`)?.hwz ?? 2) * 0.5;
        const px = tx + randRange(-jitterR, jitterR), pz = tz + randRange(-jitterR, jitterR);
        placeCityAsset(pick(['art_gallery/pedestal_01', 'art_gallery/pedestal_02', 'art_gallery/pedestal_03', 'art_gallery/pedestal_04']), px, pz, randRange(0, Math.PI * 2));
        const sculpture = new THREE.Mesh(
            jitterGeometry(new THREE.TorusKnotGeometry(0.22, 0.075, 64, 8, 2, 3), 0.015),
            new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.55, metalness: 0.75 })
        );
        sculpture.position.set(px, 1.25, pz);
        sculpture.rotation.set(randRange(0, Math.PI), randRange(0, Math.PI), 0);
        scene.add(sculpture);
        addGalleryPlacard(px + 0.55, pz + 0.35, randRange(0, Math.PI * 2), organicTV.title, organicTV.subtitle);
        console.log(`[signature] ART GALLERY: "${organicTV.title}" on pedestal in ${voidCell ? 'the courtyard' : 'the main gallery'}`);
    }

    // reception desk + a bench -- vestibule reads as an entry sequence,
    // not just another empty room (spec: "deliberate entrance sequence").
    {
        const { x: vx, z: vz } = cellToWorld(vestibule.col, vestibule.row);
        addBench(vx + randRange(-1, 1), vz + randRange(-1, 1), randRange(0, Math.PI * 2));
    }
    // benches in the main gallery -- somewhere to sit and look, same as
    // any real gallery's main hall.
    {
        const { x: mx, z: mz } = cellToWorld(primary.col, primary.row);
        const mr = rectByCellKey.get(`${primary.row},${primary.col}`);
        addBench(mx + randRange(-((mr?.hwx ?? 2) * 0.5), (mr?.hwx ?? 2) * 0.5), mz + randRange(-((mr?.hwz ?? 2) * 0.5), (mr?.hwz ?? 2) * 0.5), randRange(0, Math.PI * 2));
    }
    // roof terrace on the main gallery -- benches + plants on top of the
    // real roof deck addBuildingModule already registered (stair core
    // reaches it the same way it does on every 2+-floor module).
    {
        const { x: rx, z: rz } = cellToWorld(primary.col, primary.row);
        const roofY = floorCount * floorHeight;
        const mr = rectByCellKey.get(`${primary.row},${primary.col}`);
        const rhw = Math.min(mr?.hwx ?? 2, mr?.hwz ?? 2) * 0.6;
        addPottedPlant(rx + rhw, rz + rhw * 0.3);
        addPottedPlant(rx - rhw, rz - rhw * 0.3);
        addBench(rx + rhw * 0.3, rz - rhw * 0.5, randRange(0, Math.PI * 2));
        console.log(`[signature] ART GALLERY: roof terrace at y=${roofY.toFixed(1)} above the main gallery`);
    }

    // identity facade -- ART GALLERY marquee at the real main entrance,
    // on the vestibule's own street wall (not a random facade).
    const e = mainEntrance;
    const vestFacade = facadesFor(vestibule)[0] ?? facadesFor(primary)[0];
    if (vestFacade) {
        const spot = findFreeFacadeRect(vestFacade, 'sign', 3.0, 1.1, floorCount * floorHeight - 1.6, floorCount * floorHeight - 0.3, 6, 0.1);
        if (spot) {
            const p = pointOnFacade(vestFacade, spot.u, spot.v);
            addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xffffff, false, 3.0, { w: 120, h: 48 });
        } else {
            addSign(e.doorX, floorCount * floorHeight - 0.9, e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xffffff, false, 3.0, { w: 120, h: 48 });
        }
    }
    // poster cases either side of the door -- required exterior element
    // (spec: "poster cases"). Reuses the same wall poster primitive
    // everything else in the city does, just for real gallery content
    // instead of noise -- a second, small, street-facing preview of a
    // couple of the pieces actually inside.
    if (vestFacade) {
        for (const piece of [ART_GALLERY_CATALOG[0], ART_GALLERY_CATALOG[3]]) {
            const spot = findFreeFacadeRect(vestFacade, 'posterCase', 0.7, 0.9, 1.0, 2.0, 6, 0.12);
            if (spot) {
                const p = pointOnFacade(vestFacade, spot.u, spot.v);
                addWallPoster(p.x, p.y, p.z, vestFacade.rotY, piece.title, piece.subtitle);
            }
        }
    }

    console.log(`[signature] ART GALLERY: built ${buildCells.length} modules (courtyard=${!!voidCell}), ${hung}/${ART_GALLERY_CATALOG.filter(p => p.kind !== 'pedestal').length} wall pieces hung${skipped ? `, ${skipped} skipped (no free wall)` : ''}, 1 pedestal piece, roof terrace active`);
}

// ============================================================
// AS/400 ARCHIVE -- authored signature location #2.
// ============================================================
// PUBLIC TECHNICAL KNOWLEDGE ONLY -- every fact below is well-documented
// public IBM i/AS-400 platform history and terminology (product
// lineage, CL command names, architecture concepts). None of it is
// company-specific, none of it is credentials/internal-systems/GAL
// implementation detail -- this is a public website.
const AS400_CONTENT = {
    // real product lineage -- System/38's single-level-store/integrated-
    // database architecture is the actual throughline every rename since
    // has kept running underneath.
    lineage: [
        ['SYSTEM/38', '1978 -- introduced the single-level store & integrated database this whole lineage still runs on'],
        ['AS/400', '1988 -- System/38 and System/36 unified into one machine'],
        ['ISERIES', '2000 rebrand -- same OS lineage, eServer branding era'],
        ['SYSTEM I', '2006 rebrand'],
        ['IBM I', '2008 -- current name; same underlying architecture throughout'],
    ],
    // CL commands -- real, well-known, generic (never a company's actual
    // job/library/object names).
    commands: [
        ['WRKACTJOB', 'work with active jobs'],
        ['WRKOBJ', 'work with objects'],
        ['WRKLIB', 'work with libraries'],
        ['WRKSPLF', 'work with spooled files'],
        ['DSPJOB', 'display job'],
        ['DSPMSG', 'display messages'],
        ['DSPOBJD', 'display object description'],
        ['DSPFD', 'display file description'],
        ['DSPPGMREF', 'display program references'],
        ['CRTLIB', 'create library'],
        ['CRTBNDRPG', 'create bound RPG program'],
        ['CRTSQLRPGI', 'create SQL RPG ILE program'],
    ],
    // architecture/object-model concepts -- the library/object system,
    // languages, and runtime vocabulary. Real terminology, generic
    // definitions.
    concepts: [
        ['LIBRARY', 'a container object for other objects -- not a folder; an object of type *LIB'],
        ['OBJECT', 'everything on the system is a typed object (*PGM, *FILE, *LIB...) with attributes, not a raw byte stream'],
        ['DDS', 'Data Description Specifications -- fixed-format file/screen/printer-output layout definitions'],
        ['RPG', 'Report Program Generator -- the platform’s dominant business-logic language, still actively developed'],
        ['CL', 'Control Language -- the shell/scripting language for job & system control'],
        ['ILE', 'Integrated Language Environment -- lets RPG/COBOL/C/CL modules bind into one program'],
        ['JOB', 'the unit of work the OS schedules & tracks -- interactive, batch, or autostart'],
        ['SUBSYSTEM', 'a runtime environment controlling how jobs are routed & given resources'],
        ['MESSAGE QUEUE', 'how jobs/programs communicate & how operators are notified'],
        ['SPOOL FILE', 'print output held on the system before/instead of printing'],
        ['DB2 FOR I', 'the integrated relational database -- built into the OS, not a separate product'],
        ['QSYS2', 'SQL services library -- system information exposed as queryable views'],
        ['IFS', 'Integrated File System -- a Unix-like hierarchical filesystem layered over the object-based one'],
        ['JTOPEN', 'open-source Java toolbox for talking to IBM i from external programs'],
    ],
};

function buildAS400Archive(site) {
    const { cells, id, signatureInstance } = site;
    const typeCfg = CONFIG.signatureBuildings.as400Archive;
    const floorHeight = 3.0;
    const floorCount = Math.max(3, Math.min(4, typeCfg.preferredFloors || 4));
    const color = 0xc4bc9c; // institutional beige -- midrange-computing-building, not a startup office
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, side: THREE.DoubleSide });
    const buildingContext = { wealth: 0.55, maintenance: 0.7 };
    const streetSetback = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.2);

    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }

    const mainEntrance = signatureInstance.mainEntrance;
    const secondaryEntrance = signatureInstance.secondaryEntrance;
    const others0 = cells.filter(c => c !== primary);
    // vestibule/orientation lobby -- the cell touching the real
    // mainEntrance edge (spec: "ORIENTATION LOBBY" at street level).
    const orientation = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[0] ?? primary;
    // machine room annex -- the cell touching the secondary (service)
    // edge, a real rear/loading connection (spec: "SERVICE / LOADING").
    const others1 = others0.filter(c => c !== orientation);
    const machineRoom = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - 1] ?? primary;
    const remaining = others1.filter(c => c !== machineRoom);

    const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
    const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
    const rectByCellKey = new Map();
    for (const cell of cells) {
        const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
            : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                : null;
        const rect = addBuildingModule(cell, {
            isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
            voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
        });
        rectByCellKey.set(`${cell.row},${cell.col}`, rect);
    }

    const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
    const bandFor = (fl) => [fl * floorHeight + 0.3, (fl + 1) * floorHeight - 0.3];
    const RACK_MODELS = ['as400_archive/equipment_rack_01', 'as400_archive/equipment_rack_02', 'as400_archive/equipment_rack_03', 'as400_archive/equipment_rack_04'];
    const TERMINAL_MODELS = ['as400_archive/crt_terminal_01', 'as400_archive/crt_terminal_02', 'as400_archive/crt_terminal_03', 'as400_archive/crt_terminal_04', 'as400_archive/crt_terminal_05', 'as400_archive/crt_terminal_06'];
    const WORKSTATION_MODELS = ['as400_archive/workstation_01', 'as400_archive/workstation_02', 'as400_archive/workstation_03', 'as400_archive/workstation_04', 'as400_archive/workstation_05'];

    // FLOOR 0 -- orientation/history at the lobby (spec: "entry lobby,
    // timeline wall, object-model exhibit, intro terminals, reference
    // desk") + the machine room annex (spec: "visually memorable...
    // green-screen stations, racks, line printers, tape equipment").
    {
        const { x: ox, z: oz } = cellToWorld(orientation.col, orientation.row);
        addBench(ox + randRange(-1, 1), oz + randRange(-1, 1), randRange(0, Math.PI * 2));
        // each real lineage entry placed exactly ONCE -- tries every
        // orientation-cell facade in turn and stops at the first one with
        // room, instead of the earlier version's bug: looping the full
        // lineage list once per facade duplicated every entry onto every
        // street-facing wall this cell happened to have.
        let placedLineage = 0;
        const orientationFacades = facadesFor(orientation);
        for (const [name, desc] of AS400_CONTENT.lineage) {
            for (const facade of orientationFacades) {
                const spot = findFreeFacadeRect(facade, 'sign', 1.6, 0.55, ...bandFor(0), 6, 0.1);
                if (!spot) continue;
                const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, name, desc);
                placedLineage++;
                break;
            }
        }
        // intro terminals -- real CRT props, real early object-model facts
        for (let i = 0; i < 2; i++) {
            placeCityAsset(pick(TERMINAL_MODELS), ox + randRange(-1.2, 1.2), oz + randRange(-1.2, 1.2), randRange(0, Math.PI * 2), { y: 0 });
        }
        const [objTitle, objDesc] = AS400_CONTENT.concepts[1]; // 'OBJECT'
        addGalleryPlacard(ox + 0.6, oz - 0.6, randRange(0, Math.PI * 2), objTitle, objDesc);
        console.log(`[signature] AS/400 ARCHIVE: orientation lobby -- ${placedLineage}/${AS400_CONTENT.lineage.length} lineage panels hung`);
    }
    {
        const { x: mx, z: mz } = cellToWorld(machineRoom.col, machineRoom.row);
        const mr = rectByCellKey.get(`${machineRoom.row},${machineRoom.col}`);
        const jr = Math.min(mr?.hwx ?? 2, mr?.hwz ?? 2) * 0.6;
        const machineModels = [...RACK_MODELS, 'as400_archive/line_printer_01', 'as400_archive/line_printer_02', 'as400_archive/tape_drive_01', 'as400_archive/tape_drive_02', 'as400_archive/disk_unit_01', 'as400_archive/operator_console_01'];
        for (const modelId of machineModels) {
            placeCityAsset(modelId, mx + randRange(-jr, jr), mz + randRange(-jr, jr), randRange(0, Math.PI * 2), { y: 0 });
        }
        addGalleryPlacard(mx, mz + jr * 0.7, randRange(0, Math.PI * 2), 'MACHINE ROOM', 'real hardware, real heat -- keep clear of the racks');
        console.log(`[signature] AS/400 ARCHIVE: machine room -- ${machineModels.length} real hardware props placed`);
    }

    // FLOOR 1 -- reference library (spec: "library stacks, reading
    // tables, reference terminals, diagram walls"). Sections: libraries,
    // objects, files, DDS, RPG, CL, ILE, jobs, subsystems, message
    // queues, spool -- one diagram-wall panel per concept, spread across
    // every module's facade on this floor's band.
    let libraryHung = 0;
    if (floorCount > 1) {
        const libraryCells = [primary, orientation, machineRoom, ...remaining];
        let ci = 0;
        for (const [term, desc] of AS400_CONTENT.concepts) {
            let placed = false;
            for (let attempt = 0; attempt < libraryCells.length && !placed; attempt++) {
                const cell = libraryCells[(ci + attempt) % libraryCells.length];
                for (const facade of facadesFor(cell)) {
                    const spot = findFreeFacadeRect(facade, 'sign', 1.5, 0.6, ...bandFor(1), 6, 0.1);
                    if (!spot) continue;
                    const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                    addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, term, desc);
                    placed = true;
                    break;
                }
            }
            if (placed) { libraryHung++; ci++; }
        }
        const { x: px, z: pz } = cellToWorld(primary.col, primary.row);
        for (let i = 0; i < 3; i++) placeCityAsset(pick(['as400_archive/binder_shelf_01', 'as400_archive/binder_shelf_02', 'as400_archive/binder_shelf_03']), px + randRange(-1.6, 1.6), pz + randRange(-1.6, 1.6), randRange(0, Math.PI * 2), { y: floorHeight });
    }
    console.log(`[signature] AS/400 ARCHIVE: reference library -- ${libraryHung}/${AS400_CONTENT.concepts.length} concept panels hung`);

    // FLOOR 2 -- terminal lab (spec: "rows of terminals... readable
    // terminal pages about WRKACTJOB, WRKOBJ..."). addTerminalPlaque is
    // the real green-phosphor CRT-styled readable page primitive already
    // in this codebase -- exactly the right object for this room.
    let commandsHung = 0;
    if (floorCount > 2) {
        const labCells = [primary, orientation, machineRoom, ...remaining];
        let ci = 0;
        for (const [cmd, desc] of AS400_CONTENT.commands) {
            let placed = false;
            for (let attempt = 0; attempt < labCells.length && !placed; attempt++) {
                const cell = labCells[(ci + attempt) % labCells.length];
                for (const facade of facadesFor(cell)) {
                    const spot = findFreeFacadeRect(facade, 'sign', 1.9, 0.71, ...bandFor(2), 6, 0.1);
                    if (!spot) continue;
                    const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                    addTerminalPlaque(p.x, p.y, p.z, facade.rotY + Math.PI, cmd, desc);
                    placed = true;
                    break;
                }
            }
            if (placed) { commandsHung++; ci++; }
        }
        const { x: px, z: pz } = cellToWorld(primary.col, primary.row);
        for (let i = 0; i < 4; i++) {
            const modelId = rng() < 0.5 ? pick(TERMINAL_MODELS) : pick(WORKSTATION_MODELS);
            placeCityAsset(modelId, px + randRange(-1.8, 1.8), pz + randRange(-1.8, 1.8), randRange(0, Math.PI * 2), { y: floorHeight * 2 });
        }
    }
    console.log(`[signature] AS/400 ARCHIVE: terminal lab -- ${commandsHung}/${AS400_CONTENT.commands.length} command pages hung, real terminal/workstation props on floor`);

    // roof -- antenna, dish, small equipment hut (spec: "no giant
    // tower"). addRooftopClutter (called unconditionally by
    // addBuildingModule, even in signatureMode) already supplies generic
    // HVAC-scale clutter; this adds the specific antenna/dish silhouette
    // the spec calls for.
    {
        const { x: rx, z: rz } = cellToWorld(primary.col, primary.row);
        const roofY = floorCount * floorHeight;
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.5, metalness: 0.7 })
        );
        mast.position.set(rx - 0.8, roofY + 1.1, rz - 0.8);
        scene.add(mast);
        const dish = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
            new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })
        );
        dish.rotation.x = Math.PI * 0.62;
        dish.position.set(rx + 0.9, roofY + 0.6, rz + 0.7);
        scene.add(dish);
        console.log(`[signature] AS/400 ARCHIVE: roof antenna/dish at y=${roofY.toFixed(1)}`);
    }

    // identity facade
    const vestFacade = facadesFor(orientation)[0] ?? facadesFor(primary)[0];
    if (vestFacade) {
        const spot = findFreeFacadeRect(vestFacade, 'sign', 3.4, 1.3, floorCount * floorHeight - 1.8, floorCount * floorHeight - 0.3, 6, 0.1);
        const e = mainEntrance;
        if (spot) {
            const p = pointOnFacade(vestFacade, spot.u, spot.v);
            addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0x3aff6a, false, 3.4, { w: 120, h: 48 });
        } else {
            addSign(e.doorX, floorCount * floorHeight - 0.9, e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0x3aff6a, false, 3.4, { w: 120, h: 48 });
        }
    }

    console.log(`[signature] AS/400 ARCHIVE: built ${cells.length} modules, ${floorCount} floors, orientation+machine room+library+terminal lab all populated`);
}

// ============================================================
// JUSTIN BROWN INDEX -- authored signature location #3.
// ============================================================
// "EVERYTHING IS QUERYABLE. FINDABLE IS DIFFERENT." -- reuses the
// project's own real, already-sourced identity-noise data (CONFIG.
// billboards.decoyIdentities/systemNoise -- the real Census surname +
// SSA first-name frequency estimate is already documented right there
// in CONFIG, see its own comment) instead of inventing new fake
// records. The building's job is to bury that real data in real
// abundance -- dense stacks, repeated across floors -- not to invent
// a single new decoy string. This does NOT touch the separate,
// pre-existing "one true signal" system (the actual signal + its
// near-misses are placed at the maze's farthest dead ends, unrelated
// to where this building lands) -- the Index is the SEARCH EXPERIENCE
// made architectural, not a relocation of the one real answer.
function buildJustinIndex(site) {
    const { cells, id, signatureInstance } = site;
    const typeCfg = CONFIG.signatureBuildings.justinIndex;
    const floorHeight = 3.0;
    const floorCount = Math.max(4, Math.min(6, typeCfg.preferredFloors || 5));
    const color = 0xa8a290; // dull bureaucratic gray-tan -- a records bureau, not a startup
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, side: THREE.DoubleSide });
    const buildingContext = { wealth: 0.45, maintenance: 0.55 };
    const streetSetback = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.2);

    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }

    const mainEntrance = signatureInstance.mainEntrance;
    const secondaryEntrance = signatureInstance.secondaryEntrance;
    const others0 = cells.filter(c => c !== primary);
    const lobby = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[0] ?? primary;
    const others1 = others0.filter(c => c !== lobby);
    const rearStacks = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - 1] ?? primary;
    const deepStacks = others1.filter(c => c !== rearStacks);
    const allStackCells = [primary, ...deepStacks, rearStacks];

    const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
    const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
    const rectByCellKey = new Map();
    for (const cell of cells) {
        const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
            : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                : null;
        const rect = addBuildingModule(cell, {
            isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
            voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
        });
        rectByCellKey.set(`${cell.row},${cell.col}`, rect);
    }

    const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
    const bandFor = (fl) => [fl * floorHeight + 0.3, (fl + 1) * floorHeight - 0.3];
    const CABINET_MODELS = ['interior/cabinet_01', 'interior/cabinet_02', 'interior/cabinet_03', 'interior/cabinet_04'];
    const SHELF_MODELS = ['interior/shelf_01', 'interior/shelf_02', 'interior/shelf_03', 'interior/shelf_04', 'interior/shelf_05'];
    const LOCKER_MODELS = ['interior/locker_bank_01', 'interior/locker_bank_02', 'interior/locker_bank_03', 'interior/locker_bank_04'];

    // real decoy/noise content pools -- the hand-curated entries only
    // (never the deterministic flavorWords-style cross-join elsewhere in
    // CONFIG, which exists for THAT system's own density, not this one).
    // Cycled with modulo, not consumed -- "abundance" means the same
    // real decoy legitimately appears more than once across floors, the
    // way a real index has duplicate/near-duplicate records.
    const decoyPool = CONFIG.billboards.decoyIdentities;
    const noisePool = CONFIG.billboards.systemNoise.slice(0, 12); // the curated set -- see CONFIG's own comment on where the cross-join starts
    let decoyIdx = 0, noiseIdx = 0;
    const nextDecoy = () => decoyPool[decoyIdx++ % decoyPool.length];
    const nextNoise = () => noisePool[noiseIdx++ % noisePool.length];

    // records lobby -- public counter + reception furniture + the real
    // "3,529" figure right at the door, the same way any records office
    // posts its own throughput/backlog numbers.
    {
        const { x: lx, z: lz } = cellToWorld(lobby.col, lobby.row);
        placeCityAsset(pick(['interior/desk_01', 'interior/desk_02', 'interior/desk_03', 'interior/desk_04']), lx, lz, randRange(0, Math.PI * 2), { y: 0 });
        placeCityAsset(pick(['interior/chair_01', 'interior/chair_02', 'interior/chair_03']), lx + 0.6, lz + 0.4, randRange(0, Math.PI * 2), { y: 0 });
        const [t0, s0] = decoyPool[decoyPool.length - 1]; // 'JUSTIN BROWN' / 'see also: 3,529 others' -- the real headline figure
        addGalleryPlacard(lx - 0.7, lz - 0.6, randRange(0, Math.PI * 2), t0, s0);
        let hung = 0;
        for (const facade of facadesFor(lobby)) {
            for (let i = 0; i < 2; i++) {
                const [t, s] = nextNoise();
                const spot = findFreeFacadeRect(facade, 'sign', 1.6, 0.55, ...bandFor(0), 6, 0.1);
                if (!spot) break;
                const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, t, s);
                hung++;
            }
        }
        console.log(`[signature] JUSTIN BROWN INDEX: records lobby -- reception + ${hung} system-noise panels`);
    }

    // deep record stacks -- dense cabinets/shelves across every non-
    // lobby cell's ground floor, each row labeled with a real decoy
    // identity. This is the actual "signal hidden by abundance" bit:
    // lots of real, similarly-styled J. BROWN records, none of them him.
    let stackLabels = 0, stackFixtures = 0;
    for (const cell of allStackCells) {
        const { x: cx, z: cz } = cellToWorld(cell.col, cell.row);
        const r = rectByCellKey.get(`${cell.row},${cell.col}`);
        const hw = Math.min(r?.hwx ?? 2, r?.hwz ?? 2);
        const rowCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < rowCount; i++) {
            const modelId = rng() < 0.5 ? pick(CABINET_MODELS) : pick(SHELF_MODELS);
            const px = cx + randRange(-hw * 0.7, hw * 0.7), pz = cz + randRange(-hw * 0.7, hw * 0.7);
            placeCityAsset(modelId, px, pz, randRange(0, Math.PI * 2), { y: 0 });
            stackFixtures++;
            if (rng() < 0.7) {
                const [t, s] = nextDecoy();
                addGalleryPlacard(px + 0.4, pz + 0.3, randRange(0, Math.PI * 2), t, s);
                stackLabels++;
            }
        }
    }
    console.log(`[signature] JUSTIN BROWN INDEX: deep stacks -- ${stackFixtures} cabinets/shelves across ${allStackCells.length} rooms, ${stackLabels} real decoy records labeled`);

    // upper floors -- "active records" (floor 1), "older archive /
    // microfiche" (floor 2), "deep storage" (floor 3+) -- same real
    // decoy/noise pools, cycling further into them per floor (the
    // pools repeat well before the building runs out of floors, which
    // is honest: a real index has duplicate-looking records too).
    let upperHung = 0;
    for (let fl = 1; fl < floorCount; fl++) {
        const useDecoy = fl % 2 === 1; // alternate themes floor-to-floor
        for (const cell of [primary, lobby, rearStacks, ...deepStacks]) {
            for (const facade of facadesFor(cell)) {
                const [t, s] = useDecoy ? nextDecoy() : nextNoise();
                const spot = findFreeFacadeRect(facade, 'sign', 1.6, 0.55, ...bandFor(fl), 6, 0.1);
                if (!spot) continue;
                const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                addWallPoster(p.x, p.y, p.z, facade.rotY + Math.PI, t, s);
                upperHung++;
            }
        }
        // a locker bank per floor in the primary shaft -- narrower aisles
        // reads as "deeper into the archive" the higher you climb.
        const { x: px, z: pz } = cellToWorld(primary.col, primary.row);
        placeCityAsset(pick(LOCKER_MODELS), px + randRange(-1, 1), pz + randRange(-1, 1), randRange(0, Math.PI * 2), { y: fl * floorHeight });
    }
    console.log(`[signature] JUSTIN BROWN INDEX: ${floorCount - 1} upper floors -- ${upperHung} real decoy/noise panels hung, deeper into the stacks per floor`);

    // identity facade
    const vestFacade = facadesFor(lobby)[0] ?? facadesFor(primary)[0];
    if (vestFacade) {
        const spot = findFreeFacadeRect(vestFacade, 'sign', 3.4, 1.3, floorCount * floorHeight - 1.8, floorCount * floorHeight - 0.3, 6, 0.1);
        const e = mainEntrance;
        if (spot) {
            const p = pointOnFacade(vestFacade, spot.u, spot.v);
            addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xd8d8d8, false, 3.4, { w: 120, h: 48 });
        } else {
            addSign(e.doorX, floorCount * floorHeight - 0.9, e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xd8d8d8, false, 3.4, { w: 120, h: 48 });
        }
    }

    console.log(`[signature] JUSTIN BROWN INDEX: built ${cells.length} modules, ${floorCount} floors -- lobby+search hall+deep stacks all populated, ${allStackCells.length + 2} internally-connected rooms give real multiple routes`);
}

// ============================================================
// SYSTEMS WORKSHOP -- authored signature location #4.
// ============================================================
// Looks USED, not curated -- an irregular industrial compound, not a
// museum. Real content where it exists: CONFIG.siteContent.codeProjects
// (his actual documented builds -- TRAFFIC BLASTER, CYBERDECK, EMP
// GENERATOR, MC COMPUTER...) gets a genuine home in the computer-lab
// corner instead of floating on a random building elsewhere in the
// city, the same "give real content a real room" move the Art Gallery
// and AS/400 Archive already made.
function buildSystemsWorkshop(site) {
    const { cells, id, signatureInstance } = site;
    const typeCfg = CONFIG.signatureBuildings.systemsWorkshop;
    const floorHeight = 3.0;
    const floorCount = Math.max(2, Math.min(3, typeCfg.preferredFloors || 2));
    const color = 0x9a9484; // grimy concrete/beige -- used, not showroom
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
    const buildingContext = { wealth: 0.35, maintenance: 0.4 }; // low maintenance -- reads lived-in, not polished
    const streetSetback = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax) / 2;
    const partySetback = randRange(0.08, 0.2);

    const degreeOf = (cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => siteIdOf[cell.row + dr]?.[cell.col + dc] === id).length;
    let primary = cells[0], primaryDegree = -1;
    for (const c of cells) { const d = degreeOf(c); if (d > primaryDegree) { primaryDegree = d; primary = c; } }

    const mainEntrance = signatureInstance.mainEntrance;
    const secondaryEntrance = signatureInstance.secondaryEntrance;
    const others0 = cells.filter(c => c !== primary);
    const frontShop = others0.find(c => c.row === mainEntrance.cell.row && c.col === mainEntrance.cell.col) ?? others0[0] ?? primary;
    const others1 = others0.filter(c => c !== frontShop);
    // rear yard/loading -- the cell touching the service edge (spec:
    // "REAR YARD" + "loading/service access").
    const rearYard = (secondaryEntrance && others1.find(c => c.row === secondaryEntrance.cell.row && c.col === secondaryEntrance.cell.col)) ?? others1[others1.length - 1] ?? primary;
    const remaining = others1.filter(c => c !== rearYard);
    const computerLab = remaining[0] ?? primary;
    const electronicsBench = remaining[1] ?? frontShop;

    const floorCountByCellKey = new Map(cells.map(c => [`${c.row},${c.col}`, floorCount]));
    const cellIs = (cell, edge) => edge && cell.row === edge.cell.row && cell.col === edge.cell.col;
    const rectByCellKey = new Map();
    for (const cell of cells) {
        const forceDoorSide = cellIs(cell, mainEntrance) ? { dc: mainEntrance.dc, dr: mainEntrance.dr }
            : cellIs(cell, secondaryEntrance) ? { dc: secondaryEntrance.dc, dr: secondaryEntrance.dr }
                : null;
        const rect = addBuildingModule(cell, {
            isPrimary: cell === primary, isWarehouse: false, floorCount, floorHeight, height: floorCount * floorHeight,
            color, material, buildingContext, streetSetbackX: streetSetback, streetSetbackZ: streetSetback, partySetback,
            voidCell: null, siteFloorCounts: floorCountByCellKey, signatureMode: true, forceDoorSide,
        });
        rectByCellKey.set(`${cell.row},${cell.col}`, rect);
    }

    const facadesFor = (cell) => cell && rectByCellKey.get(`${cell.row},${cell.col}`)?.streetFacades || [];
    const placeCluster = (cell, modelIds, count, yLevel = 0) => {
        const { x: cx, z: cz } = cellToWorld(cell.col, cell.row);
        const r = rectByCellKey.get(`${cell.row},${cell.col}`);
        const hw = Math.min(r?.hwx ?? 2, r?.hwz ?? 2) * 0.65;
        for (let i = 0; i < count; i++) {
            placeCityAsset(pick(modelIds), cx + randRange(-hw, hw), cz + randRange(-hw, hw), randRange(0, Math.PI * 2), { y: yLevel });
        }
    };

    // main workshop -- the primary cell, main fabrication bench + tool
    // wall + 3D printer area (spec: "main fabrication bench", "3D
    // printer area", "tool wall"). Clutter kept OFF the through-path by
    // biasing placement toward the edges (0.65 * halfwidth, not the
    // full footprint) rather than the exact center where foot traffic
    // actually crosses the room -- same "clutter belongs against
    // walls/in corners, not the walking line" rule the spec asks for.
    placeCluster(primary, ['systems_workshop/workbench_01', 'systems_workshop/workbench_02', 'systems_workshop/workbench_03', 'systems_workshop/workbench_04', 'systems_workshop/workbench_05'], 2, 0);
    placeCluster(primary, ['systems_workshop/pegboard_01', 'systems_workshop/pegboard_02', 'systems_workshop/pegboard_03', 'systems_workshop/pegboard_04'], 2, 0);
    placeCluster(primary, ['systems_workshop/3d_printer_01', 'systems_workshop/3d_printer_02', 'systems_workshop/3d_printer_03', 'systems_workshop/3d_printer_04'], 2, 0);
    placeCluster(primary, ['systems_workshop/tool_chest_01', 'systems_workshop/tool_chest_02', 'systems_workshop/tool_chest_03', 'systems_workshop/tool_chest_04'], 1, 0);

    // front shop -- street-facing, less dense (a real shop still needs a
    // walkable entry), a couple of tool chests and a parts rack.
    placeCluster(frontShop, ['systems_workshop/tool_chest_01', 'systems_workshop/tool_chest_02'], 1, 0);
    placeCluster(frontShop, ['systems_workshop/parts_rack_01', 'systems_workshop/parts_rack_02', 'systems_workshop/parts_rack_03'], 1, 0);

    // computer lab -- server bench + cable carts, and his real documented
    // code projects on the wall (addTerminalPlaque -- the same green-CRT
    // readable-page primitive the AS/400 Archive uses, appropriate here
    // too: this is a real computer-focused room).
    placeCluster(computerLab, ['systems_workshop/server_bench_01', 'systems_workshop/server_bench_02', 'systems_workshop/server_bench_03'], 2, 0);
    placeCluster(computerLab, ['systems_workshop/cable_cart_01', 'systems_workshop/cable_cart_02'], 1, 0);
    let codeHung = 0;
    for (const [title, subtitle] of CONFIG.siteContent.codeProjects) {
        let placed = false;
        for (const cell of [computerLab, primary, frontShop]) {
            for (const facade of facadesFor(cell)) {
                const spot = findFreeFacadeRect(facade, 'sign', 1.9, 0.71, 0.3, floorHeight - 0.3, 6, 0.1);
                if (!spot) continue;
                const p = pointOnFacade(facade, spot.u, spot.v, -0.05);
                addTerminalPlaque(p.x, p.y, p.z, facade.rotY + Math.PI, title, subtitle);
                placed = true;
                break;
            }
            if (placed) break;
        }
        if (placed) codeHung++;
    }

    // electronics bench -- solder stations + pegboard, a workbench.
    placeCluster(electronicsBench, ['systems_workshop/solder_station_01', 'systems_workshop/solder_station_02', 'systems_workshop/solder_station_03'], 2, 0);
    placeCluster(electronicsBench, ['systems_workshop/pegboard_01', 'systems_workshop/pegboard_02'], 1, 0);
    placeCluster(electronicsBench, ['systems_workshop/workbench_01', 'systems_workshop/workbench_02'], 1, 0);

    // rear yard/loading -- industrial props (generic `industrial`
    // category, not systems_workshop-exclusive -- a loading yard behind
    // an electronics shop plausibly has generic drums/cable spools/an
    // electrical cabinet, not more workbenches).
    placeCluster(rearYard, ['industrial/cable_spool_01', 'industrial/cable_spool_02', 'industrial/cable_spool_03', 'industrial/cable_spool_04'], 2, 0);
    placeCluster(rearYard, ['industrial/electrical_cabinet_01', 'industrial/electrical_cabinet_02'], 1, 0);
    placeCluster(rearYard, ['industrial/drum_cluster_01', 'industrial/drum_cluster_02', 'industrial/drum_cluster_03'], 1, 0);

    // mezzanine storage -- floor 1 (this building's upper floor) reads
    // as overflow storage, reached by the same real stair core every
    // multi-floor module gets (spec: "main floor -> utility stairs ->
    // mezzanine storage -> roof").
    if (floorCount > 1) {
        placeCluster(primary, ['systems_workshop/parts_rack_01', 'systems_workshop/parts_rack_02', 'systems_workshop/parts_rack_03'], 2, floorHeight);
        placeCluster(computerLab, ['interior/shelf_01', 'interior/shelf_02', 'interior/shelf_03'], 2, floorHeight);
    }

    // identity facade
    const vestFacade = facadesFor(frontShop)[0] ?? facadesFor(primary)[0];
    if (vestFacade) {
        const spot = findFreeFacadeRect(vestFacade, 'sign', 3.0, 1.1, floorCount * floorHeight - 1.4, floorCount * floorHeight - 0.3, 6, 0.1);
        const e = mainEntrance;
        if (spot) {
            const p = pointOnFacade(vestFacade, spot.u, spot.v);
            addSign(p.x, p.y, p.z, vestFacade.rotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xffa64d, false, 3.0, { w: 120, h: 48 });
        } else {
            addSign(e.doorX, floorCount * floorHeight - 0.9, e.doorZ, e.outwardRotY, typeCfg.exteriorName, typeCfg.exteriorSubtitle, 0xffa64d, false, 3.0, { w: 120, h: 48 });
        }
    }

    console.log(`[signature] SYSTEMS WORKSHOP: built ${cells.length} modules, ${floorCount} floors -- main workshop+front shop+computer lab+electronics bench+rear yard populated, ${codeHung}/${CONFIG.siteContent.codeProjects.length} real code projects on display`);
}

const SIGNATURE_BUILDERS = {
    artGallery: buildArtGallery,
    as400Archive: buildAS400Archive,
    justinIndex: buildJustinIndex,
    systemsWorkshop: buildSystemsWorkshop,
    loreShrine: buildSignaturePlaceholder,
};
function buildSignatureSite(site) {
    const builder = SIGNATURE_BUILDERS[site.signatureType] ?? buildSignaturePlaceholder;
    builder(site);
}

const candidateFaces = []; // real FacadeSurface objects that skipped a random sign — free for content cards (see mountContentCards)
// every real exterior wall in the generated city -- see makeFacade. Grows
// for the life of generation; nothing ever removes a FacadeSurface once
// its wall exists.
const buildingFacades = [];

// buildingFaceDefs (four cardinal faces re-derived from a bare hwx/hwz,
// with no idea which sides are real street walls vs. party/internal/
// courtyard edges) used to live here. Retired -- its one remaining
// caller (the forced "signal" sign) now selects an actual exposed
// FacadeSurface from `buildingFacades` instead (see below). This is
// exactly the kind of old-geometry assumption a refactor should not
// keep alive just to feed one leftover call site.

// style axes a sign rolls independently, so no two signs in the city
// necessarily share a look -- shape (canvas aspect), font family, border
// treatment/width/color, and backing tone all vary sign-to-sign instead
// of being one fixed look shared by every sign, same "push it hard"
// treatment the noise corpus got.
const SIGN_SHAPES = [
    { w: 96, h: 56 }, { w: 96, h: 72 }, { w: 72, h: 96 }, { w: 120, h: 48 }, { w: 108, h: 84 }, { w: 84, h: 108 },
];
const SIGN_FONTS = [
    '"Courier New", monospace', 'Consolas, monospace', '"Lucida Console", monospace',
    'Verdana, sans-serif', '"Arial Black", sans-serif', 'Georgia, serif',
];
const SIGN_BACKINGS = ['#020202', '#0a0410', '#04120a', '#12040a', '#0a0a02', '#080808'];
const SIGN_BORDER_STYLES = ['solid', 'double', 'cut', 'none'];

function addSign(x, y, z, rotY, title, subtitle, colorHex, flicker = false, widthOverride = null, shapeOverride = null, armLengthOverride = null) {
    // callers driving real facade occupancy (see placeSignsOnFacade) pass
    // the EXACT shape/spec that was already reserved -- rolling a fresh
    // one here independently is how the reserved footprint and the
    // rendered mesh used to disagree (same bug class as widthOverride
    // below, just on the aspect ratio instead of the width).
    const shape = shapeOverride ?? pick(SIGN_SHAPES);
    const font = pick(SIGN_FONTS);
    const backing = pick(SIGN_BACKINGS);
    const borderStyle = pick(SIGN_BORDER_STYLES);
    const borderWidth = randRange(1, 5);
    // ~1 in 3 borders use a contrasting accent instead of matching the
    // sign's own text/light color.
    const borderColorHex = rng() < 0.3 ? pick(CONFIG.neonPalette) : colorHex;

    const tex = makePixelTexture((ctx, w, h) => {
        const color = hexToCss(colorHex);
        ctx.fillStyle = backing;
        ctx.fillRect(0, 0, w, h);
        if (borderStyle !== 'none') {
            ctx.strokeStyle = hexToCss(borderColorHex);
            ctx.lineWidth = borderWidth;
            if (borderStyle === 'cut') { // chamfered/cut corners instead of a plain rectangle
                const c = Math.min(w, h) * 0.14;
                ctx.beginPath();
                ctx.moveTo(c, 1); ctx.lineTo(w - c, 1); ctx.lineTo(w - 1, c); ctx.lineTo(w - 1, h - c);
                ctx.lineTo(w - c, h - 1); ctx.lineTo(c, h - 1); ctx.lineTo(1, h - c); ctx.lineTo(1, c);
                ctx.closePath(); ctx.stroke();
            } else {
                ctx.strokeRect(borderWidth / 2, borderWidth / 2, w - borderWidth, h - borderWidth);
                if (borderStyle === 'double') {
                    ctx.lineWidth = Math.max(1, borderWidth * 0.5);
                    ctx.strokeRect(borderWidth * 2.2, borderWidth * 2.2, w - borderWidth * 4.4, h - borderWidth * 4.4);
                }
            }
        }
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        // font size is a fraction of canvas height, not a fixed px value,
        // so it stays proportioned across every shape in SIGN_SHAPES
        ctx.font = `bold ${Math.round(h * 0.32)}px ${font}`;
        ctx.fillText(title, w / 2, h / 2 - h * 0.08, w - 8);
        ctx.font = `${Math.round(h * 0.17)}px ${font}`;
        ctx.fillText(subtitle, w / 2, h / 2 + h * 0.24, w - 8);
    }, shape.w, shape.h);

    // callers driving real facade occupancy (see placeSignsOnFacade) pass
    // an explicit width sized to fit the actual free span they found --
    // "pick a size, then hope it fits" is how signs used to end up
    // stacked on top of each other.
    const width = widthOverride ?? randRange(1.5, 2.9);
    const height = width * (shape.h / shape.w);
    const panelDepth = randRange(0.06, 0.1);

    // projecting/blade-sign mount: a wall plate, a horizontal arm, and a
    // diagonal brace back to the wall -- reads as something load-bearing,
    // not a rod floating in space. Built in local space (everything
    // along local +Z, the group's own rotation.y = rotY carries it to
    // the wall's real outward direction, same pattern addSecurityCamera's
    // bracket already uses). The panel itself is a real box now, not a
    // flat plane -- metal edges on the 4 thin sides, the texture only on
    // the front/back faces -- rotated 90 deg off the wall's facing angle
    // so it reads to someone walking along the sidewalk, not just
    // someone standing dead-on in front of the wall. Both the front and
    // back faces carry the texture, so it still reads from either
    // approach direction.
    // matches createSignSpec's armLength when a caller drives real facade
    // occupancy -- the reserved world-space projection box
    // (armLength+width, see placeSignsOnFacade) has to describe the same
    // arm this mesh actually builds.
    const armLength = armLengthOverride ?? randRange(0.55, 1.0);
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, metalness: 0.6 });
    const g = new THREE.Group();

    const plate = new THREE.Mesh(skirtBoxGeo, bracketMat); // wall-mounted plate the arm actually anchors to
    plate.scale.set(0.16, 0.16, 0.03);
    plate.position.set(0, 0, 0.015);
    g.add(plate);

    const arm = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.03, 0.03, armLength, 5), 0.006),
        bracketMat
    );
    arm.rotation.x = Math.PI / 2; // long axis: local +Y -> local +Z
    arm.position.set(0, 0, armLength / 2);
    g.add(arm);

    // diagonal brace, wall (below the arm's pivot) to the arm's outer
    // tip -- the actual "why this doesn't just fall off the wall" detail
    // real projecting signs almost always have.
    const braceDrop = armLength * 0.55;
    const braceLen = Math.hypot(braceDrop, armLength);
    const brace = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.02, 0.02, braceLen, 5), 0.004),
        bracketMat
    );
    brace.rotation.x = Math.atan2(armLength, braceDrop);
    brace.position.set(0, -braceDrop / 2, armLength / 2);
    g.add(brace);

    // the sign's own "origin" is its near edge (the arm's tip, armLength
    // out from the wall) -- the panel is anchored there and extends
    // further outward by its own width, never the other way around. It
    // used to be centered ON the arm tip, so half its bulk could swing
    // back toward the wall and clip through it whenever width exceeded
    // 2x armLength (routine at the panel's larger random sizes). Anchoring
    // the near edge instead of the center makes "reaches past the wall,
    // never into it" true by construction, not by the luck of the roll.
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.5, metalness: 0.6 });
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const panel = new THREE.Mesh(skirtBoxGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat]);
    panel.scale.set(width, height, panelDepth);
    panel.rotation.y = Math.PI / 2; // perpendicular to the wall, not flush against it
    const panelCenterZ = armLength + width / 2;
    panel.position.set(0, 0, panelCenterZ);
    g.add(panel);

    g.rotation.y = rotY;
    g.position.set(x, y, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const sl = CONFIG.lighting.signLight;
        const light = new THREE.PointLight(colorHex, sl.intensity, sl.distance, sl.decay);
        light.position.set(
            x + Math.sin(rotY) * panelCenterZ,
            y,
            z + Math.cos(rotY) * panelCenterZ
        );
        scene.add(light);
        if (flicker) {
            flickerLights.push({ light, base: sl.intensity, phase: rng() * Math.PI * 2, speed: randRange(2, 5), mode: 'sine' });
        }
    }
}

// spray-paint scrawl near the ground — half bio-rhetoric, half the concept
// talking to itself. Irregular jitter per letter so it reads as vandalism,
// not signage.
const GRAFFITI_TAGS = [
    'U R HERE', 'SEARCH != FIND', 'STILL LOOKING?', 'NOBODY HOME',
    '404 LOVE', 'HE WAS HERE', 'MORE THAN ONE', 'ASK THE GUY',
    'NOT THIS ONE EITHER', 'KEEP WALKING', 'PUBLIC SECRET', 'UNBOUND',
    // The Great Book of 8gH — scrawled fragments of the same absurdist
    // personal mythology that names the codeProjects wall plaques below.
    'NO 5TH BUTTON', 'OPEN THE CASE', 'THE CYCLE KNOWS', 'JTHEWAY',
    'HEAT SHALL MOVE', 'WHO LEFT THIS OPEN', 'YES BUT HOW', 'REMOVE THE COVER',
    // the curated lines above are hand-written; everything below is a
    // deterministic cross-join (subject x predicate, no RNG -- can't
    // shift the maze's seeded layout) drawn straight from the same
    // mythology (The Great Book of 8gH) — a lot more scrawl, same voice.
    ...(() => {
        const subjects = [
            'THE CYCLE', 'THE FIFTH BUTTON', 'THE VISE', 'THE WORKBENCH', 'THE OPEN CASE',
            'THE COMPRESSOR', 'THE MAGNETRON', 'JTHEWAY', '8gH', 'THE SEALED BLACK BOX',
            'THE REVERSING VALVE', 'THE SIGNAL',
        ];
        const predicates = [
            'KNOWS', 'REMEMBERS', 'WAS HERE', 'NEVER SLEEPS', 'IS WATCHING',
            "WON'T ROTATE", 'REMAINS SEALED', 'ADMITS NOTHING', 'STILL COMPRESSING',
            'HAS NO FIFTH BUTTON', 'ASKS WHAT IT DOES', 'NEVER PLUGGED IN',
            'KEEPS NO RECORD', 'OPENED ANYWAY',
        ];
        const out = [];
        for (const s of subjects) for (const p of predicates) out.push(`${s} ${p}`);
        return out;
    })(),
    // a few thousand more, in a different voice -- found-poetry lines and
    // overheard fragments from the noise-poetry corpus (see
    // noise-data-poetry.js) instead of more hand-written mythology scrawl.
    // Natural case on purpose: these read as quoted/overheard, not another
    // spray tag, so the wall stops repeating itself long before a normal
    // session could exhaust it. Short-bucket only (<=40 chars) -- a tag
    // is scrawled in one breath, not an essay; the medium/long lines read
    // better on flyers/stickers, which have the physical space for them.
    ...POETRY_SHORT_NOISE,
];
// graffiti rolls its own look independently every time -- font family,
// weight/slant, size, and how much each letter jitters/rotates -- same
// "push it hard" style-variety treatment SIGN_FONTS gets for addSign,
// so two tags on the same wall don't read as the same hand.
const GRAFFITI_FONTS = [
    '"Courier New", monospace', 'Consolas, monospace', 'Impact, sans-serif',
    '"Comic Sans MS", cursive', 'Georgia, serif', '"Brush Script MT", cursive',
    'Verdana, sans-serif', '"Lucida Console", monospace',
];
const GRAFFITI_WEIGHTS = ['italic bold', 'bold', 'italic', 'normal'];
function addGraffitiTag(x, y, z, rotY) {
    const text = pick(GRAFFITI_TAGS);
    const colorHex = pick(CONFIG.neonPalette);
    const font = pick(GRAFFITI_FONTS);
    const weight = pick(GRAFFITI_WEIGHTS);
    const fontSize = Math.round(randRange(11, 17));
    const jitterAmp = randRange(1, 3.5);
    const rotAmp = randRange(0.04, 0.22);
    const texH = Math.max(28, Math.round(fontSize * 2.2));
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = hexToCss(colorHex) + 'cc';
        ctx.textAlign = 'left';
        ctx.font = `${weight} ${fontSize}px ${font}`;
        let cx = 4;
        const cy = h / 2 + randRange(-2, 2);
        for (const ch of text) {
            ctx.save();
            ctx.translate(cx, cy + randRange(-jitterAmp, jitterAmp));
            ctx.rotate(randRange(-rotAmp, rotAmp));
            ctx.fillText(ch, 0, 0);
            ctx.restore();
            cx += ctx.measureText(ch).width + randRange(-0.5, 1.5);
        }
    }, Math.max(64, Math.round(text.length * fontSize * 0.72)), texH);
    const width = randRange(0.9, 1.6);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * (texH / Math.max(64, text.length * fontSize * 0.72))),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.position.set(x, y, z);
    plane.rotation.y = rotY;
    scene.add(plane);
}

// a camera on a bracket, watching the alley — a small red LED blinks.
// everything queryable is also everything watched.
function addSecurityCamera(x, z, rotY, buildingHeight) {
    const y = randRange(2.6, Math.min(buildingHeight - 1, 5.5));
    const g = new THREE.Group();
    const bracket = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 5), 0.008),
        new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.5 })
    );
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(0, 0, 0.15);
    const body = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(0.12, 0.12, 0.24), 0.015),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.5 })
    );
    body.position.set(0, 0, 0.32);
    const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff2020 })
    );
    led.position.set(0, 0.05, 0.44);
    g.add(bracket, body, led);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xff2020, 0.6, 1.2, 2);
        light.position.set(
            x + Math.sin(rotY) * 0.44, y + 0.05, z + Math.cos(rotY) * 0.44
        );
        scene.add(light);
        flickerLights.push({ light, base: 0.6, phase: rng() * Math.PI * 2, speed: randRange(3, 6), mode: 'blink' });
    }
}

// rooftop silhouette clutter — antennas, water tanks, AC units — so the
// skyline reads as inhabited when glimpsed between buildings, not blank.
function addRooftopClutter(x, z, footprint, height, maintenance = 0.5) {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.7, metalness: 0.4 });
    // a neglected roof accumulates more of all of this over time than a
    // well-kept one -- one multiplier on every independent roll below,
    // rather than a separate correlated decision per fixture.
    const clutterMul = 1 + (1 - maintenance) * 0.7;
    const chance = (p) => Math.min(0.9, p * clutterMul);

    if (rng() < chance(0.35)) { // antenna
        const antenna = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.03, 0.03, randRange(1.5, 4), 5), 0.01), metalMat);
        antenna.position.set(x + randRange(-footprint / 3, footprint / 3), height + antenna.geometry.parameters.height / 2, z + randRange(-footprint / 3, footprint / 3));
        scene.add(antenna);
    }
    if (rng() < chance(0.25)) { // water tank
        const tank = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10), 0.08),
            new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.8 })
        );
        tank.position.set(x + randRange(-footprint / 4, footprint / 4), height + 0.55, z + randRange(-footprint / 4, footprint / 4));
        scene.add(tank);
    }
    if (rng() < chance(0.3)) { // AC/HVAC unit
        const ac = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(0.7, 0.4, 0.5), 0.03), metalMat);
        ac.position.set(x + randRange(-footprint / 3, footprint / 3), height + 0.2, z + randRange(-footprint / 3, footprint / 3));
        scene.add(ac);
    }
    // real building-services (MEP) detail beyond just an antenna/tank/AC
    // unit -- a duct run, a mushroom-cap exhaust vent, a standpipe riser,
    // a utility disconnect box. Every real flat roof has some of these;
    // this game's roofs had none of them.
    if (rng() < chance(0.3)) { // sheet-metal duct run, on short legs
        const ductLen = randRange(1.2, 2.4);
        const duct = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(ductLen, 0.35, 0.35), 0.02), metalMat);
        const dx = x + randRange(-footprint / 3, footprint / 3), dz = z + randRange(-footprint / 3, footprint / 3);
        duct.rotation.y = randRange(0, Math.PI * 2);
        duct.position.set(dx, height + 0.35, dz);
        scene.add(duct);
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), metalMat);
            leg.position.set(
                dx + Math.cos(duct.rotation.y) * side * (ductLen / 2 - 0.15), height + 0.1,
                dz - Math.sin(duct.rotation.y) * side * (ductLen / 2 - 0.15)
            );
            scene.add(leg);
        }
    }
    if (rng() < chance(0.4)) { // mushroom-cap exhaust vent
        const vent = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 8), 0.01), metalMat);
        const cap = new THREE.Mesh(jitterGeometry(new THREE.ConeGeometry(0.2, 0.12, 8), 0.008), metalMat);
        const vx = x + randRange(-footprint / 3, footprint / 3), vz = z + randRange(-footprint / 3, footprint / 3);
        vent.position.set(vx, height + 0.2, vz);
        cap.position.set(vx, height + 0.46, vz);
        scene.add(vent, cap);
    }
    if (rng() < chance(0.2)) { // standpipe/sprinkler riser -- a capped pipe with a valve wheel near the base
        const pipe = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), 0.006), metalMat);
        const px = x + randRange(-footprint / 3, footprint / 3), pz = z + randRange(-footprint / 3, footprint / 3);
        pipe.position.set(px, height + 0.45, pz);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10), new THREE.MeshStandardMaterial({ color: 0xc82020, roughness: 0.6 }));
        wheel.position.set(px, height + 0.25, pz);
        scene.add(pipe, wheel);
    }
    if (rng() < chance(0.25)) { // electrical/utility disconnect box on a short post
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), metalMat);
        const box = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(0.3, 0.4, 0.15), 0.015), new THREE.MeshStandardMaterial({ color: 0x8a8a3a, roughness: 0.6, metalness: 0.3 }));
        const ux = x + randRange(-footprint / 3, footprint / 3), uz = z + randRange(-footprint / 3, footprint / 3);
        post.position.set(ux, height + 0.25, uz);
        box.position.set(ux, height + 0.55, uz);
        scene.add(post, box);
    }
}

// framed wall poster — client/design work and art pieces. Warm paper tone,
// thin border, two-line caption. Visually distinct from the neon signs.
// a small standoff mount: a dark backing board flush to the wall, 4 short
// pegs, and the actual panel held out in front of them, parallel to the
// wall rather than pressed against it -- the same physical idea as a real
// framed plaque hung on standoffs, so posters/plaques/photos finally read
// as *mounted* instead of a decal painted straight onto the brick. Shared
// by addWallPoster/addTerminalPlaque/buildPhotoPosterMesh below; addSign's
// own blade-sign bracket (perpendicular arm + brace) is a different,
// heavier fixture and stays as-is.
const STANDOFF_DEPTH = 0.05;
function mountStandoffPanel(x, y, z, rotY, width, height, panelMat, opts = {}) {
    const g = new THREE.Group();
    const backMat = new THREE.MeshStandardMaterial({ color: opts.backColor ?? 0x18140f, roughness: 0.7, metalness: 0.3 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, height * 0.92, 0.015), backMat);
    back.position.set(0, 0, 0.008);
    g.add(back);

    const pegMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.7 });
    const pegR = Math.min(width, height) * 0.03;
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            const peg = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(pegR, pegR, STANDOFF_DEPTH, 6), 0.003),
                pegMat
            );
            peg.rotation.x = Math.PI / 2;
            peg.position.set(sx * width * 0.38, sy * height * 0.38, STANDOFF_DEPTH / 2);
            g.add(peg);
        }
    }

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMat);
    panel.position.set(0, 0, STANDOFF_DEPTH + 0.008);
    g.add(panel);

    g.rotation.y = rotY;
    g.position.set(x, y, z);
    scene.add(g);
    return g;
}

function addWallPoster(x, y, z, rotY, title, subtitle) {
    // style rolls independently of content -- this mounts both real
    // portfolio posters and generic noise ones, so only the look varies
    // here, never the title/subtitle text that was actually passed in.
    const paper = pickPaperColor();
    const ink = pickInkColor();
    const font = pickTextFont();
    const borderWidth = Math.round(randRange(2, 5));
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ink;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.font = `bold 15px ${font}`;
        ctx.fillText(title, w / 2, h / 2 - 6, w - 12);
        ctx.font = `10px ${font}`;
        ctx.fillText(subtitle, w / 2, h / 2 + 14, w - 12);
    }, 96, 72);
    const width = randRange(1.4, 2.0);
    mountStandoffPanel(x, y, z, rotY, width, width * 0.75, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
}

// glowing CRT/terminal plaque — the code projects. Green monospace on
// black, faux scanlines, no border (screens don't have picture frames).
function addTerminalPlaque(x, y, z, rotY, title, subtitle) {
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#040a04';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#3aff6a';
        ctx.textAlign = 'left';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('> ' + title, 4, h / 2 - 6);
        ctx.fillText('  ' + subtitle, 4, h / 2 + 8);
        ctx.fillText('_', 4 + ctx.measureText('  ' + subtitle).width, h / 2 + 8);
        for (let i = 0; i < h; i += 3) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, i, w, 1);
        }
    }, 108, 40);
    const width = randRange(1.3, 1.9);
    mountStandoffPanel(x, y, z, rotY, width, width * (40 / 108), new THREE.MeshBasicMaterial({ map: tex }), { backColor: 0x0a120a });

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0x3aff6a, 2, 4, 2);
        light.position.set(x + Math.sin(rotY) * 0.3, y, z + Math.cos(rotY) * 0.3);
        scene.add(light);
    }
}

// ---------- content-card wall mounting ----------
// real site content (art + projects) claims whatever building faces the
// random-sign pass skipped. Runs after all buildings exist.
// conservative upper-bound reserve size per content-card kind -- each of
// addWallPoster/addTerminalPlaque/placePhotoPoster rolls its own real
// width (and derives height from its own fixed aspect) internally; this
// is the largest that roll can ever come out to, so a reservation made
// from these numbers can never be smaller than the real mesh (the exact
// bug class the sign-spec-precompute fix addressed for signs).
const CONTENT_CARD_RESERVE = {
    poster: { width: 2.0, height: 2.0 * 0.75 },
    terminal: { width: 1.9, height: 1.9 * (40 / 108) },
    photo: { width: 2.0, height: 2.0 * (168 / 128) },
};

// real site content claims real facade space through the SAME occupancy
// manager everything else uses (findFreeFacadeRect/pointOnFacade) --
// not a blind random Y on a bare {x,z,rotY,height} record. Previously a
// content card could still land on top of a fire escape or anything
// else reserved on its target facade: candidateFaces only ever
// guaranteed "no SIGN landed here", never "nothing else did either".
// Now each candidate's real FacadeSurface (see addBuildingModule) is
// consulted directly, and a facade that turns out to have no free room
// (because a fire escape/awning/etc. already claimed it) is skipped in
// favor of the next one instead of forcing an overlap.
function mountContentCards() {
    const jobs = [];
    // siteContent.art + webProjects are now exhibited exclusively inside
    // the Art Gallery signature location (see ART_GALLERY_CATALOG/
    // buildArtGallery) when it's enabled -- scattering them across random
    // building faces too would dilute the one place they're actually
    // curated. If the gallery is disabled this load (CONFIG.
    // signatureBuildings.artGallery.enabled=false, or no valid site this
    // seed), they fall back to the generic scatter so the real content
    // still appears SOMEWHERE rather than vanishing.
    const galleryActive = CONFIG.signatureBuildings?.enabled && CONFIG.signatureBuildings.artGallery?.enabled
        && signatureInstances.some(s => s.type === 'artGallery');
    if (!galleryActive) {
        for (const [title, subtitle] of CONFIG.siteContent.art) jobs.push({ title, subtitle, kind: 'poster' });
        for (const [title, subtitle] of CONFIG.siteContent.webProjects) jobs.push({ title, subtitle, kind: 'poster' });
    }
    for (const [title, subtitle] of CONFIG.siteContent.codeProjects) jobs.push({ title, subtitle, kind: 'terminal' });
    for (const [title, subtitle] of CONFIG.siteContent.lifePhotos) jobs.push({ title, subtitle, kind: 'poster' });

    const faces = [...candidateFaces].sort(() => rng() - 0.5);
    let fi = 0;
    for (const job of jobs) {
        const photoKey = PHOTO_BY_TITLE[job.title];
        const kind = photoKey ? 'photo' : job.kind;
        const { width, height } = CONTENT_CARD_RESERVE[kind];
        let placed = false;
        while (!placed && fi < faces.length) {
            const facade = faces[fi++];
            const spot = findFreeFacadeRect(facade, 'poster', width, height, facade.yMin + 2.2, Math.min(facade.yMax - 0.5, facade.yMin + 6));
            if (!spot) continue; // this facade had no free room after all (e.g. a fire escape already claimed it) -- try the next one, don't force an overlap
            const p = pointOnFacade(facade, spot.u, spot.v);
            if (kind === 'photo') placePhotoPoster(photoKey, p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
            else if (kind === 'poster') addWallPoster(p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
            else addTerminalPlaque(p.x, p.y, p.z, facade.rotY, job.title, job.subtitle);
            placed = true;
        }
    }
}

// ---------- props / fixtures ----------

// every collider radius below used to be a hand-picked number returned
// alongside the mesh it describes -- close by eye, but a guess, and a
// guess drifts out of sync with the geometry the moment either one
// changes without the other. This computes the real thing instead: an
// actual Box3 around the object that's actually in the scene, taken
// after its final position/rotation are set, so the collider always
// matches what's rendered rather than what someone estimated it to be.
const _colliderBox = new THREE.Box3();
const _colliderSize = new THREE.Vector3();
function colliderRadiusFromObject(obj) {
    _colliderBox.setFromObject(obj);
    _colliderBox.getSize(_colliderSize);
    return Math.max(_colliderSize.x, _colliderSize.z) / 2;
}

function addTrashCan(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.28, 0.24, 0.75, 10), 0.025),
        new THREE.MeshStandardMaterial({ color: 0x201c1a, roughness: 0.85, metalness: 0.3 })
    );
    body.position.y = 0.375;
    const lid = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), 0.02),
        new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.8, metalness: 0.3 })
    );
    lid.position.y = 0.78;
    g.add(body, lid);
    g.position.set(x, 0, z);
    scene.add(g);
    return colliderRadiusFromObject(g);
}

function addTrafficCone(x, z) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
        jitterGeometry(new THREE.ConeGeometry(0.22, 0.55, 8), 0.02),
        new THREE.MeshStandardMaterial({ color: 0xff5f1f, roughness: 0.7 })
    );
    cone.position.y = 0.32;
    const stripe = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.16, 0.19, 0.1, 8), 0.012),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 })
    );
    stripe.position.y = 0.35;
    g.add(cone, stripe);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.24;
}

// a real Historic Route 66 mile marker -- actual town + mileage from
// Chicago, since transportation infrastructure is worth building for
// real rather than inventing highway signage from nothing.
function addMileMarker(x, z, rotY) {
    const [mile, town] = pick(CONFIG.realData.route66Illinois);
    const pole = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6), 0.01),
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 })
    );
    pole.position.y = 0.85;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0a3a1c';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.fillText('HISTORIC ROUTE 66', w / 2, 12);
        ctx.font = 'bold 13px "Courier New", monospace';
        ctx.fillText(town, w / 2, h / 2 + 2, w - 8);
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText(`MI ${mile.toFixed(1)} · CHICAGO`, w / 2, h - 8);
    }, 72, 44);
    const board = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.34),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
    );
    board.position.y = 1.55;
    board.rotation.y = rotY;
    const g = new THREE.Group();
    g.add(pole, board);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.06;
}

function addTrafficSign(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), 0.012),
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 })
    );
    pole.position.y = 0.95;

    const labels = ['STOP', 'NO ENTRY', 'ONE WAY', 'YIELD', 'X-ING'];
    const label = pick(labels);
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#c81e2e';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#181818';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(label, w / 2, h / 2 + 5);
    }, 64, 40);
    const board = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.32),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
    );
    board.position.y = 1.7;
    board.rotation.y = rotY;
    g.add(pole, board);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.06;
}

// a real 3-phase signal, mast-mounted -- reuses the flickerLights idea
// (a plain array ticked once per frame in animate()) but for phase-
// cycling instead of blink/sine, since a signal is "which lamp is lit
// right now," not one lamp's intensity. rarer than a static sign
// (weighted low): every one of these is a real per-frame update, not
// free like the instanced junk.
const trafficSignals = []; // {redMat, yellowMat, greenMat, light, phase}
function addTrafficSignal(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), 0.012),
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 })
    );
    pole.position.y = 1.3;
    const box = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(0.28, 0.72, 0.22), 0.01),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
    );
    box.position.y = 2.7;
    const lampGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const redMat = new THREE.MeshBasicMaterial({ color: 0x3a0808 });
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0x3a2000 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x123010 });
    const red = new THREE.Mesh(lampGeo, redMat); red.position.set(0, 0.25, 0.13);
    const yellow = new THREE.Mesh(lampGeo, yellowMat); yellow.position.set(0, 0, 0.13);
    const green = new THREE.Mesh(lampGeo, greenMat); green.position.set(0, -0.25, 0.13);
    box.add(red, yellow, green);
    g.add(pole, box);
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);

    let light = null;
    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        light = new THREE.PointLight(0xff2020, 1, 2.5, 2);
        light.position.set(x + Math.sin(rotY) * 0.13, 2.7, z + Math.cos(rotY) * 0.13);
        scene.add(light);
    }
    trafficSignals.push({ redMat, yellowMat, greenMat, light, phase: rng() * 6 });
    return 0.18;
}

function addCrate(x, z) {
    const g = new THREE.Group();
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
        const size = randRange(0.35, 0.55);
        const crate = new THREE.Mesh(
            jitterGeometry(new THREE.BoxGeometry(size, size, size), size * 0.12),
            new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 })
        );
        crate.position.set(randRange(-0.15, 0.15), size / 2 + i * (size * 0.95), randRange(-0.15, 0.15));
        crate.rotation.y = randRange(-0.3, 0.3);
        g.add(crate);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.4;
}

function addLantern(x, z) {
    const colorHex = pick(CONFIG.neonPalette);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), 0.01),
        new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.7 })
    );
    pole.position.y = 1.3;
    const paper = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8), 0.025),
        new THREE.MeshBasicMaterial({ color: colorHex })
    );
    paper.position.y = 2.5;
    g.add(pole, paper);
    g.position.set(x, 0, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(colorHex, 3, 6, 2);
        light.position.set(x, 2.5, z);
        scene.add(light);
    }
    return 0.22;
}

function addVendingMachine(x, z, facingRotY) {
    const colorHex = pick(CONFIG.neonPalette);
    const body = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(0.65, 1.6, 0.55), 0.04),
        new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.4 })
    );
    body.position.y = 0.8;
    // screen glow used to be a flat color -- now it's a glitching noise
    // readout, same "the machinery is confused too" joke as the ATM.
    const [msg, sub] = pickCityNoisePair(rng, x, z);
    const glowTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = hexToCss(colorHex);
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = hexToCss(colorHex);
        ctx.textAlign = 'center';
        ctx.font = 'bold 5px "Courier New", monospace';
        ctx.fillText(msg, w / 2, h / 2 - 4, w - 4);
        ctx.font = '4px "Courier New", monospace';
        ctx.fillText(sub, w / 2, h / 2 + 5, w - 4);
    }, 48, 96);
    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 1.1),
        new THREE.MeshBasicMaterial({ map: glowTex })
    );
    glow.position.set(0, 0.85, 0.28);
    const g = new THREE.Group();
    g.add(body, glow);
    // face away from whatever wall it's hugging (falls back to random
    // if placed freestanding) -- previously this never rotated at all,
    // so the screen could just as easily face into the wall as out.
    const rotY = facingRotY ?? randRange(0, Math.PI * 2);
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(colorHex, 2.5, 4, 2);
        light.position.set(x + Math.sin(rotY) * 0.4, 1, z + Math.cos(rotY) * 0.4);
        scene.add(light);
    }
    return 0.35;
}

function addFenceSegment(x, z, rotY) {
    const fenceTex = makePixelTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#e8e0c8';
        ctx.lineWidth = 1;
        for (let i = -h; i < w; i += 6) {
            ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
        }
    }, 64, 32);
    fenceTex.magFilter = THREE.NearestFilter;
    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.1),
        new THREE.MeshStandardMaterial({ map: fenceTex, transparent: false, color: 0xd8c840, roughness: 0.9 })
    );
    panel.position.y = 0.55;
    panel.rotation.y = rotY;
    panel.position.set(x, 0.55, z);
    scene.add(panel);
    return 0.1;
}

// small bronze-ish placard on a post, waist height — education & employment
// history. The "resume, but you have to go find it" prop.
function addMuseumPlacard(x, z, facingRotY) {
    const [title, subtitle] = pick([...CONFIG.siteContent.education, ...CONFIG.siteContent.employment]);
    const g = new THREE.Group();
    const post = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), 0.008),
        new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 })
    );
    post.position.y = 0.55;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#5a4a28';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e8d9a0';
        ctx.textAlign = 'center';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2 - 3, w - 6);
        ctx.font = '7px "Courier New", monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 9, w - 6);
    }, 96, 32);
    const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.17),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.3 })
    );
    plate.rotation.x = -0.3;
    plate.position.set(0, 1.05, 0.02);
    g.add(post, plate);
    // face away from the wall it's mounted near, so the readable side
    // points into the alley rather than a coin-flip
    g.rotation.y = facingRotY ?? randRange(0, Math.PI * 2);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.1;
}

// mythology fragments — the same absurdist personal canon (The Great
// Book of 8gH) that the graffiti/wanted-poster pools quote from, cut
// down to sticker-flyer length. Kept separate from siteContent (real
// resume/portfolio facts) so this stays clearly its own decorative genre.
const MYTHOLOGY_FRAGMENTS = [
    ['FOUR BUTTONS', 'time -- power -- start -- stop'],
    ['THE FIFTH WAS JUDGED', 'ruled unnecessary, disputed since'],
    ['HIS EMINENCE OF REFRIGERATION', 'sovereign of the cycle'],
    ['THE VISE-GRIP REVELATION', 'the moment gripping acquired state'],
    ['8gH', 'a signature attached to opened structures'],
    ['TAKE IT APART', 'to see how it works'],
    // curated above; deterministic title x domain cross-join below (real
    // honorifics pulled from the actual text -- "KEEPER OF THE SUCTION
    // LINE," "PROTECTOR OF THE COMPRESSOR," etc.), subtitle cycled from a
    // small pool rather than RNG-picked so this stays seed-safe.
    ...(() => {
        const titles = [
            'KEEPER', 'PROTECTOR', 'DEFENDER', 'WARDEN', 'MASTER', 'PATRIARCH',
            'LORD', 'SOVEREIGN', 'FATHER', 'JUDGE', 'WITNESS', 'FIRST ENGINEER',
        ];
        const domains = [
            'THE COMPRESSOR', 'THE SUCTION LINE', 'THE DISCHARGE LINE', 'THE EVAPORATOR',
            'THE CONDENSER', 'THE REVERSING VALVE', 'THE CYCLE', 'THE FIFTH BUTTON',
            'THE VISE', 'THE OPEN CASE', 'THE FOUR BUTTONS', 'THE SMALL PLANT DEPARTMENT',
            'THE RIGHT LAYER', 'THE SEALED BLACK BOX',
        ];
        const subs = [
            'not disputed, allegedly', 'ruled unnecessary', 'convened once, never again',
            'sealed since installation', 'opened anyway', 'still rotating', 'never plugged in',
            'compress -- condense -- expand -- evaporate', 'a title, not a job', 'self-appointed',
        ];
        const out = [];
        let i = 0;
        for (const t of titles) for (const d of domains) out.push([`${t} OF ${d}`, subs[i++ % subs.length]]);
        return out;
    })(),
];

// a flyer dropped flat on the pavement — skills & rhetoric fragments.
// common, cheap, everywhere; the "public secret" hiding in plain sight.
function addStickerTag(x, z) {
    const [title, subtitle] = rng() < 0.78
        ? pickCityNoisePair(rng, x, z)
        : (rng() < 0.4
            ? [pickPoetryTag(rng), pick(POETRY_SHORT_NOISE)]
            : pick([...CONFIG.siteContent.skills, ...CONFIG.siteContent.about, ...CONFIG.billboards.flavorWords, ...MYTHOLOGY_FRAGMENTS]));
    const neon = pick(CONFIG.neonPalette);
    const font = pickTextFont();
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = hexToCss(neon);
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = hexToCss(neon);
        ctx.textAlign = 'center';
        ctx.font = `bold 10px ${font}`;
        ctx.fillText(title, w / 2, h / 2 - 2, w - 6);
        ctx.font = `7px ${font}`;
        ctx.fillStyle = '#ccc';
        ctx.fillText(subtitle, w / 2, h / 2 + 10, w - 6);
    }, 72, 40);
    const sticker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.4 * (40 / 72)),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    sticker.rotation.x = -Math.PI / 2;
    sticker.rotation.z = randRange(0, Math.PI * 2);
    sticker.position.set(x, 0.015, z);
    scene.add(sticker);
    return 0.05;
}

// a flyer taped flush to the wall -- real tape (not a standoff mount,
// paper gets taped flat) at 1-3 corners, torn/curling edge on whichever
// corner didn't get one. Pulls from the same decorative pools stickers
// already draw from -- "more posters" without inventing new fake resume
// content, just a lot more of the noise layer that already exists.
function addWallFlyer(x, y, z, rotY) {
    const [title, subtitle] = rng() < 0.78
        ? pickCityNoisePair(rng, x, z)
        : (rng() < 0.4
            ? [pickPoetryTag(rng), pick(POETRY_MEDIUM_NOISE)]
            : pick([...CONFIG.billboards.flavorWords, ...MYTHOLOGY_FRAGMENTS, ...CONFIG.siteContent.about]));
    const paper = pickPaperColor();
    const ink = pickInkColor();
    const font = pickTextFont();
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#00000030';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.font = `bold 10px ${font}`;
        ctx.fillText(title, w / 2, h / 2 - 2, w - 8);
        ctx.font = `7px ${font}`;
        ctx.fillText(subtitle, w / 2, h / 2 + 12, w - 8);
    }, 72, 96);
    const width = randRange(0.32, 0.5);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * (96 / 72)),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    plane.position.set(x, y, z);
    plane.rotation.y = rotY + randRange(-0.06, 0.06); // never dead-flat, a little crooked like it was actually taped up by hand
    scene.add(plane);
}

// a real business card, dropped and stepped on — one of these is genuine
// contact info, buried among all the fake JUSTIN BROWN leads elsewhere.
function addBusinessCardLitter(x, z) {
    const [title, subtitle] = pick(CONFIG.siteContent.contact);
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8e4d8';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'center';
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2 - 3, w - 6);
        ctx.font = '6px "Courier New", monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 8, w - 6);
    }, 64, 36);
    const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.09),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    );
    card.rotation.x = -Math.PI / 2;
    card.rotation.z = randRange(0, Math.PI * 2);
    card.position.set(x, 0.012, z);
    scene.add(card);
    return 0.04;
}

// flat grated disc set into the pavement — sewer/utility access. Purely
// decorative but grounds the alley (literally) as real infrastructure.
function addManhole(x, z) {
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#2a2622';
        ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#161412';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(w / 2, h / 2);
            ctx.lineTo(w / 2 + Math.cos(a) * (w / 2 - 3), h / 2 + Math.sin(a) * (h / 2 - 3));
            ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); ctx.stroke();
    }, 48, 48);
    const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 16),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.rotation.z = randRange(0, Math.PI * 2);
    disc.position.set(x, 0.011, z);
    scene.add(disc);
    return 0; // walk-over, no collider
}

// a pigeon, doing pigeon things. Pure "random bullshit" — no narrative
// weight, just a sign the city has something alive in it.
function addPigeon(x, z) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: pick([0x4a4a4e, 0x5a5450, 0x3a3a3e]), roughness: 0.9 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(jitterGeometry(new THREE.SphereGeometry(0.09, 8, 6), 0.012), bodyMat);
    body.scale.set(1, 0.85, 1.3);
    body.position.y = 0.09;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), bodyMat);
    head.position.set(0, 0.15, 0.11);
    g.add(body, head);
    g.position.set(x, 0, z);
    g.rotation.y = randRange(0, Math.PI * 2);
    scene.add(g);
    return 0.1;
}

// a sagging cable strung between two building faces across an alley —
// the network made literal. Occasionally a bright "fiber" line instead
// of dull rubber-black, glowing faintly with data that's never for you.
function addOverheadCable(xa, za, xb, zb) {
    const midY = randRange(4, 9);
    const sagY = midY - randRange(0.4, 1.2);
    const isFiber = rng() < 0.2;
    const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(xa, midY + randRange(-0.4, 0.4), za),
        new THREE.Vector3((xa + xb) / 2, sagY, (za + zb) / 2),
        new THREE.Vector3(xb, midY + randRange(-0.4, 0.4), zb)
    );
    const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, isFiber ? 0.02 : 0.03, 5, false),
        isFiber
            ? new THREE.MeshBasicMaterial({ color: pick(CONFIG.neonPalette) })
            : new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 })
    );
    scene.add(tube);
}

// a fabric canopy tarp strung across an alley between two building
// faces -- real dense market alleys are often covered like this. Always
// axis-aligned (our grid only ever has cardinal-direction spans between
// adjacent cells), so the plane's own width/depth are set directly in
// world axes instead of composing rotations.
function addCanopyTarp(xa, za, xb, zb) {
    const spanAlongX = Math.abs(xb - xa) > Math.abs(zb - za);
    const length = (spanAlongX ? Math.abs(xb - xa) : Math.abs(zb - za)) * 0.92;
    const crossWidth = CELL * 0.75;
    const tex = makePixelTexture((ctx, w, h) => {
        const base = pick(['#8a3838', '#38588a', '#8a7838', '#3a5c2e']);
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (let i = 0; i < w; i += 12) ctx.fillRect(i, 0, 6, h);
    }, 64, 32);
    const tarp = new THREE.Mesh(
        new THREE.PlaneGeometry(spanAlongX ? length : crossWidth, spanAlongX ? crossWidth : length),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })
    );
    tarp.rotation.x = -Math.PI / 2; // horizontal, no second rotation needed
    tarp.position.set((xa + xb) / 2, randRange(3.2, 4.2), (za + zb) / 2);
    scene.add(tarp);
}

// a striped shop awning jutting out from a wall face -- reuses the exact
// same outward-normal formula (sin/cos of rotY) that addSign already
// uses for its point-light offset, rather than re-deriving the direction.
function addAwning(x, y, z, rotY, width) {
    const tex = makePixelTexture((ctx, w, h) => {
        const stripeA = pick(['#8a3838', '#38588a', '#8a7838']);
        for (let i = 0; i < w; i += 10) {
            ctx.fillStyle = (i / 10) % 2 === 0 ? stripeA : '#e8ddc2';
            ctx.fillRect(i, 0, 10, h);
        }
    }, 64, 24);
    const awning = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * 0.45),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide })
    );
    awning.rotation.y = rotY;
    awning.rotation.x = -Math.PI / 5; // tilts down-and-out from the wall
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    awning.position.set(x + nx * (width * 0.3), y, z + nz * (width * 0.3));
    scene.add(awning);
}

// a tree, alive or dead — never planted without the possibility of the
// other. Living: green cluster canopy, upright. Dead: bare grey branches,
// no leaves, often leaning. Same trunk generator either way.
function addTree(x, z) {
    const alive = rng() < 0.6;
    const trunkHeight = randRange(1.8, 4.2);
    const trunkTilt = alive ? randRange(-0.05, 0.05) : randRange(-0.3, 0.3);
    const trunk = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(randRange(0.08, 0.14), randRange(0.12, 0.2), trunkHeight, 6), 0.02),
        new THREE.MeshStandardMaterial({ color: alive ? 0x3a2c1c : 0x2a241c, roughness: 0.95 })
    );
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = trunkTilt;
    const g = new THREE.Group();
    g.add(trunk);

    if (alive) {
        const canopyColor = pick([0x1c3a1c, 0x223a1a, 0x1a331e]);
        const clumps = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < clumps; i++) {
            const s = randRange(0.5, 1.0);
            const clump = new THREE.Mesh(
                new THREE.IcosahedronGeometry(s, 0),
                new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 1, flatShading: true })
            );
            clump.position.set(randRange(-0.5, 0.5), trunkHeight + randRange(0.2, 0.7), randRange(-0.5, 0.5));
            clump.scale.set(1, randRange(0.7, 1.1), 1);
            g.add(clump);
        }
    } else {
        // bare branches — a few thin cylinders radiating from the top
        const branchCount = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < branchCount; i++) {
            const len = randRange(0.6, 1.4);
            const branch = new THREE.Mesh(
                new THREE.CylinderGeometry(0.02, 0.04, len, 4),
                new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 1 })
            );
            branch.position.set(0, trunkHeight - 0.1, 0);
            branch.rotation.z = randRange(-1.1, 1.1);
            branch.rotation.x = randRange(-1.1, 1.1);
            branch.translateY(len / 2);
            g.add(branch);
        }
    }
    g.position.set(x, 0, z);
    g.rotation.y = randRange(0, Math.PI * 2);
    scene.add(g);
    return 0.25;
}

// a potted plant — thriving (full, green) or neglected (sparse, browning).
function addPottedPlant(x, z) {
    const thriving = rng() < 0.55;
    const pot = new THREE.Mesh(
        jitterGeometry(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 8), 0.015),
        new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 })
    );
    pot.position.y = 0.11;
    const g = new THREE.Group();
    g.add(pot);
    const leafColor = thriving ? pick([0x2a4a1e, 0x1e4a28]) : pick([0x5a5228, 0x6a5a3a]);
    const leafCount = thriving ? 5 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 2);
    for (let i = 0; i < leafCount; i++) {
        const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, randRange(0.25, 0.5), 5),
            new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9 })
        );
        leaf.position.set(randRange(-0.1, 0.1), 0.22 + randRange(0.1, 0.25), randRange(-0.1, 0.1));
        leaf.rotation.z = randRange(-0.4, 0.4);
        leaf.rotation.x = randRange(-0.4, 0.4);
        g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.18;
}

// a table carrying a bowl carrying fruit -- the one spot in the whole
// maze that goes container -> contents -> contents-of-contents three
// levels deep instead of bottoming out at "one more crude primitive."
// Interior-only (called directly from addBuilding, not through the
// outdoor PROP_BUILDERS pool).
function addTableWithClutter(x, z) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
    const topW = randRange(0.7, 1.0), topD = randRange(0.5, 0.8), topH = 0.72;
    const top = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(topW, 0.05, topD), 0.01), legMat);
    top.position.y = topH;
    g.add(top);
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.03, 0.03, topH, 5), 0.008), legMat);
            leg.position.set(sx * (topW / 2 - 0.06), topH / 2, sz * (topD / 2 - 0.06));
            g.add(leg);
        }
    }

    if (rng() < 0.7) { // the bowl, on the table
        const bowl = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(0.16, 0.11, 0.1, 8), 0.01),
            new THREE.MeshStandardMaterial({ color: pick([0xd8d0c0, 0xa0b8c0, 0x8a3838]), roughness: 0.6 })
        );
        bowl.position.y = topH + 0.05;
        g.add(bowl);

        const fruitCount = 1 + Math.floor(rng() * 3); // the fruit, in the bowl
        const fruitColor = pick([0xc82818, 0xd89818, 0x9ac030]);
        let hasInsect = false;
        for (let i = 0; i < fruitCount; i++) {
            const fy = topH + 0.11;
            const fx = randRange(-0.08, 0.08), fz = randRange(-0.08, 0.08);
            const fruit = new THREE.Mesh(
                new THREE.SphereGeometry(randRange(0.045, 0.06), 6, 6),
                new THREE.MeshStandardMaterial({ color: fruitColor, roughness: 0.5 })
            );
            fruit.position.set(fx, fy, fz);
            g.add(fruit);

            if (!hasInsect && rng() < 0.08) { // the insect, on the fruit -- one level deeper still
                hasInsect = true;
                const insect = new THREE.Mesh(
                    new THREE.SphereGeometry(0.008, 4, 4),
                    new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
                );
                insect.position.set(fx, fy + 0.05, fz);
                g.add(insect);
            }
        }
    }

    g.rotation.y = randRange(0, Math.PI * 2);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.5;
}

// ivy patch mounted on a wall — spreading and green, or dead and brown.
// Layered onto alley-facing walls alongside graffiti/cameras.
function addIvyPatch(x, y, z, rotY) {
    const alive = rng() < 0.5;
    const baseColor = alive ? 0x1e3a1a : 0x4a3a20;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const shade = hexToCss(baseColor);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = shade;
            ctx.globalAlpha = randRange(0.4, 0.9);
            const cx = w / 2 + randRange(-w / 2, w / 2) * (i / 40);
            const cy = h - (i / 40) * h * randRange(0.6, 1);
            ctx.beginPath();
            ctx.arc(cx, cy, randRange(2, 5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }, 48, 64);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(randRange(0.7, 1.3), randRange(1, 1.8)),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.position.set(x, y, z);
    plane.rotation.y = rotY;
    scene.add(plane);
}

// exterior plumbing -- a downspout/standpipe run climbing the wall, held
// off it by a few real pipe straps, with a hose bib near the bottom and
// (on a neglected building) a rust stain bleeding down from a joint. Same
// local-space convention as addSecurityCamera: everything built along
// local +Z, the group's own rotation.y = rotY carries it to the wall's
// real outward-facing direction. Purely decorative -- no collision, same
// as ivy/awnings -- a real pipe run is thin enough nobody's colliding
// with it anyway.
function addPipeCluster(x, z, rotY, wallHeight, maintenance = 0.5) {
    const g = new THREE.Group();
    const pipeMat = new THREE.MeshStandardMaterial({
        color: maintenance < 0.4 ? 0x5a3a28 : 0x3a3f42, roughness: 0.75, metalness: 0.5,
    });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, metalness: 0.6 });
    const pipeR = randRange(0.045, 0.075);
    const topY = Math.min(wallHeight - 0.4, randRange(2.5, 6));
    // 1-2 offset elbow joints break up what would otherwise be one dead-
    // straight run -- a real downspout rarely goes floor to roof in one pipe.
    const jointCount = rng() < 0.4 ? 2 : 1;
    const jointYs = [];
    for (let i = 1; i <= jointCount; i++) jointYs.push(topY * (i / (jointCount + 1)) + randRange(-0.3, 0.3));
    jointYs.sort((a, b) => a - b);
    const segBounds = [0, ...jointYs, topY];
    let ox = 0; // local tangent offset -- kicks a few cm sideways at each joint
    for (let i = 0; i < segBounds.length - 1; i++) {
        const y0 = segBounds[i], y1 = segBounds[i + 1];
        const seg = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(pipeR, pipeR, y1 - y0, 6), pipeR * 0.15),
            pipeMat
        );
        seg.position.set(ox, (y0 + y1) / 2, 0.06);
        g.add(seg);
        // strap every ~0.9m along this segment, holding the pipe to the wall
        for (let sy = y0 + 0.3; sy < y1; sy += 0.9) {
            const strap = new THREE.Mesh(new THREE.BoxGeometry(pipeR * 3.2, 0.03, 0.09), strapMat);
            strap.position.set(ox, sy, 0.035);
            g.add(strap);
        }
        if (i < jointYs.length) {
            const nextOx = ox + randRange(-0.08, 0.08);
            const elbow = new THREE.Mesh(
                jitterGeometry(new THREE.CylinderGeometry(pipeR * 1.1, pipeR * 1.1, 0.12, 6), pipeR * 0.1),
                pipeMat
            );
            elbow.rotation.x = Math.atan2(nextOx - ox, 0.12);
            elbow.position.set((ox + nextOx) / 2, y1, 0.06);
            g.add(elbow);
            ox = nextOx;
        }
    }

    // a hose bib near the bottom -- the one part of this whole assembly
    // that reads as "used," not just structural.
    if (rng() < 0.6) {
        const bib = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), 0.004),
            pipeMat
        );
        bib.rotation.x = Math.PI / 2;
        bib.position.set(0, randRange(0.35, 0.6), 0.13);
        g.add(bib);
        const wheel = new THREE.Mesh(
            jitterGeometry(new THREE.TorusGeometry(0.035, 0.01, 5, 8), 0.004),
            strapMat
        );
        wheel.position.set(0, randRange(0.35, 0.6), 0.2);
        g.add(wheel);
    }

    // rust/drip stain bleeding down from a joint -- more likely the more
    // neglected this building rolled.
    if (rng() < 0.15 + (1 - maintenance) * 0.35) {
        const stainY = pick(jointYs.length ? jointYs : [topY * 0.5]);
        const tex = makePixelTexture((ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(120,70,30,0.5)';
            for (let i = 0; i < 14; i++) {
                const cx = w / 2 + randRange(-3, 3);
                const cy = (i / 14) * h;
                ctx.fillRect(cx - randRange(1, 3), cy, randRange(2, 6), h / 14 + 1);
            }
        }, 16, 48);
        const stain = new THREE.Mesh(
            new THREE.PlaneGeometry(0.3, 0.9),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
        );
        stain.position.set(ox, Math.max(0.45, stainY - 0.45), 0.03);
        g.add(stain);
    }

    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);
}

// weeds growing from a pavement crack — common, cheap, ground-level.
function addWeeds(x, z) {
    const g = new THREE.Group();
    const alive = rng() < 0.7;
    const color = alive ? pick([0x2a4a1e, 0x1e4a28, 0x3a5a24]) : pick([0x5a5228, 0x4a4020]);
    const blades = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < blades; i++) {
        const h = randRange(0.1, 0.3);
        const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.015, h, 3),
            new THREE.MeshStandardMaterial({ color, roughness: 1 })
        );
        blade.position.set(randRange(-0.08, 0.08), h / 2, randRange(-0.08, 0.08));
        blade.rotation.z = randRange(-0.3, 0.3);
        g.add(blade);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.05;
}

// a bright pool of light in an open plaza — every plaza cell gets one,
// not just the ones that happen to host a statue/landmark. The paired
// opposite of addThicketShade below.
function addPlazaGlow(x, z) {
    const glowTex = makePixelTexture((ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grad.addColorStop(0, 'rgba(255,248,220,0.55)');
        grad.addColorStop(1, 'rgba(255,248,220,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }, 64, 64);
    const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.008, z);
    scene.add(patch);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xfff4d0, 3.5, CELL * 1.6, 1.8);
        light.position.set(x, 5, z);
        scene.add(light);
    }
}

// a real shaded patch under dense foliage — darker ground, no added
// light. The paired opposite of addPlazaGlow above: bright open plazas,
// genuinely dim overgrown pockets, never uniform in between.
function addThicketShade(x, z) {
    const shadeTex = makePixelTexture((ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grad.addColorStop(0, 'rgba(10,14,8,0.55)');
        grad.addColorStop(1, 'rgba(10,14,8,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }, 64, 64);
    const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 0.7, CELL * 0.7),
        new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.009, z);
    scene.add(patch);
    // extra scraggle so the shaded cell actually reads as overgrown, not
    // just dim — a couple more weeds/plants crowd in alongside the tree.
    for (let i = 0; i < 2; i++) {
        addWeeds(x + randRange(-1.2, 1.2), z + randRange(-1.2, 1.2));
    }
}

function addStatue(x, z) {
    const g = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a4238, roughness: 1 });
    const pedestal = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(1, 0.6, 1), 0.05), stoneMat);
    pedestal.position.y = 0.3;
    const body = new THREE.Mesh(jitterGeometry(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), 0.03), stoneMat);
    body.position.y = 1.35;
    const head = new THREE.Mesh(jitterGeometry(new THREE.SphereGeometry(0.28, 10, 10), 0.02), stoneMat);
    head.position.y = 2.1;
    g.add(pedestal, body, head);
    g.position.set(x, 0, z);
    scene.add(g);

    const light = new THREE.SpotLight(0xbfffcf, 2.5, 8, Math.PI / 5, 0.5);
    light.position.set(x, 4, z);
    light.target = g;
    scene.add(light);
    return 0.6;
}

// ---------- junk props: ~240 deliberately crude, instanced ----------
// "poorly made" is the brief, not a compromise: every one of these is a
// single shared primitive (box/cylinder/cone/sphere/tube), scaled and
// colored per-instance. That's also why this can afford to be 240 of
// them instead of 20 -- 5 InstancedMesh draw calls cover all of them,
// regardless of count, instead of one draw call per item. Placement is
// situational, not a flat random pool: each descriptor is tagged to the
// real feature types that already exist (construction zones, crime
// scenes, parks, streets, alleys) and only spawns there.

const JUNK_BASE_KINDS = [
    { name: 'oil drum', shape: 'cylinder', contexts: ['alley', 'construction'], size: [0.5, 0.9, 0.5], colors: [0x2a2a1c, 0x1c2a2a, 0x3a2410] },
    { name: 'tire', shape: 'cylinder', contexts: ['alley', 'street'], size: [0.5, 0.22, 0.5], colors: [0x141414] },
    { name: 'cinderblock', shape: 'box', contexts: ['alley', 'construction'], size: [0.4, 0.2, 0.2], colors: [0x8a8a82, 0x7a7a72] },
    { name: 'wooden pallet', shape: 'box', contexts: ['alley', 'construction'], size: [1.0, 0.12, 1.0], colors: [0x6a4e30, 0x5a4228] },
    { name: 'propane tank', shape: 'cylinder', contexts: ['construction', 'alley'], size: [0.25, 0.7, 0.25], colors: [0xc8b8a0, 0xa89078] },
    { name: 'traffic barrel', shape: 'cone', contexts: ['construction', 'street'], size: [0.35, 0.75, 0.35], colors: [0xff8a2f, 0xffffff] },
    { name: 'sandbag pile', shape: 'box', contexts: ['construction'], size: [0.7, 0.3, 0.4], colors: [0xc4b088, 0xb0a078] },
    { name: 'rebar bundle', shape: 'cylinder', contexts: ['construction'], size: [0.15, 1.4, 0.15], colors: [0x6a5a48] },
    { name: 'cable spool', shape: 'cylinder', contexts: ['construction', 'alley'], size: [0.6, 0.45, 0.6], colors: [0x5a4228, 0x6a4e30] },
    { name: 'shopping cart', shape: 'box', contexts: ['alley', 'street'], size: [0.55, 0.9, 0.9], colors: [0x9aa0a0] },
    { name: 'milk crate', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [0.35, 0.3, 0.35], colors: [0xc8d0e0, 0xd0c8a0, 0xc0e0c8] },
    { name: 'broken chair', shape: 'box', contexts: ['alley', 'indoor'], size: [0.45, 0.75, 0.45], colors: [0x4a3a28, 0x2a2a2a] },
    { name: 'broken table', shape: 'box', contexts: ['alley', 'indoor'], size: [0.9, 0.5, 0.6], colors: [0x5a4228] },
    { name: 'mattress roll', shape: 'cylinder', contexts: ['alley', 'indoor'], size: [0.35, 1.2, 0.35], colors: [0xd8d0c0, 0xc0c8d0] },
    { name: 'rolled carpet', shape: 'cylinder', contexts: ['alley', 'indoor'], size: [0.2, 1.5, 0.2], colors: [0x8a3838, 0x38588a] },
    { name: 'cardboard box stack', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [0.5, 0.8, 0.5], colors: [0xc0a878, 0xb89868] },
    { name: 'trash bag pile', shape: 'sphere', contexts: ['alley'], size: [0.5, 0.35, 0.5], colors: [0x1c1c1c, 0x2a3a2a] },
    { name: 'dumpster lid', shape: 'box', contexts: ['alley'], size: [1.1, 0.08, 0.8], colors: [0x2a3a2a, 0x3a2a2a] },
    { name: 'wheelbarrow', shape: 'box', contexts: ['construction'], size: [0.6, 0.35, 0.9], colors: [0x8a3a2a, 0x6a6a6a] },
    { name: 'folded ladder', shape: 'box', contexts: ['construction', 'alley'], size: [0.15, 1.8, 0.35], colors: [0xc8c8c0, 0x8a6a3a] },
    { name: 'toolbox', shape: 'box', contexts: ['construction', 'indoor'], size: [0.45, 0.3, 0.25], colors: [0xc82020, 0x2050c8, 0x505050] },
    { name: 'generator unit', shape: 'box', contexts: ['construction'], size: [0.65, 0.5, 0.45], colors: [0xd8c020, 0x505050] },
    { name: 'road cone stack', shape: 'cone', contexts: ['street', 'construction'], size: [0.22, 0.55, 0.22], colors: [0xff5f1f] },
    { name: 'fire hydrant', shape: 'cylinder', contexts: ['street'], size: [0.22, 0.65, 0.22], colors: [0xc82020, 0xd8d020] },
    { name: 'parking meter', shape: 'cylinder', contexts: ['street'], size: [0.1, 1.1, 0.1], colors: [0x505050, 0x3a3a3a] },
    { name: 'bike rack', shape: 'box', contexts: ['street'], size: [0.06, 0.7, 0.9], colors: [0x3a3a3a] },
    { name: 'bollard', shape: 'cylinder', contexts: ['street'], size: [0.12, 0.75, 0.12], colors: [0x3a3a3a, 0xc82020] },
    // parked/abandoned vehicles -- crude single-box silhouettes, same
    // "one shared primitive, scaled and colored" rule as everything else
    // here. Long boxes give a wide circle collider (radius = half the
    // longer side), a known simplification already accepted for carts
    // and pallets, not a new one.
    { name: 'parked car', shape: 'box', contexts: ['street'], size: [1.8, 1.3, 4.2], colors: [0xc0c4c8, 0x8a1818, 0x18305a, 0x2a2a2a, 0xd8d0b0] },
    { name: 'delivery van', shape: 'box', contexts: ['street'], size: [1.9, 2.1, 4.6], colors: [0xd8d8d0, 0xc8a020] },
    { name: 'abandoned bike', shape: 'box', contexts: ['street', 'alley'], size: [0.5, 0.9, 1.6], colors: [0x2a2a2a, 0xc82020, 0x2a6aff] },
    { name: 'utility box', shape: 'box', contexts: ['street', 'alley'], size: [0.5, 0.9, 0.4], colors: [0x5a6a5a, 0x6a5a4a] },
    { name: 'vent cap', shape: 'cylinder', contexts: ['alley'], size: [0.3, 0.25, 0.3], colors: [0x5a5a5a] },
    { name: 'satellite dish scrap', shape: 'cone', contexts: ['alley'], size: [0.6, 0.15, 0.6], colors: [0xc8c8c8, 0xa0a0a0] },
    { name: 'broken umbrella', shape: 'cone', contexts: ['alley'], size: [0.5, 0.4, 0.5], colors: [0x8a2a2a, 0x2a2a8a] },
    { name: 'picnic table', shape: 'box', contexts: ['park'], size: [1.4, 0.45, 0.8], colors: [0x6a4e30] },
    { name: 'litter bin', shape: 'cylinder', contexts: ['park', 'street', 'plaza'], size: [0.28, 0.6, 0.28], colors: [0x2a4a2a, 0x2a2a4a] },
    { name: 'planter box', shape: 'box', contexts: ['park', 'plaza'], size: [0.7, 0.35, 0.35], colors: [0x5a4228, 0x6a6a62] },
    { name: 'birdbath', shape: 'cylinder', contexts: ['park'], size: [0.4, 0.7, 0.4], colors: [0x8a8a82] },
    { name: 'evidence marker', shape: 'cone', contexts: ['crimeScene'], size: [0.14, 0.2, 0.14], colors: [0xf4e84a] },
    { name: 'broken bottle pile', shape: 'sphere', contexts: ['crimeScene', 'alley'], size: [0.15, 0.1, 0.15], colors: [0x2a5a3a, 0x3a3a3a] },
    { name: 'tarp-covered pile', shape: 'box', contexts: ['crimeScene', 'construction'], size: [0.8, 0.35, 0.6], colors: [0x2a3a4a, 0x4a4a3a] },
    { name: 'road flare', shape: 'cylinder', contexts: ['street', 'crimeScene'], size: [0.05, 0.3, 0.05], colors: [0xff2f1f] },
    { name: 'sawhorse', shape: 'box', contexts: ['construction', 'street'], size: [0.7, 0.6, 0.15], colors: [0xff8a2f, 0x8a6a3a] },
    { name: 'newspaper stack', shape: 'box', contexts: ['alley', 'street', 'indoor'], size: [0.35, 0.15, 0.25], colors: [0xd8d0b8, 0xc8c0a8] },
    { name: 'pizza box', shape: 'box', contexts: ['alley', 'indoor'], size: [0.32, 0.06, 0.32], colors: [0xc8b888, 0xb8a878] },
    { name: 'discarded umbrella skeleton', shape: 'cone', contexts: ['alley', 'street'], size: [0.55, 0.35, 0.55], colors: [0x2a2a2a] },
    { name: 'plastic bucket', shape: 'cylinder', contexts: ['alley', 'construction', 'indoor'], size: [0.28, 0.32, 0.28], colors: [0xff6a2a, 0x2a6aff, 0x2a2a2a] },
    { name: 'coiled extension cord', shape: 'cylinder', contexts: ['construction', 'indoor'], size: [0.3, 0.08, 0.3], colors: [0xff8a2f, 0xd8d020] },
    { name: 'fallen road sign', shape: 'box', contexts: ['street', 'construction'], size: [0.6, 0.06, 0.9], colors: [0xffd020, 0xffffff] },
    { name: 'street food cart', shape: 'box', contexts: ['plaza', 'street'], size: [0.9, 1.1, 0.6], colors: [0xc82020, 0xd8d020, 0x2a6aff] },
    { name: 'stray cardboard sheet', shape: 'box', contexts: ['alley'], size: [0.7, 0.02, 0.5], colors: [0xc0a878] },
    { name: 'crushed can', shape: 'cylinder', contexts: ['alley', 'street', 'indoor'], size: [0.06, 0.1, 0.06], colors: [0xc82020, 0xd8d020, 0xc0c0c0] },
    { name: 'broken skateboard', shape: 'box', contexts: ['alley', 'street'], size: [0.2, 0.04, 0.75], colors: [0x2a2a2a, 0xc82020] },
    { name: 'shopping bag pile', shape: 'sphere', contexts: ['alley', 'street'], size: [0.3, 0.22, 0.3], colors: [0xffffff, 0xc8c8c8, 0x2a2a2a] },
];

const JUNK_WEAR_STATES = [
    { tag: 'fresh', sizeMul: 1.0 },
    { tag: 'weathered', sizeMul: 0.9 },
];
const JUNK_SIZE_CLASSES = [
    { tag: 'small', mul: 0.75 }, { tag: 'medium', mul: 1.0 }, { tag: 'large', mul: 1.3 },
];

// ~40 kinds x 2 wear states x 3 size classes = ~240 distinct named,
// situationally-tagged spawnable descriptors, generated rather than
// hand-typed 240 times over.
const JUNK_DESCRIPTORS = [];
for (const kind of JUNK_BASE_KINDS) {
    for (const wear of JUNK_WEAR_STATES) {
        for (const sizeClass of JUNK_SIZE_CLASSES) {
            const m = wear.sizeMul * sizeClass.mul;
            JUNK_DESCRIPTORS.push({
                name: `${kind.name} (${wear.tag}, ${sizeClass.tag})`,
                shape: kind.shape,
                contexts: kind.contexts,
                size: kind.size.map(s => [s * m * 0.85, s * m * 1.15]),
                colors: kind.colors,
            });
        }
    }
}

const JUNK_CAPACITY = 520; // raised alongside the density bump below -- headroom so instances don't silently start getting dropped at cap
const junkMeshes = {};
const junkCounts = {};
const _junkMatrix = new THREE.Matrix4();
const _junkPos = new THREE.Vector3();
const _junkQuat = new THREE.Quaternion();
const _junkEuler = new THREE.Euler();
const _junkScale = new THREE.Vector3();
const _junkColor = new THREE.Color();

for (const shape of ['box', 'cylinder', 'cone', 'sphere']) {
    let geo;
    switch (shape) {
        case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); break;
        case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 8); break;
        case 'sphere': geo = new THREE.SphereGeometry(0.5, 8, 6); break;
    }
    jitterGeometry(geo, 0.03); // one shared crude silhouette per shape, not per instance
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), JUNK_CAPACITY);
    mesh.count = 0;
    scene.add(mesh);
    junkMeshes[shape] = mesh;
    junkCounts[shape] = 0;
}

function spawnJunkInstance(d, x, z) {
    const mesh = junkMeshes[d.shape];
    const idx = junkCounts[d.shape];
    if (idx >= JUNK_CAPACITY) return 0; // silently at capacity — not expected to hit this
    junkCounts[d.shape] = idx + 1;

    const sx = randRange(...d.size[0]), sy = randRange(...d.size[1]), sz = randRange(...d.size[2]);
    _junkPos.set(x, sy / 2, z);
    _junkEuler.set(0, randRange(0, Math.PI * 2), 0);
    _junkQuat.setFromEuler(_junkEuler);
    _junkScale.set(sx, sy, sz);
    _junkMatrix.compose(_junkPos, _junkQuat, _junkScale);
    mesh.setMatrixAt(idx, _junkMatrix);
    mesh.setColorAt(idx, _junkColor.set(pick(d.colors)));
    mesh.count = junkCounts[d.shape];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return { radius: Math.max(sx, sz) / 2, height: sy };
}

// scatter `count` junk items matching `context` around (x,z) within
// `spread` — the situational placement itself. Silently does nothing if
// no descriptor matches the context (defensive, not expected to trigger).
function scatterJunk(context, x, z, count, spread, axis = null) {
    const pool = JUNK_DESCRIPTORS.filter(d => d.contexts.includes(context));
    if (!pool.length) return;
    for (let i = 0; i < count; i++) {
        // lane-aware when an axis is given (a straight corridor -- see
        // throughAxis/laneOffset), plus a couple of overlap-avoidance
        // tries so junk doesn't stack directly on top of an already-
        // placed prop and eat even more of the walkable width.
        let px, pz;
        for (let attempt = 0; attempt < 2; attempt++) {
            const [ox, oz] = laneOffset(spread, axis);
            px = x + ox; pz = z + oz;
            const blocked = propColliders.some(p => {
                const dx = px - p.x, dz = pz - p.z;
                return dx * dx + dz * dz < (0.4 + p.radius) ** 2;
            });
            if (!blocked) break;
        }
        const { radius, height } = spawnJunkInstance(pick(pool), px, pz);
        propColliders.push({ x: px, z: pz, radius, height });
    }
}

// ---------- airborne junk: fills the sky, ignores gravity ----------
// everything above this line is grounded and situational -- tagged to a
// real feature, given a collider, placed with intent. This is the
// opposite: pure noise, spawned across the whole map footprint and the
// whole height range with no relationship to buildings, features, or
// each other. No precomputed shape catalog either (unlike JUNK_BASE_KINDS
// above) -- every piece is a randomly, independently stretched primitive,
// textured with a gradient/noise map (never a flat solid fill) and tinted
// with the same warm/cool split as everything else in the maze. None of
// it has a collider, which is what makes the density safe: there is no
// amount of this that can trap you, so there's no reason to hold back.
const SKY_SHAPES = ['shard', 'chunk', 'pipe', 'spike', 'blob', 'loop'];
const SKY_JUNK_CAPACITY = 900; // per shape -- generous headroom above any single tier's actual skyJunkCount
const skyJunkMeshes = {};
const skyJunkCounts = {};
const _skyMatrix = new THREE.Matrix4();
const _skyPos = new THREE.Vector3();
const _skyQuat = new THREE.Quaternion();
const _skyEuler = new THREE.Euler();
const _skyScale = new THREE.Vector3();
const _skyColor = new THREE.Color();

// one small gradient/noise texture per shape -- a "look" (torn signage,
// rust, cable, static, smog, tangled wire), never a solid fill. instance
// color (below) only tints this on top, it never replaces it.
function makeSkyJunkTexture(kind) {
    return makePixelTexture((ctx, w, h) => {
        switch (kind) {
            case 'shard': { // torn ad/signage fragment
                const g = ctx.createLinearGradient(0, 0, w, h);
                g.addColorStop(0, '#0a0a0a');
                g.addColorStop(0.5, hexToCss(pick(CONFIG.neonPalette)));
                g.addColorStop(1, '#0a0a0a');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                ctx.globalAlpha = 0.3;
                for (let i = 0; i < 40; i++) {
                    ctx.fillStyle = rng() < 0.5 ? '#000000' : '#ffffff';
                    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
                }
                ctx.globalAlpha = 1;
                break;
            }
            case 'chunk': { // rust / concrete debris
                const g = ctx.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0, '#3a2c20'); g.addColorStop(1, '#141210');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 30; i++) {
                    ctx.fillStyle = `rgba(0,0,0,${rng() * 0.4})`;
                    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 1);
                }
                break;
            }
            case 'pipe': { // scrap metal / cable
                const g = ctx.createLinearGradient(0, 0, w, 0);
                g.addColorStop(0, '#1c1c1c'); g.addColorStop(0.5, '#4a4438'); g.addColorStop(1, '#1c1c1c');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const y = rng() * h;
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
                break;
            }
            case 'spike': { // static / glitch shard
                for (let y = 0; y < h; y++) {
                    ctx.fillStyle = rng() < 0.15 ? hexToCss(pick(CONFIG.neonPalette)) : `rgb(${10 + y},${10 + y},${14 + y})`;
                    ctx.fillRect(0, y, w, 1);
                }
                break;
            }
            case 'blob': { // smog / particulate wisp -- paired with a transparent material below
                const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                g.addColorStop(0, 'rgba(210,210,210,0.9)'); g.addColorStop(1, 'rgba(210,210,210,0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                break;
            }
            case 'loop': { // tangled wire
                const g = ctx.createLinearGradient(0, 0, w, h);
                g.addColorStop(0, '#0c0c0c'); g.addColorStop(1, '#241c14');
                ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = 'rgba(255,220,120,0.3)'; ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.moveTo(rng() * w, 0); ctx.lineTo(rng() * w, h); ctx.stroke();
                }
                break;
            }
        }
    }, 24, 24);
}

for (const shape of SKY_SHAPES) {
    let geo;
    switch (shape) {
        case 'shard': geo = new THREE.PlaneGeometry(1, 1); break;
        case 'chunk': geo = jitterGeometry(new THREE.BoxGeometry(1, 1, 1), 0.08); break;
        case 'pipe': geo = jitterGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), 0.06); break;
        case 'spike': geo = jitterGeometry(new THREE.ConeGeometry(0.5, 1, 6), 0.06); break;
        case 'blob': geo = new THREE.SphereGeometry(0.5, 6, 5); break;
        case 'loop': geo = new THREE.TorusGeometry(0.4, 0.13, 4, 8); break;
    }
    const isBlob = shape === 'blob';
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
        map: makeSkyJunkTexture(shape),
        roughness: 0.95,
        side: THREE.DoubleSide, // flat shards tumble to face-on with the camera constantly -- backface culling would just make them flicker invisible
        transparent: isBlob,
        opacity: isBlob ? 0.55 : 1,
        depthWrite: !isBlob,
    }), SKY_JUNK_CAPACITY);
    mesh.count = 0;
    // instances are spread across the entire map at every height -- a
    // single bounding-sphere frustum cull would either always pass
    // (wasting nothing) or, worse, cull the whole mesh from certain
    // angles even though most instances are still on-screen.
    mesh.frustumCulled = false;
    scene.add(mesh);
    skyJunkMeshes[shape] = mesh;
    skyJunkCounts[shape] = 0;
}

// ---------- floating platforms: a real, climbable sky layer ----------
// distinct from the airborne junk below on purpose: that stuff is dense,
// tumbling, and deliberately collision-free -- pure atmosphere. This is
// the opposite trade: sparse, always upright (so it actually has a flat
// top), and every single one is a real elevatedPlatforms entry you can
// stand on. Laid out as loose ascending chains -- each next platform a
// plausible jump away from the last, never a bigger vertical rise than
// JUMP_RISE, so climbing one chain start-to-finish is always physically
// possible, not just visually implied. This is what makes "the city" a
// real multi-layer thing: ground, rooftops (warehouses), and this.
const JUMP_RISE = 0.85; // conservative under the real jump apex (~0.94 at JUMP_SPEED=5.5/GRAVITY=-16) -- margin for the horizontal hop eating some of the arc
function spawnFloatingPlatformCluster(baseX, baseZ) {
    let x = baseX, z = baseZ;
    let y = randRange(LAYER_Y.caveTop - 1, LAYER_Y.caveTop + 4);
    const count = 3 + Math.floor(rng() * 5); // 3-7 platforms per chain
    for (let i = 0; i < count; i++) {
        const w = randRange(1.4, 2.6), d = randRange(1.4, 2.6), h = randRange(0.3, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color: pick(CONFIG.buildings.palette), roughness: 0.85 });
        const plat = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(w, h, d), 0.04), mat);
        plat.rotation.y = randRange(0, Math.PI * 2);
        plat.position.set(x, y, z);
        scene.add(plat);
        // real floor -- the same elevatedPlatforms mechanism a mezzanine
        // or a warehouse roof uses, not a cosmetic-only mesh
        elevatedPlatforms.push({ x, z, hx: w / 2, hz: d / 2, y: y + h / 2 });

        if (rng() < 0.3 && dynamicLightsRemaining > 0) {
            dynamicLightsRemaining--;
            const light = new THREE.PointLight(pick(CONFIG.neonPalette), 2.5, 5, 2);
            light.position.set(x, y + h / 2 + 0.4, z);
            scene.add(light);
        }

        // next platform: a real jump away -- short horizontal hop, rise
        // capped at JUMP_RISE, so the chain is always climbable in
        // sequence rather than requiring a leap of faith.
        const angle = randRange(0, Math.PI * 2);
        const dist = randRange(1.6, 2.6);
        x += Math.cos(angle) * dist;
        z += Math.sin(angle) * dist;
        y += randRange(0.35, JUMP_RISE);
    }
}

// spawns `count` pieces of pure airborne noise across the whole map
// footprint and the whole height range. The only concession to "normal"
// is a courtesy clearance kept over open/walkable cells near ground
// level, purely so it isn't spawning directly in your face mid-step --
// cosmetic, not physical, since nothing here can ever block movement
// regardless of where it lands.
function spawnSkyJunk(count) {
    const cfg = CONFIG.skyJunk;
    for (let i = 0; i < count; i++) {
        const x = randRange(-GRID_W / 2, GRID_W / 2);
        const z = randRange(-GRID_H / 2, GRID_H / 2);

        // rides the same light-web/dark-web density gradient every
        // ground-level system already does -- thicker air toward the
        // loud south pole, thinner (never clear) toward the quiet north.
        const t = webAlignment(z);
        const gradientMul = THREE.MathUtils.lerp(CONFIG.narrative.darkWeb.propDensityMul, CONFIG.narrative.lightWeb.propDensityMul, t);
        if (rng() > gradientMul) continue;

        let y = cfg.heightMin + (cfg.heightMax - cfg.heightMin) * (rng() ** cfg.heightBias);

        // concentrated low on purpose (heightBias already skews this way),
        // and thinned out hard above the heaven threshold -- the vistas
        // that layer promises need actual open sightlines, not more haze.
        if (y > LAYER_Y.heavenBase && rng() < 0.85) continue;

        const { col, row } = worldToCell(x, z);
        if (grid[row]?.[col] === false && y < cfg.streetClearance) y = cfg.streetClearance + rng() * 2;

        const shape = pick(SKY_SHAPES);
        const idx = skyJunkCounts[shape];
        if (idx >= SKY_JUNK_CAPACITY) continue;
        skyJunkCounts[shape] = idx + 1;

        const s = randRange(cfg.sizeMin, cfg.sizeMax);
        _skyScale.set(
            s * randRange(cfg.stretchMin, cfg.stretchMax),
            s * randRange(cfg.stretchMin, cfg.stretchMax),
            s * randRange(cfg.stretchMin, cfg.stretchMax)
        );
        _skyPos.set(x, y, z);
        // tumbles freely on all 3 axes -- gravity doesn't get a vote
        _skyEuler.set(randRange(0, Math.PI * 2), randRange(0, Math.PI * 2), randRange(0, Math.PI * 2));
        _skyQuat.setFromEuler(_skyEuler);
        _skyMatrix.compose(_skyPos, _skyQuat, _skyScale);

        const mesh = skyJunkMeshes[shape];
        mesh.setMatrixAt(idx, _skyMatrix);
        // same warm/cool split every other signal in the maze rides (t computed above)
        mesh.setColorAt(idx, _skyColor.set(rng() < t ? pick(CONFIG.neonWarm) : pick(CONFIG.neonCool)));
        mesh.count = idx + 1;
    }
    for (const shape of SKY_SHAPES) {
        skyJunkMeshes[shape].instanceMatrix.needsUpdate = true;
        if (skyJunkMeshes[shape].instanceColor) skyJunkMeshes[shape].instanceColor.needsUpdate = true;
    }
    const total = SKY_SHAPES.reduce((sum, shape) => sum + skyJunkCounts[shape], 0);
    console.log(`[testing] sky junk: ${total} instances spawned (requested ${count})`);
}

function addConstructionZone(x, z) {
    // barrier
    const barrierTex = makePixelTexture((ctx, w, h) => {
        for (let i = 0; i < w + h; i += 10) {
            ctx.fillStyle = (i / 10) % 2 === 0 ? '#ff8a1f' : '#181818';
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i + 10, 0); ctx.lineTo(i + 10 - h, h); ctx.lineTo(i - h, h);
            ctx.fill();
        }
    }, 64, 24);
    barrierTex.magFilter = THREE.NearestFilter;
    const barrier = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.6),
        new THREE.MeshStandardMaterial({ map: barrierTex })
    );
    barrier.position.set(x, 0.5, z);
    barrier.rotation.y = randRange(0, Math.PI * 2);
    scene.add(barrier);

    // permit placard zip-tied to the barrier -- every real work site has
    // one of these, and it's a free noise-corpus surface.
    const [permitTitle, permitSub] = pickCityNoisePair(rng, x, z);
    const permitTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8dcae';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#181818';
        ctx.textAlign = 'center';
        ctx.font = 'bold 6px "Courier New", monospace';
        ctx.fillText('PERMIT ON FILE', w / 2, 8);
        ctx.font = 'bold 6px "Courier New", monospace';
        ctx.fillText(permitTitle, w / 2, h / 2 + 2, w - 6);
        ctx.font = '5px "Courier New", monospace';
        ctx.fillText(permitSub, w / 2, h - 6, w - 6);
    }, 56, 40);
    const permit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.26),
        new THREE.MeshStandardMaterial({ map: permitTex, roughness: 0.8 })
    );
    permit.position.set(x + Math.sin(barrier.rotation.y) * 0.42, 0.62, z + Math.cos(barrier.rotation.y) * 0.42);
    permit.rotation.y = barrier.rotation.y;
    scene.add(permit);

    // scaffolding poles nearby against the tallest adjacent wall
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 4; i++) {
        const px = x + (i % 2 === 0 ? -0.9 : 0.9);
        const pz = z + (i < 2 ? -0.9 : 0.9);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), poleMat);
        pole.position.set(px, 2.1, pz);
        scene.add(pole);
    }
    for (let level = 0; level < 3; level++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.05), poleMat);
        bar.position.set(x, 0.8 + level * 1.3, z - 0.9);
        scene.add(bar);
    }
    addTrafficCone(x - 1.2, z + 0.6);
    addTrafficCone(x + 1.2, z - 0.6);
    scatterJunk('construction', x, z, 5, 1.9);
    if (rng() < 0.5) placeRealModel('barrelStove', x + randRange(-1.3, 1.3), z + randRange(-1.3, 1.3), randRange(0, Math.PI * 2));
    return 1.1;
}

// a newsstand kiosk with a real (fake-news) tabloid front page — comic
// relief landmark for plaza cells.
// average open-neighbor direction for a plaza cell, run through the same
// canonical outwardRotationY every wall-mounted object uses (see
// CELL_SIDE_DEFS) — so freestanding kiosks face toward the plaza's
// dominant opening instead of a coin flip that could just as easily
// point the screen at the narrowest gap. This used to hand-roll its own
// atan2(dc,-dr) (a separate, independently-wrong formula that happened
// to match the OLD, backwards north/south convention buildingFaceDefs
// used before it was fixed) -- east/west opens were unaffected (the
// negated z term is a no-op when sz=0), but a plaza open only to the
// north or south faced its kiosk exactly away from the opening.
function plazaFacingRotY(c, r) {
    const opens = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false);
    if (!opens.length) return undefined;
    let sx = 0, sz = 0;
    for (const [dc, dr] of opens) { sx += dc; sz += dr; }
    if (sx === 0 && sz === 0) return undefined; // symmetric plaza, no dominant side
    return outwardRotationY(sx, sz);
}

function addNewsstand(x, z, facingRotY) {
    const [headline, sub] = rng() < 0.72
        ? pickCityNoisePair(rng, x, z)
        : pick(CONFIG.billboards.tabloidHeadlines);
    const booth = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(1.1, 2.0, 0.9), 0.04),
        new THREE.MeshStandardMaterial({ color: pick([0xc8b878, 0xa8c8c8, 0xc06858]), roughness: 0.85 })
    );
    booth.position.y = 1.0;
    const newsFont = pickTextFont();
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#eee8d8';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#181818';
        ctx.textAlign = 'center';
        ctx.font = `bold 11px ${newsFont}`;
        ctx.fillText(headline, w / 2, h / 2 - 6, w - 6);
        ctx.font = `8px ${newsFont}`;
        ctx.fillText(sub, w / 2, h / 2 + 10, w - 6);
    }, 120, 60);
    const board = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.5),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    board.position.set(0, 1.7, 0.46);
    const g = new THREE.Group();
    g.add(booth, board);
    g.rotation.y = facingRotY ?? randRange(0, Math.PI * 2);
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.6;
}

// a glass-and-frame phone booth — obsolete infrastructure, kept as a
// landmark. Faint interior light so it reads at a distance.
function addPhoneBooth(x, z) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc06858, roughness: 0.6, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xc8e8e0, roughness: 0.2, transparent: true, opacity: 0.35 });
    const g = new THREE.Group();
    const frame = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(0.85, 2.1, 0.85), 0.02), frameMat);
    frame.position.y = 1.05;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), glassMat);
    glass.position.y = 1.1;
    g.add(frame, glass);

    // a directory card on the back panel -- obsolete infrastructure still
    // has paperwork, and it's one more free noise-corpus surface.
    const [dirTitle, dirSub] = pickCityNoisePair(rng, x, z);
    const dirTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#f0ece0';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#181818';
        ctx.textAlign = 'center';
        ctx.font = 'bold 5px "Courier New", monospace';
        ctx.fillText('DIRECTORY', w / 2, 7);
        ctx.font = '5px "Courier New", monospace';
        ctx.fillText(dirTitle, w / 2, h / 2, w - 6);
        ctx.fillText(dirSub, w / 2, h / 2 + 9, w - 6);
    }, 44, 56);
    const directory = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.5),
        new THREE.MeshStandardMaterial({ map: dirTex, roughness: 0.85 })
    );
    directory.position.set(0, 1.15, -0.43);
    directory.rotation.y = Math.PI;
    g.add(directory);

    g.position.set(x, 0, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xfff4d0, 1.5, 3, 2);
        light.position.set(x, 1.6, z);
        scene.add(light);
    }
    return 0.45;
}

// an ATM kiosk, screen glowing with the same "system noise" humor as the
// signage elsewhere — the machinery of finance admitting it's confused too.
function addAtmKiosk(x, z, facingRotY) {
    const [msg, sub] = rng() < 0.72
        ? pickNetworkNoise(rng)
        : pick(CONFIG.billboards.systemNoise);
    const body = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(0.6, 1.4, 0.5), 0.03),
        new THREE.MeshStandardMaterial({ color: 0x9adfc0, roughness: 0.4, metalness: 0.5 })
    );
    body.position.y = 0.7;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0a1410';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#3aff6a';
        ctx.textAlign = 'center';
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText(msg, w / 2, h / 2 - 4, w - 6);
        ctx.font = '7px "Courier New", monospace';
        ctx.fillText(sub, w / 2, h / 2 + 8, w - 6);
    }, 72, 48);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.28),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    screen.position.set(0, 0.9, 0.26);
    const g = new THREE.Group();
    g.add(body, screen);
    g.rotation.y = facingRotY ?? randRange(0, Math.PI * 2);
    g.position.set(x, 0, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0x3aff6a, 1.2, 2, 2);
        light.position.set(x, 0.9, z + 0.3);
        scene.add(light);
    }
    return 0.4;
}

function addCrimeScene(x, z) {
    const rotY = randRange(0, Math.PI * 2);
    const tapeTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8d800';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#101010';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('POLICE LINE  DO NOT CROSS  ', 0, h / 2 + 5);
    }, 200, 24);
    tapeTex.wrapS = THREE.RepeatWrapping;
    tapeTex.repeat.set(2, 1);
    tapeTex.magFilter = THREE.NearestFilter;

    const tape = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.2),
        new THREE.MeshBasicMaterial({ map: tapeTex })
    );
    tape.position.set(x, 0.9, z);
    tape.rotation.y = rotY;
    scene.add(tape);

    for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1, 6),
            new THREE.MeshStandardMaterial({ color: 0x1c1c1c })
        );
        pole.position.set(
            x + Math.sin(rotY) * side * 1.3,
            0.5,
            z + Math.cos(rotY) * side * 1.3
        );
        scene.add(pole);
    }

    const chalkTex = makePixelTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#f4f4f4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w * 0.32, h * 0.42, 0, 0, Math.PI * 2);
        ctx.moveTo(w * 0.3, h * 0.3); ctx.lineTo(w * 0.15, h * 0.05);
        ctx.moveTo(w * 0.7, h * 0.3); ctx.lineTo(w * 0.85, h * 0.05);
        ctx.stroke();
    }, 64, 64);
    const outline = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: chalkTex, transparent: true, depthWrite: false })
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(x, 0.02, z + 0.8);
    scene.add(outline);

    // numbered evidence markers
    for (let i = 0; i < 3; i++) {
        const marker = new THREE.Mesh(
            new THREE.ConeGeometry(0.12, 0.18, 4),
            new THREE.MeshStandardMaterial({ color: 0xf4e84a })
        );
        marker.position.set(x + randRange(-1, 1), 0.09, z + randRange(-1, 1));
        scene.add(marker);
    }
    scatterJunk('crimeScene', x, z, 3, 1.4);
    return 1.4;
}

const PROP_BUILDERS = {
    trashCan: addTrashCan,
    trafficCone: addTrafficCone,
    trafficSign: (x, z, facingRotY) => addTrafficSign(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
    trafficSignal: (x, z, facingRotY) => addTrafficSignal(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
    mileMarker: (x, z, facingRotY) => addMileMarker(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
    wantedPoster: (x, z, facingRotY) => addWantedPoster(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
    crate: addCrate,
    lantern: addLantern,
    vendingMachine: addVendingMachine,
    fenceSegment: (x, z, facingRotY) => addFenceSegment(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
    museumPlacard: addMuseumPlacard,
    stickerTag: addStickerTag,
    businessCardLitter: addBusinessCardLitter,
    manhole: addManhole,
    pigeon: addPigeon,
    fissureCrack: addFissureCrack,
    tree: addTree,
    pottedPlant: addPottedPlant,
    weeds: addWeeds,
};

// hand-authored props don't measure their own real height the way
// spawnJunkInstance does (it has the actual scaled mesh dimensions) --
// these are reasonable real-world approximations, keyed the same as
// PROP_BUILDERS, so resolveCollisions/groundHeightAt can tell "short
// enough to auto-step or jump onto" from "an actual wall" for every prop,
// not just junk. Missing keys fall back to a generic mid-height guess.
const PROP_HEIGHTS = {
    trashCan: 0.85, trafficCone: 0.6, trafficSign: 1.9, trafficSignal: 2.9,
    mileMarker: 1.7, wantedPoster: 1.3, crate: 0.5, lantern: 1.6,
    vendingMachine: 1.8, fenceSegment: 0.9, museumPlacard: 1.1,
    stickerTag: 0.02, businessCardLitter: 0.02, manhole: 0.02, pigeon: 0.2,
    fissureCrack: 0.02, tree: 2.5, pottedPlant: 0.4, weeds: 0.15,
};

// ---------- lay out the grid ----------

const propColliders = []; // {x, z, radius, height} — soft obstacles, blended into collision pass. height === Infinity means "always a wall, never a valid floor to land on" (used for diffuse/non-object footprints like parks and construction zones)

// one real building PER SITE now, not per cell -- addBuildingSite builds
// every cell in the site as its own full-scale module (walkable ground
// floor, door toward an open neighbor if it has one, real per-wall
// collision, interior dressing, its own real roof), so a multi-cell site
// comes out as a genuinely that-shaped building instead of one square
// per grid cell.
{
    const buildStart = performance.now();
    for (const site of buildingSites) site.signatureType ? buildSignatureSite(site) : addBuildingSite(site);
    console.log(`[perf] ${buildingSites.length} building sites (${buildingSites.reduce((s, x) => s + x.cells.length, 0)} cells) generated in ${(performance.now() - buildStart).toFixed(0)}ms (${bootElapsed()} total)`);
    console.log(`[testing] same-site height mismatches: ${totalExposedSetbackWalls} exterior setback wall-floors generated where a same-site neighbor stopped short (floor-aware internal-edge fix -- was structurally always 0 before)`);
}

// HARD TESTS -- run once, after EVERY consumer of facade occupancy has
// had its turn (including mountContentCards, which claims leftover
// facades for real site content) so these actually validate the
// complete, final state rather than a snapshot from partway through
// generation.
function validateFacadeOccupancy() {
    // every reservation on every real FacadeSurface -- doors, fire
    // escapes, every sign (see placeSignsOnFacade), and now every
    // content card too -- must fall entirely within that facade's own
    // real [yMin,yMax]. This is exactly the bug class that let signs
    // float above a one-floor building's own roof: the old code
    // reserved a band computed from floorHeight instead of the facade's
    // real height, so the reservation was already out-of-bounds before
    // the mesh was even built. Runs across every generated facade on
    // every seed, not one hand-picked test building.
    let facadeBoundsViolations = 0;
    for (const facade of buildingFacades) {
        for (const r of facade.occupied) {
            if (r.vMin < facade.yMin - 0.01 || r.vMax > facade.yMax + 0.01) {
                facadeBoundsViolations++;
                if (facadeBoundsViolations <= 5) {
                    console.warn(`[testing] FAILED facade occupancy bounds: facade #${facade.id} (${facade.exposure}) yRange=[${facade.yMin.toFixed(2)},${facade.yMax.toFixed(2)}] but a reservation spans vMin=${r.vMin.toFixed(2)} vMax=${r.vMax.toFixed(2)}`);
                }
            }
        }
    }
    console.log(`[testing] facade occupancy bounds self-test: ${facadeBoundsViolations === 0 ? 'PASS' : `FAIL (${facadeBoundsViolations} violations)`} across ${buildingFacades.length} facades`);

    // no two registered world-space projection volumes (blade sign arms/
    // panels, awnings, fire escapes) actually intersect -- catches
    // exactly the cross-facade corner case a facade's own u/v occupancy
    // can't see (two perpendicular walls both projecting into the same
    // shared alley volume). O(n^2) but n is only ever a few hundred
    // projecting fixtures citywide -- a one-time boot check, not a
    // per-frame cost.
    let projectionIntersections = 0;
    for (let i = 0; i < exteriorDecorationVolumes.length; i++) {
        for (let j = i + 1; j < exteriorDecorationVolumes.length; j++) {
            if (boxesIntersect(exteriorDecorationVolumes[i], exteriorDecorationVolumes[j])) projectionIntersections++;
        }
    }
    console.log(`[testing] world-space projection intersection self-test: ${projectionIntersections === 0 ? 'PASS' : `FAIL (${projectionIntersections} intersecting pairs)`} across ${exteriorDecorationVolumes.length} registered projections`);
}

mountContentCards(); // real site content claims leftover wall faces
validateFacadeOccupancy();
addFacadeDebugOverlay();
addSignatureDebugOverlay();
buildRooftopCatwalks(); // every building's rooftop deck now exists -- an occasional real bridge between nearby ones
bootStatus(`city built, ${GRID_COLS * GRID_ROWS} cells -- placing props/decoration…`);

// ---------- the one true signal ----------
// BFS out from spawn over open cells; the dead end with the greatest walk
// distance gets the single real marker. Everything else you can find here
// is noise wearing his name — this is the only verified one, and it's
// buried as deep as the maze allows.
{
    const dist = new Map();
    const key = (c, r) => `${c},${r}`;
    dist.set(key(spawnCol, spawnRow), 0);
    const queue = [[spawnCol, spawnRow]];
    while (queue.length) {
        const [c, r] = queue.shift();
        const d = dist.get(key(c, r));
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nc = c + dc, nr = r + dr;
            if (grid[nr]?.[nc] === false && !dist.has(key(nc, nr))) {
                dist.set(key(nc, nr), d + 1);
                queue.push([nc, nr]);
            }
        }
    }

    // rank every dead end by walk distance from spawn. Rank 0 (farthest)
    // is the one true signal; ranks 1-2 are near-miss decoys planted at
    // the next-farthest dead ends — close enough in distance and styling
    // to be genuinely tempting, not obviously wrong.
    const deadEnds = [];
    for (const [k, d] of dist) {
        const [c, r] = k.split(',').map(Number);
        if (openNeighborCount(c, r) === 1) deadEnds.push({ c, r, d });
    }
    deadEnds.sort((a, b) => b.d - a.d);

    const placements = [CONFIG.billboards.signal, ...CONFIG.billboards.nearMissSignals];
    placements.forEach((content, i) => {
        const cell = deadEnds[i];
        if (!cell) return;
        const { c: sc, r: sr } = cell;
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const bc = sc + dc, br = sr + dr;
            if (!grid[br]?.[bc]) continue; // needs a solid building to mount on
            // an actual exposed FacadeSurface belonging to that module,
            // facing back toward the dead end (-dc,-dr) -- not four
            // imaginary cardinal faces re-derived from a bare hwx/hwz
            // (the old buildingFaceDefs), which knows nothing of which
            // sides are real street-facing walls vs. party/internal/
            // courtyard edges a sign can't actually be mounted on at all.
            const moduleKey = `${br},${bc}`;
            const facade = buildingFacades.find(f => f.moduleKey === moduleKey && f.dx === -dc && f.dz === -dr);
            if (!facade) continue;
            const spot = findFreeFacadeRect(facade, i === 0 ? 'photo' : 'sign', i === 0 ? 1.8 : 2.0, i === 0 ? 1.8 * (168 / 128) : 1.6, facade.yMin + 2.0, Math.min(facade.yMax - 0.3, facade.yMin + 5));
            if (!spot) continue;
            const p = pointOnFacade(facade, spot.u, spot.v);
            if (i === 0) {
                // the one true signal carries his actual photo -- the
                // near-miss decoys stay text-only, since they're
                // specifically NOT him and showing a real photo there
                // would give the game away.
                placePhotoPoster('portrait', p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, { width: 1.8, frameColor: '#ffffff' });
            } else {
                addSign(p.x, p.y, p.z, facade.rotY, content.title, content.subtitle, content.color);
            }
            break;
        }
    });
}

// one plaza cell reserved up front, before the general shuffle below
// hands cells out to statues/parks/etc -- guarantees the Stairway to
// Heaven always gets a spot with real open room around it (a dead end's
// own building is boxed in on 3 sides by definition, no room for
// anything to wrap around) instead of competing for leftovers. Falls
// back to spawn's own cell on the rare maze with no plazas at all.
const heavenCell = plazaCells.length ? pick(plazaCells) : [spawnCol, spawnRow];

// special features placed on plaza cells (wider open junctions)
const shuffledPlazas = [...plazaCells]
    .filter(c => c[0] !== heavenCell[0] || c[1] !== heavenCell[1])
    .sort(() => rng() - 0.5);
let plazaCursor = 0;
function nextPlazaCell() {
    return plazaCursor < shuffledPlazas.length ? shuffledPlazas[plazaCursor++] : null;
}

for (let i = 0; i < CONFIG.props.maxSpecialFeatures.statues; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addStatue(x, z);
    propColliders.push({ x, z, radius: r, height: 2.3 });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.constructionZones; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addConstructionZone(x, z);
    // a diffuse scaffolding footprint, not a single solid object -- keep
    // it an always-wall like before rather than a fake flat "roof" to land on
    propColliders.push({ x, z, radius: r, height: Infinity });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.crimeScenes; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    addCrimeScene(x, z); // decorative + tape, no hard collider
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.newsstands; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addNewsstand(x, z, plazaFacingRotY(cell[0], cell[1]));
    propColliders.push({ x, z, radius: r, height: 2.0 });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.phoneBooths; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addPhoneBooth(x, z);
    propColliders.push({ x, z, radius: r, height: 2.2 });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.atmKiosks; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addAtmKiosk(x, z, plazaFacingRotY(cell[0], cell[1]));
    propColliders.push({ x, z, radius: r, height: 2.0 });
}
const parkCells = new Set(); // parks get grass, not street asphalt or alley pavement
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.parks; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    // no outer collider for the park itself -- addPark's return value was
    // "keep other stuff clear of the whole park" (CELL * 0.5, nearly the
    // whole cell), never a real object footprint, but it was still being
    // pushed as a real player-blocking collider: an invisible wall over
    // most of the park, unwalkable at the exact spot it should be open
    // grass. nextPlazaCell already assigns this cell exclusively to the
    // park, so there was never anything for a collider here to actually
    // keep clear of. Its real trees/bench still push their own small
    // colliders inside addPark.
    addPark(x, z);
    parkCells.add(`${cell[0]},${cell[1]}`);
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.megaBillboards; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addMegaBillboard(x, z);
    // thin legs holding a sign high overhead, not a solid object at
    // ground level -- Infinity keeps it the plain always-wall it was
    propColliders.push({ x, z, radius: r, height: Infinity });
}

// the one, findable Stairway to Heaven -- see buildStairwayToHeaven's own
// comment. heavenCell was reserved before any of the loops above touched
// plazaCells, so this always gets a real spot.
{
    const { x, z } = cellToWorld(heavenCell[0], heavenCell[1]);
    buildStairwayToHeaven(x, z);
}

// every plaza gets a bright pool of light, regardless of whether it also
// hosts a statue/landmark — open areas are lit, full stop.
for (const [pc, pr] of plazaCells) {
    const { x, z } = cellToWorld(pc, pr);
    addPlazaGlow(x, z);
    if (rng() < 0.85 * QUALITY.propDensity) scatterJunk('plaza', x, z, 1 + Math.floor(rng() * 3), CELL * 0.4);
}

// props that realistically sit against a wall rather than floating in
// the middle of a walkway — real alleys put trash cans and machines
// against the building, not centered in the path.
const WALL_HUGGING_PROPS = new Set([
    'trashCan', 'vendingMachine', 'museumPlacard', 'trafficSign', 'mileMarker', 'wantedPoster',
    'fenceSegment', 'stickerTag', 'businessCardLitter',
]);

// which adjacent cells (if any) are solid walls this cell could hug —
// returns unit direction(s) pointing FROM the open cell TOWARD each wall.
// a through-street, not a back alley — wider-reading, asphalt with lane
// striping, real sidewalks along any adjacent building face. Everything
// NOT on this grid stays an alley (current grimy pavement, no sidewalk).
function isStreetCell(c, r) {
    const s = CONFIG.streets.gridSpacing;
    return r % s === 0 || c % s === 0;
}

function addStreetSurface(c, r, x, z) {
    const horizontal = grid[r]?.[c - 1] === false || grid[r]?.[c + 1] === false;
    const vertical = grid[r - 1]?.[c] === false || grid[r + 1]?.[c] === false;
    const intersection = horizontal && vertical; // a real 4-way crossing -- gets marked crosswalks + stop bars, not just through-lane dashes
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#1e1e1e'; // asphalt — darker/cleaner than alley pavement
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#c8c840';
        if (horizontal) for (let i = 6; i < w; i += 16) ctx.fillRect(i, h / 2 - 1, 8, 2);
        if (vertical) for (let i = 6; i < h; i += 16) ctx.fillRect(w / 2 - 1, i, 2, 8);

        if (intersection) {
            // 4 INDEPENDENT crossings, one per actual approach -- each
            // sits near that approach's own outer edge (connecting one
            // sidewalk to the opposite one straight across the roadway),
            // not a single zebra "+" baked through the center. Only the
            // approaches that actually exist get one, so a T-intersection
            // gets 3 crossings, never a phantom 4th toward a wall. Stop
            // bars sit just outside (further from center than) their own
            // crossing, on the vehicle-approach side -- encountered
            // first, same order a real driver hits them in. The whole
            // middle of the intersection stays open asphalt.
            const approaches = [
                { open: grid[r - 1]?.[c] === false, edge: 'n' },
                { open: grid[r + 1]?.[c] === false, edge: 's' },
                { open: grid[r]?.[c - 1] === false, edge: 'w' },
                { open: grid[r]?.[c + 1] === false, edge: 'e' },
            ];
            const crossDepth = 11, edgeGap = 7, span = 34, stripeW = 5, stripeGap = 4;
            const barLen = span - 4, barThick = 3;
            ctx.fillStyle = '#e8e8dc';
            for (const a of approaches) {
                if (!a.open) continue;
                if (a.edge === 'n' || a.edge === 's') {
                    const y0 = a.edge === 'n' ? edgeGap : h - edgeGap - crossDepth;
                    for (let sx = w / 2 - span / 2; sx < w / 2 + span / 2; sx += stripeGap + stripeW) {
                        ctx.fillRect(sx, y0, stripeW, crossDepth);
                    }
                } else {
                    const x0 = a.edge === 'w' ? edgeGap : w - edgeGap - crossDepth;
                    for (let sz = h / 2 - span / 2; sz < h / 2 + span / 2; sz += stripeGap + stripeW) {
                        ctx.fillRect(x0, sz, crossDepth, stripeW);
                    }
                }
                if (a.edge === 'n') ctx.fillRect(w / 2 - barLen / 2, edgeGap - barThick - 2, barLen, barThick);
                else if (a.edge === 's') ctx.fillRect(w / 2 - barLen / 2, h - edgeGap + 2, barLen, barThick);
                else if (a.edge === 'w') ctx.fillRect(edgeGap - barThick - 2, h / 2 - barLen / 2, barThick, barLen);
                else ctx.fillRect(w - edgeGap + 2, h / 2 - barLen / 2, barThick, barLen);
            }
        }
    }, 64, 64);
    // full cell width (a hair OVER it, not under) -- connected street
    // cells now share an exact or slightly-overlapping boundary instead
    // of each shrinking in from it, so there's no gap for the ground
    // plane underneath to show through as a seam/crack. Y offset (below)
    // is still what handles z-fighting against the ground plane -- never
    // physical X/Z shrinkage.
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 1.01, CELL * 1.01),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.006, z);
    scene.add(road);

    // real sidewalk strip wherever this street cell actually borders a
    // building — a raised, lighter concrete band with a curb lip. Same
    // full-width-plus-a-hair rule along its own length so consecutive
    // sidewalk cells butt/overlap continuously instead of leaving a gap
    // every CELL units.
    for (const w of wallDirections(c, r)) {
        const stripWidth = CELL * 0.18;
        const stripLen = CELL * 1.01;
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w.dx !== 0 ? stripWidth : stripLen, 0.06, w.dz !== 0 ? stripWidth : stripLen),
            new THREE.MeshStandardMaterial({ color: 0xc8c2a8, roughness: 0.9 })
        );
        strip.position.set(x + w.dx * (CELL / 2 - stripWidth / 2), 0.03, z + w.dz * (CELL / 2 - stripWidth / 2));
        scene.add(strip);
    }
}

// a park bench — reused wherever a park needs one.
function addBench(x, z, rotY) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 });
    const g = new THREE.Group();
    const seat = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(1.2, 0.06, 0.4), 0.02), mat);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(1.2, 0.4, 0.06), 0.02), mat);
    back.position.set(0, 0.62, -0.17);
    g.add(seat, back);
    for (const lx of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.36), mat);
        leg.position.set(lx, 0.21, 0);
        g.add(leg);
    }
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);
    return 0.5;
}

// a real park — grass patch, a small cluster of (mostly living) trees,
// a bench. The green counterweight to everything paved and neon.
// an oversized jumbotron-style billboard on a scaffold tower -- real
// Times-Square-style plazas have a few of these towering over everything
// else, not just shopfront-scale signs. Two stacked ad panels + a
// support frame, pulling from the same content pools as regular signs.
function addMegaBillboard(x, z) {
    const rotY = randRange(0, Math.PI * 2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, metalness: 0.5 });
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.12, 0.14, 7, 6), 0.02), frameMat);
        leg.position.set(side * 1.3, 3.5, 0);
        g.add(leg);
    }
    for (let i = 0; i < 2; i++) {
        const content = pickSignContent(x, z);
        const neon = pick(CONFIG.neonPalette);
        const font = pickTextFont();
        const backing = pick(SIGN_BACKINGS);
        const tex = makePixelTexture((ctx, w, h) => {
            const color = hexToCss(neon);
            ctx.fillStyle = backing;
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, w - 4, h - 4);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.font = `bold 34px ${font}`;
            ctx.fillText(content.title, w / 2, h / 2 - 8, w - 16);
            ctx.font = `18px ${font}`;
            ctx.fillText(content.subtitle, w / 2, h / 2 + 26, w - 16);
        }, 160, 96);
        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 1.9),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        panel.position.set(0, 5 + i * 2.1, 0.05);
        g.add(panel);

        if (dynamicLightsRemaining > 0) {
            dynamicLightsRemaining--;
            const light = new THREE.PointLight(neon, 6, 12, 2);
            light.position.set(0, 5 + i * 2.1, 1);
            g.add(light);
        }
    }
    g.rotation.y = rotY;
    g.position.set(x, 0, z);
    scene.add(g);
    return 1.4;
}

function addPark(x, z) {
    const grassTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#3a5c2e';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 300; i++) {
            const shade = 20 + Math.floor(rng() * 30);
            ctx.fillStyle = `rgb(${40 + shade * 0.4},${70 + shade},${30 + shade * 0.3})`;
            ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
        }
    }, 96, 96);
    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 0.95, CELL * 0.95),
        new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(x, 0.007, z);
    scene.add(grass);

    const clusterCount = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < clusterCount; i++) {
        const px = x + randRange(-CELL * 0.38, CELL * 0.38);
        const pz = z + randRange(-CELL * 0.38, CELL * 0.38);
        addTree(px, pz);
        propColliders.push({ x: px, z: pz, radius: 0.25, height: PROP_HEIGHTS.tree });
    }
    const benchAngle = randRange(0, Math.PI * 2);
    addBench(x + Math.cos(benchAngle) * 1.4, z + Math.sin(benchAngle) * 1.4, benchAngle + Math.PI / 2);
    scatterJunk('park', x, z, 4, CELL * 0.4);
    if (rng() < 0.4) placeRealModel('ironGate', x, z - CELL * 0.42, 0); // a real wrought-iron entrance gate on the park's north edge
    return CELL * 0.5;
}

function wallDirections(c, r) {
    const dirs = [];
    if (grid[r]?.[c - 1]) dirs.push({ dx: -1, dz: 0 });
    if (grid[r]?.[c + 1]) dirs.push({ dx: 1, dz: 0 });
    if (grid[r - 1]?.[c]) dirs.push({ dx: 0, dz: -1 });
    if (grid[r + 1]?.[c]) dirs.push({ dx: 0, dz: 1 });
    return dirs;
}

// a real inside corner: exactly two of this cell's wall directions that
// are perpendicular (not opposite) -- the actual geometric nook debris
// would realistically accumulate in (building/building around an alley
// corner, building/dead-end, etc), not just "this cell has some walls."
function findCornerDirs(c, r) {
    const walls = wallDirections(c, r);
    for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
            const a = walls[i], b = walls[j];
            if (a.dx * b.dx + a.dz * b.dz === 0) return [a, b]; // dot product 0 -> perpendicular
        }
    }
    return null;
}

// a single climbable-terrain item -- exactly `targetTop` tall (footprint
// jitters for visual variety, height doesn't) so the collider height
// (what groundHeightAt/resolveCollisions see) always exactly matches
// what's rendered, and every item within one tier is genuinely
// step-across-flat with the others -- the same "no daylight between
// geometry and collision" rule the rest of this refactor holds to.
const CORNER_PILE_COLORS = [0x6a5a42, 0x8a7858, 0x3a3a3a, 0x5a4a34, 0x707060, 0x4a4438];
function addPileCrate(x, z, targetTop) {
    const h = targetTop;
    const w = randRange(0.45, 0.7), d = randRange(0.45, 0.7);
    const mesh = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(w, h, d), 0.04),
        new THREE.MeshStandardMaterial({ color: pick(CORNER_PILE_COLORS), roughness: 0.9 })
    );
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = randRange(0, Math.PI * 2);
    scene.add(mesh);
    return { radius: Math.max(w, d) / 2, height: h };
}

// debris genuinely accumulated into a corner -- spreads horizontally
// near the floor and grows vertically toward the back/dense end (deeper
// into the nook, backed against both walls), in tiers rather than one
// big flat-topped collider. The first couple of tiers rise gently enough
// to auto-step onto (same MAX_STEP_HEIGHT logic as stepping onto a single
// crate); the later ones are a deliberately bigger rise that needs a
// real jump -- a genuine climbable progression, not a ramp in disguise.
// Each tier is 2-3 independent crates (independent colliders/walkable
// tops), not one wide box, so the pile's silhouette is irregular and it
// still reads as accumulated junk up close.
// same visual/collision contract as addPileCrate ({radius, height}, a
// real GLB instead of a primitive box) -- scaled non-uniformly on Y so
// its actual height always lands exactly on targetTop regardless of the
// source asset's natural size, same "no daylight between geometry and
// collision" rule addPileCrate follows.
function addPileAsset(def, x, z, targetTop) {
    const [bx0, by0, bz0] = def.boundsMin, [bx1, , bz1] = def.boundsMax;
    const naturalH = Math.max(0.05, def.boundsMax[1] - by0);
    const scaleY = targetTop / naturalH;
    const halfX = Math.max(Math.abs(bx0), Math.abs(bx1));
    const halfZ = Math.max(Math.abs(bz0), Math.abs(bz1));
    placeCityAsset(def.id, x, z, randRange(0, Math.PI * 2), { y: -by0 * scaleY, scale: { x: 1, y: scaleY, z: 1 } });
    return { radius: Math.max(halfX, halfZ), height: targetTop };
}
const cornerPileAssetPool = cityAssetsByCategory('trash_climbable');

function buildCornerPile(x, z, intoX, intoZ, tierCount) {
    let height = 0, px = x, pz = z;
    for (let i = 0; i < tierCount; i++) {
        const rise = i < 2 ? randRange(0.35, 0.6) : randRange(0.75, 0.92);
        height += rise;
        px += intoX * randRange(0.3, 0.5);
        pz += intoZ * randRange(0.3, 0.5);
        // ~35% of tiers use one real trash_climbable GLB (an actual
        // authored pile/stack shape from the city model pack) instead of
        // 2-3 primitive crates -- both read as "junk pile", the real
        // assets add silhouette variety boxes can't.
        if (cornerPileAssetPool.length && rng() < 0.35) {
            const def = pick(cornerPileAssetPool);
            const jx = px + randRange(-0.25, 0.25), jz = pz + randRange(-0.25, 0.25);
            const { radius, height: realHeight } = addPileAsset(def, jx, jz, height);
            propColliders.push({ x: jx, z: jz, radius, height: realHeight });
            continue;
        }
        const itemCount = 2 + Math.floor(rng() * 2);
        for (let j = 0; j < itemCount; j++) {
            const jx = px + randRange(-0.45, 0.45), jz = pz + randRange(-0.45, 0.45);
            const { radius, height: realHeight } = addPileCrate(jx, jz, height);
            propColliders.push({ x: jx, z: jz, radius, height: realHeight });
        }
    }
    // loose debris around the base -- tires/bags/scrap, purely cosmetic
    // flavor scattered at the pile's foot, not part of the climb itself.
    scatterJunk('alley', x + intoX * 0.3, z + intoZ * 0.3, 2 + Math.floor(rng() * 2), 0.9);
    return height;
}

// which single axis (if any) this open cell is a straight through-
// corridor along -- open neighbors on both sides of exactly one axis.
// null for dead ends, corners, and plaza junctions, where there's no
// single lane to protect and the wider footprint already has more room.
function throughAxis(c, r) {
    const openX = grid[r]?.[c - 1] === false && grid[r]?.[c + 1] === false;
    const openZ = grid[r - 1]?.[c] === false && grid[r + 1]?.[c] === false;
    if (openX && !openZ) return 'x';
    if (openZ && !openX) return 'z';
    return null;
}

// a real carve-out, not just more collision-solver passes: clutter
// placed in a straight corridor gets pushed off to one side instead of
// jittered freely across the whole width, so there's always a walkable
// lane down the middle regardless of how dense the alley gets. No axis
// (dead end/corner/plaza) falls back to the old free 2D jitter.
function laneOffset(spread, axis) {
    if (!axis) return [randRange(-spread, spread), randRange(-spread, spread)];
    const side = (rng() < 0.5 ? -1 : 1) * randRange(0.55, 0.95) * spread;
    return axis === 'x' ? [randRange(-spread, spread), side] : [side, randRange(-spread, spread)];
}

// reject placements that would overlap something already there — cheap
// O(n) scan against everything placed so far. Real streets don't stack
// a trash can through a lamp post. Gives up after a few tries rather
// than leaving a gap (density matters more than a rare overlap).
function findClearSpot(cx, cz, radius, tryOffsets) {
    for (const [ox, oz] of tryOffsets) {
        const px = cx + ox, pz = cz + oz;
        const blocked = propColliders.some(p => {
            const dx = px - p.x, dz = pz - p.z;
            return dx * dx + dz * dz < (radius + p.radius + 0.1) ** 2;
        });
        if (!blocked) return { x: px, z: pz };
    }
    return { x: cx + tryOffsets[0][0], z: cz + tryOffsets[0][1] }; // give up, place anyway
}

// general clutter across all remaining open cells (skip start cell + used plazas)
const usedPlazas = new Set(shuffledPlazas.slice(0, plazaCursor).map(([c, r]) => `${c},${r}`));
for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
        if (grid[r][c]) continue;
        if (c === spawnCol && r === spawnRow) continue;
        if (usedPlazas.has(`${c},${r}`)) continue;
        if (parkCells.has(`${c},${r}`)) continue; // already laid down as grass

        const { x, z } = cellToWorld(c, r);
        // scatterJunk itself is cheap (instanced — a handful of draw
        // calls total regardless of count), but propColliders growth and
        // the real-model clones below aren't free, so all of this still
        // scales with QUALITY.propDensity like everything else does.
        const onStreet = isStreetCell(c, r);
        const laneAxis = throughAxis(c, r); // null off a straight corridor -- carve-out only applies where there's a single lane to protect
        if (onStreet) {
            addStreetSurface(c, r, x, z);
            if (rng() < 0.45 * QUALITY.propDensity) scatterJunk('street', x, z, 1 + Math.floor(rng() * 3), CELL * 0.34, laneAxis);
            if (rng() < 0.15 * QUALITY.propDensity) {
                const w = wallDirections(c, r);
                if (w.length) {
                    const dir = pick(w);
                    placeRealModel('streetLamp', x + dir.dx * (CELL * 0.4), z + dir.dz * (CELL * 0.4), randRange(0, Math.PI * 2));
                }
            }
        } else if (rng() < 0.75 * QUALITY.propDensity) {
            scatterJunk('alley', x, z, 1 + Math.floor(rng() * 3), CELL * 0.3, laneAxis);
        }
        // corner piles: a real inside corner (2 perpendicular walls --
        // building/building, building/dead-end, etc.) gets a chance at
        // accumulated debris that's actually climbable terrain, not just
        // denser scatter. Never on a through-street -- that's thoroughfare,
        // not a place junk piles up.
        if (!onStreet) {
            const corner = findCornerDirs(c, r);
            if (corner && rng() < 0.22 * QUALITY.propDensity) {
                const intoX = corner[0].dx + corner[1].dx, intoZ = corner[0].dz + corner[1].dz; // toward the nook both walls form
                const len = Math.hypot(intoX, intoZ) || 1;
                buildCornerPile(x + (intoX / len) * CELL * 0.22, z + (intoZ / len) * CELL * 0.22, intoX / len, intoZ / len, 2 + Math.floor(rng() * 3));
            }
        }
        // real scanned props are NOT instanced (each is its own draw
        // call) -- sparse by design, and doubly gated on quality tier.
        if (rng() < 0.05 * QUALITY.propDensity) placeRealModel('tyre', x + randRange(-1.5, 1.5), z + randRange(-1.5, 1.5), randRange(0, Math.PI * 2));
        if (rng() < 0.05 * QUALITY.propDensity) placeRealModel('trashbag', x + randRange(-1.5, 1.5), z + randRange(-1.5, 1.5), randRange(0, Math.PI * 2));
        if (rng() < 0.06 * QUALITY.propDensity) placeRealModel('manhole', x + randRange(-0.6, 0.6), z + randRange(-0.6, 0.6), randRange(0, Math.PI * 2));
        if (rng() < 0.04 * QUALITY.propDensity) placeRealModel('trashCanReal', x + randRange(-1.4, 1.4), z + randRange(-1.4, 1.4), randRange(0, Math.PI * 2));

        // overhead cables: strung across the alley wherever there's a
        // building directly on both sides (either axis) — the literal
        // network overhead, independent of ground clutter below it.
        if (grid[r]?.[c - 1] && grid[r]?.[c + 1]) {
            const wa = cellToWorld(c - 1, r), wb = cellToWorld(c + 1, r);
            const fa = footprintOf[r][c - 1]?.hwx ?? CELL * 0.3, fb = footprintOf[r][c + 1]?.hwx ?? CELL * 0.3;
            if (rng() < 0.5) addOverheadCable(wa.x + fa, wa.z, wb.x - fb, wb.z);
            if (rng() < 0.48) addCanopyTarp(wa.x + fa, wa.z, wb.x - fb, wb.z);
        }
        if (grid[r - 1]?.[c] && grid[r + 1]?.[c]) {
            const wa = cellToWorld(c, r - 1), wb = cellToWorld(c, r + 1);
            const fa = footprintOf[r - 1][c]?.hwz ?? CELL * 0.3, fb = footprintOf[r + 1][c]?.hwz ?? CELL * 0.3;
            if (rng() < 0.5) addOverheadCable(wa.x, wa.z + fa, wb.x, wb.z - fb);
            if (rng() < 0.48) addCanopyTarp(wa.x, wa.z + fa, wb.x, wb.z - fb);
        }

        const t = webAlignment(cellToWorld(c, r).z);
        const gradientMul = THREE.MathUtils.lerp(
            CONFIG.narrative.darkWeb.propDensityMul, CONFIG.narrative.lightWeb.propDensityMul, t
        ) * (onStreet ? CONFIG.streets.propDensityMul : 1);
        if (rng() > QUALITY.propDensity * gradientMul) continue;

        const choice = weightedPick(CONFIG.props.weights);
        if (choice === 'none') continue;

        let px, pz;
        let facingRotY; // only set for wall-hugging props against an actual wall
        if (WALL_HUGGING_PROPS.has(choice)) {
            const walls = wallDirections(c, r);
            if (walls.length) {
                const w = pick(walls);
                const hug = CELL * randRange(0.34, 0.42); // tight to the actual wall face
                const along = randRange(-CELL * 0.25, CELL * 0.25); // slide along the wall
                const bx = x + w.dx * hug + (w.dx === 0 ? along : 0);
                const bz = z + w.dz * hug + (w.dz === 0 ? along : 0);
                const spot = findClearSpot(bx, bz, 0.3, [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]);
                px = spot.x; pz = spot.z;
                // face away from the wall it's hugging, into the open alley
                // -- outward normal is simply -w (see outwardRotationY).
                // This used to be a hand-rolled atan2(-w.dx, w.dz), missing
                // the same z-axis negation as every other independently-
                // implemented cardinal rotation in this file (see
                // outwardRotationY's own comment) -- north/south wall-
                // huggers faced INTO their wall instead of away from it;
                // east/west were unaffected (z-term is 0 there).
                facingRotY = outwardRotationY(-w.dx, -w.dz);
            } else {
                px = x + randRange(-CELL * 0.28, CELL * 0.28);
                pz = z + randRange(-CELL * 0.28, CELL * 0.28);
            }
        } else {
            const jitter = CELL * 0.28;
            const spot = findClearSpot(x, z, 0.35, [
                laneOffset(jitter, laneAxis),
                laneOffset(jitter, laneAxis),
                [0, 0],
            ]);
            px = spot.x; pz = spot.z;
        }

        const radius = PROP_BUILDERS[choice](px, pz, facingRotY);
        propColliders.push({ x: px, z: pz, radius, height: PROP_HEIGHTS[choice] ?? 1.5 });
        // a tree means this pocket reads as dense/overgrown — shade it
        if (choice === 'tree') addThicketShade(x, z);
    }
}

fetchRandomWikiArticles(15); // live random articles start swapping into the static wanted posters

// the sky, filled last so it can spawn straight through anything already
// placed -- see CONFIG.quality.*.skyJunkCount for the per-tier amount.
bootStatus(`props placed -- filling the sky (${QUALITY.skyJunkCount} junk + noise-corpus text shards)…`);
spawnSkyJunk(QUALITY.skyJunkCount);

// ---------- airborne information layer ----------
// skyJunk above is pure geometry -- this is a separate population of
// text-bearing shards so the sky itself reads as query output, not just
// debris. The corpus behind it is enormous, but render cost stays fixed:
// a small cache of real textures (TEXT_SHARD_CACHE_SIZE), reused across
// however many shard meshes get placed. None of these are colliders.
const TEXT_SHARD_CACHE_SIZE = QUALITY === CONFIG.quality.desktop ? 512 : QUALITY === CONFIG.quality.mobile ? 160 : 48;
// counts cut down alongside the ~1/4-size map -- same reasoning as
// skyJunkCount above, so the sky doesn't end up ~4x denser just because
// the map got smaller.
const TEXT_SHARD_COUNT = QUALITY === CONFIG.quality.desktop ? 850 : QUALITY === CONFIG.quality.mobile ? 210 : 25;

function makeNoiseShardTexture(title, subtitle) {
    const neon = hexToCss(pick(CONFIG.neonPalette));
    const font = pickTextFont();
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = neon + '55';
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        ctx.fillStyle = neon;
        ctx.textAlign = 'center';
        ctx.font = `bold 8px ${font}`;
        ctx.fillText(title, w / 2, h / 2 - 3, w - 6);
        ctx.font = `6px ${font}`;
        ctx.fillStyle = '#cfd6d6';
        ctx.fillText(subtitle, w / 2, h / 2 + 8, w - 6);
    }, 112, 32);
}

const textShardMaterials = [];
for (let i = 0; i < TEXT_SHARD_CACHE_SIZE; i++) {
    const [title, subtitle] = pickAnyNoisePair(rng);
    textShardMaterials.push(new THREE.MeshBasicMaterial({
        map: makeNoiseShardTexture(title, subtitle),
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
}
console.log(`[noise] ${textShardMaterials.length} airborne text-shard textures cached`);

const textShardGeo = new THREE.PlaneGeometry(1, 1);
function spawnTextShards(count) {
    let placed = 0;
    for (let i = 0; i < count; i++) {
        const x = randRange(-GRID_W / 2, GRID_W / 2);
        const z = randRange(-GRID_H / 2, GRID_H / 2);

        // same light-web/dark-web density gradient as skyJunk/regular props
        const t = webAlignment(z);
        const gradientMul = THREE.MathUtils.lerp(CONFIG.narrative.darkWeb.propDensityMul, CONFIG.narrative.lightWeb.propDensityMul, t);
        if (rng() > gradientMul) continue;

        let y = CONFIG.skyJunk.heightMin + (CONFIG.skyJunk.heightMax - CONFIG.skyJunk.heightMin) * (rng() ** CONFIG.skyJunk.heightBias);
        if (y > LAYER_Y.heavenBase && rng() < 0.85) continue;

        const { col, row } = worldToCell(x, z);
        if (grid[row]?.[col] === false && y < CONFIG.skyJunk.streetClearance) y = CONFIG.skyJunk.streetClearance + rng() * 2;

        const mesh = new THREE.Mesh(textShardGeo, textShardMaterials[Math.floor(rng() * textShardMaterials.length)]);
        // some tiny/illegible from the ground, some big enough to read
        // only once you've climbed close -- both are intentional.
        const s = randRange(0.25, 1.7);
        mesh.scale.set(s * 1.75, s * 0.5, 1);
        mesh.position.set(x, y, z);
        mesh.rotation.set(randRange(0, Math.PI * 2), randRange(0, Math.PI * 2), randRange(0, Math.PI * 2));
        scene.add(mesh);
        placed++;
    }
    console.log(`[noise] ${placed} airborne text shards spawned (requested ${count})`);
}
spawnTextShards(TEXT_SHARD_COUNT);

// real climbable platform chains, one per pick, each starting over an
// open (non-building) cell so the base of a chain isn't spawning inside
// a tower's silhouette -- see CONFIG.quality.*.floatingPlatformClusters
// for the per-tier count.
for (let i = 0; i < QUALITY.floatingPlatformClusters; i++) {
    let col, row, tries = 0;
    do {
        col = 1 + Math.floor(rng() * (GRID_COLS - 2));
        row = 1 + Math.floor(rng() * (GRID_ROWS - 2));
        tries++;
    } while (grid[row][col] && tries < 20);
    const { x, z } = cellToWorld(col, row);
    spawnFloatingPlatformCluster(x, z);
}

// ---------- player collision ----------

const PLAYER_RADIUS = CONFIG.camera.playerRadius;

function worldToCell(x, z) {
    return {
        col: Math.round(x / CELL + (GRID_COLS - 1) / 2),
        row: Math.round(z / CELL + (GRID_ROWS - 1) / 2),
    };
}

// where segment (p1->p2) crosses segment (q1->q2), as t along p1->p2, or
// null if they don't cross within both segments' bounds.
function segmentCrossing(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
    const rx = p2x - p1x, rz = p2z - p1z;
    const sx = q2x - q1x, sz = q2z - q1z;
    const denom = rx * sz - rz * sx;
    if (Math.abs(denom) < 1e-9) return null; // parallel (or degenerate) -- can't cross
    const t = ((q1x - p1x) * sz - (q1z - p1z) * sx) / denom;
    const u = ((q1x - p1x) * rz - (q1z - p1z) * rx) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return t;
}

// hard topological guarantee for the maze seal specifically (see
// mazeSealWalls, built right after maze generation): radius-based push-
// out alone (same model every other wall in the game uses) can only ever
// react to the CURRENT distance to a wall, not the path just travelled --
// a single frame's raw movement landing past a thin wall's push-out
// radius on the far side gets resolved comfortably onto that wrong side,
// not bounced back, because push-out has no memory of which side the
// player approached from. Ordinary walking speed never gets remotely
// close to triggering this (per-frame movement is a small fraction of
// the push-out radius), but a lag spike combined with a high jittered
// sprintMultiplier can, in principle, produce a single frame large
// enough to jump clean over it -- and "squeeze between two buildings"
// is exactly the bug this whole system exists to close, so it gets a
// real swept check on top of the radius push-out, not just the same
// best-effort model as everything else. Clamps the travelled segment to
// stop just short of any seal it would otherwise cross.
function enforceMazeSeal(prevX, prevZ, position) {
    for (const seg of mazeSealWalls) {
        if (Math.abs(position.x - (seg.x1 + seg.x2) / 2) > CELL && Math.abs(position.z - (seg.z1 + seg.z2) / 2) > CELL) continue;
        const t = segmentCrossing(prevX, prevZ, position.x, position.z, seg.x1, seg.z1, seg.x2, seg.z2);
        if (t === null) continue;
        const stopT = Math.max(0, t - 0.02); // stop just short of the seal, not exactly on it
        position.x = prevX + (position.x - prevX) * stopT;
        position.z = prevZ + (position.z - prevZ) * stopT;
    }
}

function resolveCollisions(position, feetY = Infinity) {
    const { col, row } = worldToCell(position.x, position.z);

    // real per-wall collision: every building module has registered wall
    // segments per floor (see buildCoreFloor/addBuildingModule and the
    // buildingWallSegments comment) -- only the actual solid walls
    // block, door/archway gaps genuinely don't, and each floor's walls
    // only apply within their own Y band.
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const c = col + dc, r = row + dr;
            if (!grid[r]?.[c]) continue; // out of bounds or open cell — nothing solid
            const walls = buildingWallSegments.get(`${r},${c}`);
            if (!walls) continue;
            // once you're at/above where the real walls actually stop
            // (topY), this building can't block you horizontally at all
            // -- you're above its walled structure, out over the roof/
            // skyline, the same as if there were no building here.
            // height-aware now: a wall only blocks while feetY is within
            // the specific floor it was registered for, so an upper
            // floor's (now independently laid-out) walls never block a
            // lower floor at the same X/Z, and standing above every
            // registered floor's yMax means this building can't block
            // you horizontally at all -- out over the roof/skyline.
            for (const floor of walls.floors) {
                if (feetY < floor.yMin - 0.05 || feetY >= floor.yMax - 0.05) continue;
                for (const seg of floor.segments) {
                    const sdx = seg.x2 - seg.x1, sdz = seg.z2 - seg.z1;
                    const len2 = sdx * sdx + sdz * sdz;
                    let t = len2 > 1e-9 ? ((position.x - seg.x1) * sdx + (position.z - seg.z1) * sdz) / len2 : 0;
                    t = Math.max(0, Math.min(1, t));
                    const cx = seg.x1 + sdx * t, cz = seg.z1 + sdz * t;
                    const dx = position.x - cx, dz = position.z - cz;
                    const distSq = dx * dx + dz * dz;
                    const minDist = PLAYER_RADIUS + WALL_THICKNESS;
                    if (distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq) || 0.0001;
                        const push = (minDist - dist) / dist;
                        position.x += dx * push;
                        position.z += dz * push;
                    }
                }
            }
        }
    }

    // maze topology seal: guaranteed-impassable boundary between two
    // cells the DFS/loop-carve never connected, independent of whatever
    // building/decoration geometry is actually inset nearby (see where
    // mazeSealWalls is built, right after maze generation). Same segment
    // push-out math as building walls, gated the same feetY-vs-height
    // way so it never interferes with genuine rooftop traversal.
    for (const seg of mazeSealWalls) {
        if (feetY >= seg.yMax - 0.05) continue;
        // cheap reject before the real distance math -- most of these
        // 150-250ish segments are nowhere near the player on any given frame
        if (Math.abs(position.x - (seg.x1 + seg.x2) / 2) > CELL || Math.abs(position.z - (seg.z1 + seg.z2) / 2) > CELL) continue;
        const sdx = seg.x2 - seg.x1, sdz = seg.z2 - seg.z1;
        const len2 = sdx * sdx + sdz * sdz;
        let t = len2 > 1e-9 ? ((position.x - seg.x1) * sdx + (position.z - seg.z1) * sdz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = seg.x1 + sdx * t, cz = seg.z1 + sdz * t;
        const dx = position.x - cx, dz = position.z - cz;
        const distSq = dx * dx + dz * dz;
        const minDist = PLAYER_RADIUS + WALL_THICKNESS;
        if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.0001;
            const push = (minDist - dist) / dist;
            position.x += dx * push;
            position.z += dz * push;
        }
    }

    // soft props: simple circle-circle push-out -- skipped entirely for a
    // prop short enough to auto-step (or one you're already standing
    // at/above the top of), the same feetY/MAX_STEP_HEIGHT rule
    // groundHeightAt uses to decide whether that same prop counts as
    // real floor. This is the actual "climb on top of a crate/car" half
    // of the parkour physics -- groundHeightAt alone would just have you
    // hovering at ground level next to it, still blocked here.
    for (const p of propColliders) {
        if (p.height !== Infinity && p.height <= feetY + MAX_STEP_HEIGHT) continue;
        const dx = position.x - p.x;
        const dz = position.z - p.z;
        const minDist = p.radius + PLAYER_RADIUS;
        const distSq = dx * dx + dz * dz;
        if (distSq > 0 && distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq);
            const push = (minDist - dist) / dist;
            position.x += dx * push;
            position.z += dz * push;
        }
    }

    // outer safety clamp (perimeter is solid anyway, this is just a backstop)
    const half = GRID_W / 2 - 0.5;
    position.x = Math.max(-half, Math.min(half, position.x));
    position.z = Math.max(-half, Math.min(half, position.z));
}

// ---------- movement: shared state ----------

const move = { forward: false, back: false, left: false, right: false, sprint: false, flyUp: false, flyDown: false };
// freecam: no gravity, no wall collision -- fly anywhere to look around.
// Toggled with F. Space/C fly up/down (Space still buffers a jump too,
// harmless since freecam ignores it).
let freecamEnabled = false;
let touchMoveVec = { x: 0, y: 0 }; // from joystick, x = strafe, y = forward
const velocity = new THREE.Vector3();

// jump: a real arc on top of groundHeightAt, not a snap -- rises while
// airborne, gravity pulls it back down, and it can never end up below
// whatever the ground/stair/platform height under you actually is (so
// jumping mid-staircase just hops you along the same climb, it can't
// clip you through anything).
let verticalVelocity = 0;
// world-Y is authoritative while airborne (see the big comment in
// animate() where this is consumed) -- `grounded` is the only state that
// decides which of the two vertical-motion rules applies this frame.
// There used to be a `heightAboveFloor` riding on top of a freshly
// re-queried `floorY` every single frame, airborne or not; that let a
// support-surface swap while airborne (drifting over a different,
// unrelated platform) add its Y on top of the stale offset and produce
// an apparent super-launch. Landing is now a real crossing check
// (findLandingSurface), not "some surface came within reach."
let grounded = true;
const JUMP_SPEED = 5.5;
const GRAVITY = -16;
// walking off the edge of a mezzanine/fire-escape/rooftop while GROUNDED:
// small height changes (a stair riser, a curb, a continuous ramp) still
// snap immediately (ordinary auto-step); only a drop bigger than this
// counts as walking off a real ledge and becomes airborne instead.
const STEP_DOWN_TOLERANCE = 0.5;

// ---- parkour physics: coyote time, jump buffering, real auto-step ----
// MAX_STEP_HEIGHT is the one number both resolveCollisions and
// groundHeightAt check against propColliders' real (or estimated) height:
// short enough to clear -> walk straight up onto it, no jump needed
// (Minecraft's own ~0.6-block stepHeight); tall enough -> a real wall
// until you jump, at which point the same rule lets you land on its top
// mid-air once you're high enough, not just at ground level. This is
// what turns crates/cars/junk piles into real jump-on-able terrain
// instead of flat circular walls.
const MAX_STEP_HEIGHT = 0.65;
// jump buffering: a press slightly before landing still fires the
// instant you touch down, instead of being silently dropped because you
// were mid-air for one more frame than expected.
let jumpBufferTimer = 0;
const JUMP_BUFFER_TIME = 0.15;
// coyote time: jump still works for a brief window after walking off a
// ledge with no jump queued yet -- forgives the one-frame-too-late press
// that reads as "obviously should have worked" on a real platform.
let coyoteTimer = 0;
const COYOTE_TIME = 0.12;
// head-bonk clearance: how far below a mezzanine underside/roof cap the
// camera stops, so it reads as bumping your head, not clipping into the mesh.
const HEAD_CLEARANCE = 0.15;

const spawn = cellToWorld(spawnCol, spawnRow);
camera.position.set(spawn.x, CONFIG.camera.eyeHeight, spawn.z);

// ?landmark=<type> -- override the random spawn with a fixed point ~4m
// outside that signature's main entrance, facing it (see
// reserveSignatureSites' toEntrance). Applied on top of the normal
// random spawn above, not instead of computing it, so nothing else that
// derives from spawnCol/spawnRow needs to know this flag exists.
if (urlLandmark) {
    const landmarkInstance = signatureInstances.find(s => s.type === urlLandmark);
    if (landmarkInstance) {
        const e = landmarkInstance.mainEntrance;
        camera.position.set(e.outsideX, CONFIG.camera.eyeHeight, e.outsideZ);
        camera.rotation.set(0, e.facingRotY, 0);
        console.log(`[signature] ?landmark=${urlLandmark} -- spawning outside site ${landmarkInstance.id}'s main entrance instead of a random cell`);
    } else {
        console.warn(`[signature] ?landmark=${urlLandmark} requested, but no such signature was reserved this seed (disabled this load, or not a real key: ${SIGNATURE_TYPES.join(', ')})`);
    }
}

// ---------- desktop controls ----------

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = CONFIG.desktopControls.pointerSpeed;

const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');

function showHint(text) {
    hint.textContent = text;
    hint.style.opacity = '1';
}
function fadeHint(delayMs) {
    setTimeout(() => { hint.style.opacity = '0'; }, delayMs);
}

if (IS_TOUCH) {
    document.getElementById('joystickZone').style.display = 'block';
    document.getElementById('lookZone').style.display = 'block';
    showHint('left half: move · right half: drag to look');
    fadeHint(4500);
    document.addEventListener('touchstart', initAudio, { once: true });
} else {
    crosshair.style.display = 'block';
    showHint('click to look around · WASD to move · space to jump · shift to sprint · F freecam · ESC to release');

    document.addEventListener('click', (e) => {
        initAudio();
        if (e.target.closest('#backLink')) return;
        if (!controls.isLocked) controls.lock();
    });
    controls.addEventListener('lock', () => fadeHint(300));
    controls.addEventListener('unlock', () => showHint('click to look around · WASD to move · space to jump'));
}

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = true; break;
        case 'KeyS': case 'ArrowDown': move.back = true; break;
        case 'KeyA': case 'ArrowLeft': move.left = true; break;
        case 'KeyD': case 'ArrowRight': move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = true; break;
        case 'Space':
            jumpBufferTimer = JUMP_BUFFER_TIME; // buffered, not fired directly -- animate() consumes it once actually grounded (or still in coyote time)
            move.flyUp = true; // freecam only -- ignored otherwise
            e.preventDefault(); // don't let the page scroll while locked
            break;
        case 'KeyC': move.flyDown = true; break;
        case 'KeyF':
            freecamEnabled = !freecamEnabled;
            // clean physics state whichever way this toggled -- exiting
            // freecam always starts airborne rather than assuming
            // grounded, since freecam can leave the player floating
            // anywhere; the next frame's real landing check (not an
            // assumption) sorts out whatever's actually below them.
            verticalVelocity = 0; grounded = false;
            showHint(freecamEnabled ? 'freecam: space up · C down · F to exit' : 'freecam off');
            fadeHint(2000);
            break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = false; break;
        case 'KeyS': case 'ArrowDown': move.back = false; break;
        case 'KeyA': case 'ArrowLeft': move.left = false; break;
        case 'KeyD': case 'ArrowRight': move.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': move.sprint = false; break;
        case 'Space': move.flyUp = false; break;
        case 'KeyC': move.flyDown = false; break;
    }
});

// ---------- touch controls ----------

if (IS_TOUCH) {
    const tc = CONFIG.touchControls;
    const joystickZone = document.getElementById('joystickZone');
    const lookZone = document.getElementById('lookZone');
    const base = document.getElementById('joystickBase');
    const knob = document.getElementById('joystickKnob');

    let joystickTouchId = null;
    let joystickOrigin = { x: 0, y: 0 };

    let lookTouchId = null;
    let lastLook = { x: 0, y: 0 };
    let pitch = 0;

    joystickZone.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        joystickTouchId = t.identifier;
        joystickOrigin = { x: t.clientX, y: t.clientY };
        base.style.left = (t.clientX - 50) + 'px';
        base.style.top = (t.clientY - 50) + 'px';
        knob.style.left = (t.clientX - 22) + 'px';
        knob.style.top = (t.clientY - 22) + 'px';
        base.style.display = 'block';
        knob.style.display = 'block';
    }, { passive: true });

    joystickZone.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier !== joystickTouchId) continue;
            let dx = t.clientX - joystickOrigin.x;
            let dy = t.clientY - joystickOrigin.y;
            const dist = Math.min(tc.joystickRadius, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * dist;
            dy = Math.sin(angle) * dist;
            knob.style.left = (joystickOrigin.x + dx - 22) + 'px';
            knob.style.top = (joystickOrigin.y + dy - 22) + 'px';
            touchMoveVec.x = dx / tc.joystickRadius;
            touchMoveVec.y = dy / tc.joystickRadius;
        }
    }, { passive: true });

    function endJoystick(e) {
        for (const t of e.changedTouches) {
            if (t.identifier !== joystickTouchId) continue;
            joystickTouchId = null;
            touchMoveVec = { x: 0, y: 0 };
            base.style.display = 'none';
            knob.style.display = 'none';
        }
    }
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    lookZone.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        lookTouchId = t.identifier;
        lastLook = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    lookZone.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier !== lookTouchId) continue;
            const dx = t.clientX - lastLook.x;
            const dy = t.clientY - lastLook.y;
            lastLook = { x: t.clientX, y: t.clientY };

            camera.rotation.y -= dx * tc.lookSensitivity;
            pitch -= dy * tc.lookSensitivity;
            pitch = Math.max(-tc.pitchLimit, Math.min(tc.pitchLimit, pitch));
            camera.rotation.x = pitch;
        }
    }, { passive: true });

    lookZone.addEventListener('touchend', (e) => {
        for (const t of e.changedTouches) {
            if (t.identifier === lookTouchId) lookTouchId = null;
        }
    });
}

// ---------- adaptive runtime downgrade ----------
// static sniffing up top (cores/mem/GPU string) catches most weak
// machines before a single triangle is drawn, but not all of them --
// thermal throttling, a driver this doesn't recognize, background load.
// This is the safety net: watch real sustained frame time and step real
// settings down for real, instead of only trusting what the machine
// claimed to have. Only steps down, never back up mid-session (a
// recovering machine isn't the problem this solves), and only as many
// steps as the starting tier has headroom to give -- potato already has
// nothing left to cut.
let perfStepsLeft = QUALITY === CONFIG.quality.potato ? 0 : QUALITY === CONFIG.quality.mobile ? 1 : 2;
let perfWarmup = 3; // seconds before the first check -- let load-in stutter settle
let perfWindow = 0, perfFrames = 0;

function maybeStepDownQuality(delta) {
    if (perfStepsLeft <= 0) return;
    if (perfWarmup > 0) { perfWarmup -= delta; return; }
    perfWindow += delta; perfFrames++;
    if (perfWindow < 4) return; // needs 4s of sustained data per check, not one bad frame
    const avgFps = perfFrames / perfWindow;
    perfWindow = 0; perfFrames = 0;
    if (avgFps >= 40) { perfStepsLeft = 0; return; } // running fine -- stop watching for good

    perfStepsLeft--;
    console.log(`[testing] sustained ~${avgFps.toFixed(0)}fps -- stepping render quality down (${perfStepsLeft} steps left)`);
    renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.5));
    if (bloomPass) { composer.removePass(bloomPass); bloomPass = null; }
    for (const shape in junkMeshes) junkMeshes[shape].count = Math.floor(junkMeshes[shape].count * 0.6);
    for (const shape in skyJunkMeshes) skyJunkMeshes[shape].count = Math.floor(skyJunkMeshes[shape].count * 0.4);
}

// ---------- render loop ----------

const clock = new THREE.Clock();

let elapsedTime = 0; // hand-accumulated: clock.getElapsedTime() would double-consume delta
let footstepTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(CONFIG.movement.maxDeltaSeconds, clock.getDelta());
    elapsedTime += delta;
    maybeStepDownQuality(delta);

    for (const f of flickerLights) {
        f.light.intensity = f.mode === 'blink'
            ? (Math.floor(elapsedTime * f.speed + f.phase) % 2 === 0 ? f.base : 0)
            : f.base * (0.55 + 0.45 * Math.sin(elapsedTime * f.speed + f.phase));
    }

    // real 3-phase traffic signals -- rough real-world ratio (3s red,
    // 2s green, 1s yellow), each instance offset by its own phase so a
    // street full of them doesn't switch in lockstep.
    for (const s of trafficSignals) {
        const cyclePos = (elapsedTime + s.phase) % 6;
        const on = cyclePos < 3 ? 'red' : cyclePos < 5 ? 'green' : 'yellow';
        s.redMat.color.set(on === 'red' ? 0xff2020 : 0x3a0808);
        s.greenMat.color.set(on === 'green' ? 0x30ff50 : 0x123010);
        s.yellowMat.color.set(on === 'yellow' ? 0xffcc20 : 0x3a2000);
        if (s.light) s.light.color.set(on === 'red' ? 0xff2020 : on === 'green' ? 0x30ff50 : 0xffcc20);
    }

    const forwardInput = (move.forward ? 1 : 0) - (move.back ? 1 : 0) - touchMoveVec.y;
    const rightInput = (move.right ? 1 : 0) - (move.left ? 1 : 0) + touchMoveVec.x;

    velocity.set(rightInput, 0, -forwardInput);
    if (velocity.lengthSq() > 1) velocity.normalize();
    const speedMul = move.sprint ? CONFIG.movement.sprintMultiplier : 1; // held Shift -- full air control still applies mid-jump, this just covers more ground per second
    velocity.multiplyScalar(CONFIG.movement.speed * speedMul * delta);

    // captured before horizontal movement -- enforceMazeSeal (below, after
    // the freecam early-return) needs the actual travelled segment, not
    // just the post-move point, so a fast single frame can't hop clean
    // over a maze seal's radius-based push-out the way any thin-line
    // collider can if the raw step is big enough (a lag spike, a jittered
    // sprintMultiplier roll, or just bad luck) to land past it before
    // push-out ever sees it on the near side.
    const prevPlayerX = camera.position.x, prevPlayerZ = camera.position.z;

    if (controls.isLocked || IS_TOUCH) {
        controls.moveRight(velocity.x);
        controls.moveForward(-velocity.z);
    }

    if ((controls.isLocked || IS_TOUCH) && velocity.lengthSq() > 0.0001) {
        footstepTimer -= delta;
        if (footstepTimer <= 0) {
            playFootstep();
            footstepTimer = 0.38; // roughly a walking cadence
        }
    } else {
        footstepTimer = 0;
    }

    // last frame's actual foot height, before this frame's ground/gravity
    // update touches it -- both resolveCollisions and groundHeightAt use
    // this (against MAX_STEP_HEIGHT) to decide "auto-step/landable" vs
    // "solid wall" per prop, so both sides of that decision agree.
    const feetY = camera.position.y - CONFIG.camera.eyeHeight;

    // freecam: no wall collision, no gravity/floor-snapping -- WASD still
    // moves horizontally (already applied above via controls.moveRight/
    // moveForward), Space/C fly straight up/down. Skips the rest of the
    // physics for this frame entirely rather than fighting it.
    if (freecamEnabled) {
        const flySpeed = CONFIG.movement.speed * (move.sprint ? CONFIG.movement.sprintMultiplier : 1) * 1.6;
        const vertical = (move.flyUp ? 1 : 0) - (move.flyDown ? 1 : 0);
        camera.position.y += vertical * flySpeed * delta;
        updateWebGradient(camera.position.z, camera.position.y, elapsedTime);
        updateRain(delta);
        composer.render();
        return;
    }
    // hard maze-topology guarantee, before the ordinary radius-based
    // push-out below -- see enforceMazeSeal's own comment.
    enforceMazeSeal(prevPlayerX, prevPlayerZ, camera.position);
    for (let i = 0; i < CONFIG.movement.collisionIterations; i++) {
        resolveCollisions(camera.position, feetY);
    }

    // real elevation: standing on a mezzanine, climbing its stairs, or
    // standing on top of a crate/car/junk pile all actually change eye
    // height now, not just X/Z collision. Jump is layered on top as a
    // genuine arc, not an instant hop.
    //
    // World-Y is authoritative here, not "floor + offset": `grounded`
    // decides which of two entirely different rules applies this frame,
    // and the two rules never fight each other over the same frame.
    //   - grounded: groundHeightAt is safe to re-query every frame,
    //     because "grounded" already means we're resting on SOME real
    //     surface, so re-resolving exactly which surface is under the
    //     new (post-horizontal-move) x/z is ordinary floor-following,
    //     not a surprise mid-air reassignment. A big drop here means we
    //     walked off a real ledge; become airborne, preserve position.
    //   - airborne: camera.position.y only ever changes by integrating
    //     verticalVelocity, or by a genuine LANDING -- feetY was at/above
    //     some surface's top, the predicted new feetY is at/below it,
    //     within that surface's own footprint (findLandingSurface). A
    //     surface merely coming into "reach" under an unrelated x/z the
    //     player drifted over can never move camera.position.y by
    //     itself; only an actual crossing can. This is what the old
    //     model got wrong -- it re-picked a support surface from
    //     scratch every frame (groundHeightAt) and added the stale
    //     airborne offset on top of whatever that surface's height was,
    //     so a support-surface swap while airborne could add its own
    //     rise on top of the existing offset instead of just continuing
    //     the fall/rise in place.
    coyoteTimer = grounded ? COYOTE_TIME : Math.max(0, coyoteTimer - delta);
    jumpBufferTimer = Math.max(0, jumpBufferTimer - delta);
    if (jumpBufferTimer > 0 && (grounded || coyoteTimer > 0)) {
        verticalVelocity = JUMP_SPEED;
        grounded = false;
        jumpBufferTimer = 0;
        coyoteTimer = 0;
    }

    let nextFeetY;
    if (grounded) {
        const surfaceY = groundHeightAt(camera.position.x, camera.position.z, feetY);
        if (surfaceY < feetY - STEP_DOWN_TOLERANCE) {
            // the floor under our current x/z just dropped a lot --
            // walked off a real ledge. Preserve position this frame;
            // gravity (below) carries it down for real starting next.
            grounded = false;
            nextFeetY = feetY;
        } else {
            nextFeetY = surfaceY; // ordinary walk / auto-step onto a curb, stair riser, ramp, low prop
        }
    }
    if (!grounded) {
        verticalVelocity += GRAVITY * delta;
        const predictedFeetY = feetY + verticalVelocity * delta;
        const landing = findLandingSurface(camera.position.x, camera.position.z, feetY, predictedFeetY, verticalVelocity);
        if (landing !== null) {
            nextFeetY = landing;
            verticalVelocity = 0;
            grounded = true;
        } else {
            nextFeetY = predictedFeetY; // world-stable fall/rise -- unaffected by whatever unrelated surface merely sits underneath
        }
    }
    camera.position.y = nextFeetY + CONFIG.camera.eyeHeight;

    // ceiling clamp: a mezzanine's underside (approached from below) and
    // every building's own ground-floor roof cap both block upward
    // movement the same way a floor blocks downward movement -- a real
    // head-bonk, not a clip-through. elevatedPlatforms double as floors
    // once you're standing at/above them, so those are only a ceiling
    // while you're genuinely still underneath. Only stops upward
    // velocity, same as before -- bonking your head doesn't make you
    // "grounded," you're still falling next frame.
    for (const c of elevatedPlatforms) {
        if (Math.abs(camera.position.x - c.x) >= c.hx || Math.abs(camera.position.z - c.z) >= c.hz) continue;
        if (camera.position.y - CONFIG.camera.eyeHeight >= c.y - 0.01) continue; // at/above it -- that's the floor, not a ceiling, from here
        const maxEyeY = c.y - HEAD_CLEARANCE;
        if (camera.position.y > maxEyeY) {
            camera.position.y = maxEyeY;
            if (verticalVelocity > 0) verticalVelocity = 0;
        }
    }
    for (const c of overheadCeilings) { // a ceiling for whoever's in the room below it -- not for someone standing on/above the roof itself (a warehouse's own walkable roof shares this same footprint)
        if (Math.abs(camera.position.x - c.x) >= c.hx || Math.abs(camera.position.z - c.z) >= c.hz) continue;
        if (camera.position.y - CONFIG.camera.eyeHeight >= c.y - 0.01) continue;
        const maxEyeY = c.y - HEAD_CLEARANCE;
        if (camera.position.y > maxEyeY) {
            camera.position.y = maxEyeY;
            if (verticalVelocity > 0) verticalVelocity = 0;
        }
    }
    updateWebGradient(camera.position.z, camera.position.y, elapsedTime);
    updateRain(delta);

    composer.render();

    // lightweight FPS sampling -- logged every ~3s, not per-frame (per-
    // frame console.log would itself tank performance and spam devtools).
    // Purely diagnostic: if the city feels sluggish, this says whether
    // it's actually the frame rate or something else (input, load).
    fpsFrameCount++;
    const nowMs = performance.now();
    if (nowMs - fpsLastLogMs > 3000) {
        const fps = (fpsFrameCount * 1000) / (nowMs - fpsLastLogMs);
        console.log(`[perf] ~${fps.toFixed(1)} fps (quality=${QUALITY === CONFIG.quality.desktop ? 'desktop' : QUALITY === CONFIG.quality.mobile ? 'mobile' : 'potato'})`);
        fpsFrameCount = 0;
        fpsLastLogMs = nowMs;
    }
}
let fpsFrameCount = 0;
let fpsLastLogMs = performance.now();

// ---------- 3D traversal graph: validate reachability, don't assume it ----------
// built post-hoc from the same data every vertical-traversal system
// already populates (elevatedPlatforms for walkable surfaces, rampRuns
// for the stair/ramp connections between them) rather than requiring
// every add*/build* call site to also thread graph-node bookkeeping
// through -- the graph is a real reachability structure over real
// generated geometry either way, just assembled once, after generation,
// instead of live during it. Nodes: every registered walkable surface
// (elevatedPlatforms entries) plus one big implicit ground-plane node.
// Edges: every stair/ramp run connecting two surfaces' endpoints, plus
// same-height surfaces whose footprints actually touch/overlap (walkable
// between them with no stair at all -- two notched floor rects either
// side of a stairwell hole, a core floor next to its wing's floor, etc).
function buildTraversalGraph() {
    const nodes = elevatedPlatforms.map((p, i) => ({ ...p, id: i }));
    const groundId = nodes.length;
    nodes.push({ x: 0, z: 0, hx: GRID_W, hz: GRID_H, y: 0, id: groundId }); // whole ground plane, one node
    const adj = nodes.map(() => new Set());
    function link(a, b) { if (a !== null && b !== null && a !== b) { adj[a].add(b); adj[b].add(a); } }

    function nodeNear(x, z, y, tol = 0.5) {
        let best = null, bestD = Infinity;
        for (const n of nodes) {
            if (Math.abs(n.y - y) > tol) continue;
            if (x < n.x - n.hx - tol || x > n.x + n.hx + tol || z < n.z - n.hz - tol || z > n.z + n.hz + tol) continue;
            const d = Math.hypot(x - n.x, z - n.z);
            if (d < bestD) { bestD = d; best = n.id; }
        }
        return best;
    }
    let unmatchedRamps = 0;
    for (const r of rampRuns) {
        const x0 = r.axis === 'x' ? r.from : r.fixedCoord, z0 = r.axis === 'x' ? r.fixedCoord : r.from;
        const x1 = r.axis === 'x' ? r.to : r.fixedCoord, z1 = r.axis === 'x' ? r.fixedCoord : r.to;
        const a = nodeNear(x0, z0, r.y0), b = nodeNear(x1, z1, r.y1);
        if (a === null || b === null) unmatchedRamps++;
        link(a, b);
    }
    // same-height footprints that actually touch/overlap -- walkable
    // between with no stair (adjacent floor rects, core<->wing floors).
    // O(n^2) but this runs once, after generation, over surface counts
    // that stay in the low thousands even on desktop quality.
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            if (Math.abs(a.y - b.y) > 0.3) continue;
            if (Math.abs(a.x - b.x) < a.hx + b.hx + 0.3 && Math.abs(a.z - b.z) < a.hz + b.hz + 0.3) link(i, j);
        }
    }
    return { nodes, adj, groundId, unmatchedRamps };
}

function validateTraversal() {
    const { nodes, adj, groundId, unmatchedRamps } = buildTraversalGraph();
    const seen = new Set([groundId]);
    const queue = [groundId];
    while (queue.length) {
        const cur = queue.shift();
        for (const nb of adj[cur]) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
    const total = nodes.length, reachable = seen.size;
    const pct = (100 * reachable / total).toFixed(1);
    console.log(`[traversal] ${reachable}/${total} walkable surfaces reachable from ground (${pct}%), ${rampRuns.length} stair/ramp runs (${unmatchedRamps} didn't match a surface at either end)`);
    if (reachable < total * 0.5) {
        console.warn(`[traversal] WARNING: fewer than half of all registered walkable surfaces are reachable from the ground -- some generated geometry may be an unreachable island. Not fatal (a lot of this is genuinely far-apart rooftops/platforms only meant to be reached by jumping/climbing, which this simple graph doesn't model), but worth a look if it's ever much lower than usual.`);
    }
    if (unmatchedRamps > 0) {
        console.warn(`[traversal] WARNING: ${unmatchedRamps} stair/ramp run(s) didn't find a registered walkable surface within 0.5 units of one of their own endpoints -- possible gap between a flight and its landing.`);
    }
}
validateTraversal();

console.log(`[perf] generation complete at ${bootElapsed()} since page start -- starting render loop`);
bootStatus(`ready (generation took ${bootElapsed()})`);
window.__boot?.ready();

// generation-inspection hooks -- read-only introspection into the just-
// generated world for external tooling (headless QA screenshots, the
// ?debugFacades=1/?debugWalls=1 overlays) plus one setter (freecam is a
// module-local `let`, so it needs a real setter rather than exposing the
// primitive) to reposition the camera for that tooling without fighting
// gravity/collision. Never referenced by any in-game code path.
window.__debug = {
    scene, camera, THREE,
    setFreecam: (v) => { freecamEnabled = v; },
    buildingWallSegments, buildingSites, footprintOf, siteIdOf, grid, buildingFacades, exteriorDecorationVolumes,
};

animate();
