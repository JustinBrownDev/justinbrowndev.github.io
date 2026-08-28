import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';

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
        desktop: {
            maxPixelRatio: 2,
            antialias: true,
            bloom: { strength: 0.55, radius: 0.4, threshold: 0.88 },
            drawDistance: 380,
            maxDynamicLights: 40,
            propDensity: 1.7,
            skyJunkCount: 3800, // airborne clutter -- pure overdraw, so this is the dial that's safe to push hardest
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.4, radius: 0.35, threshold: 0.9 },
            drawDistance: 260,
            maxDynamicLights: 18,
            propDensity: 1.05,
            skyJunkCount: 950,
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
            propDensity: 0.3,
            skyJunkCount: 140, // token amount -- the "buried in noise" read still needs to exist, just barely
        },
    },

    // ---------------- maze layout ----------------
    // the whole environment is a grid of building-block cells. Cells are
    // either solid (a building) or open (an alley). A perimeter ring is
    // always solid so the maze is naturally walled in — no invisible clamp.
    maze: {
        cols: 21,
        rows: 21,
        cellSize: 7,        // world units per grid cell
        loopChance: 0.14,   // chance a redundant wall opens up into a plaza/loop
        buildingMarginMin: 0.6,  // how much smaller than the cell a building footprint is
        buildingMarginMax: 1.8,
    },

    buildings: {
        heightMin: 40,
        heightMax: 140,
        // ~8% of buildings are hero towers -- genuine full-height
        // skyscraper scale, real landmarks looming over the rest rather
        // than everything reading as the same mid-rise height.
        heroTowerChance: 0.08,
        heroHeightMin: 190,
        heroHeightMax: 340,
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
        // small + nearest-filtered = chunky low-fi pixel signage
        canvasWidth: 96,
        canvasHeight: 56,
        borderWidth: 3,
        titleFont: 'bold 20px "Courier New", monospace',
        subtitleFont: '11px "Courier New", monospace',
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
        contentWeights: { nav: 3, decoy: 6, noise: 3, flavor: 5 },
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
        maxSpecialFeatures: {
            statues: 5,
            constructionZones: 5,
            crimeScenes: 3,
            newsstands: 4,
            phoneBooths: 4,
            atmKiosks: 4,
            parks: 5,
            megaBillboards: 4,
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
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * (168 / 128)),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
    );
    plane.position.set(req.x, req.y, req.z);
    plane.rotation.y = req.rotY;
    scene.add(plane);
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
};

// ---------- small helpers ----------

function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randRange(min, max) { return min + rng() * (max - min); }

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

// low-fi pixel texture: tiny canvas, nearest-filtered, no smoothing
function makePixelTexture(draw, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function hexToCss(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

function toContent([title, subtitle]) { return { title, subtitle }; }

// picks sign copy for a given grid row — nav pages (real site links) are
// scarce on purpose, decoys and system noise dominate everywhere else.
let navPageIndex = 0;
function pickSignContent() {
    const weights = { ...CONFIG.billboards.contentWeights };
    if (navPageIndex >= CONFIG.billboards.navPages.length) delete weights.nav;
    const kind = weightedPick(weights);
    switch (kind) {
        case 'nav': return { ...CONFIG.billboards.navPages[navPageIndex++], flicker: false };
        case 'decoy': return { ...toContent(pick(CONFIG.billboards.decoyIdentities)), flicker: false };
        // system noise flickers — it's the machinery admitting the signal
        // is unreliable, so it should visibly read as unreliable.
        case 'noise': return { ...toContent(pick(CONFIG.billboards.systemNoise)), flicker: true };
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
function makeWindowGridTexture(height, baseColorHex) {
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
                const lit = rng() < 0.22;
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

function makeWantedTexture(title, subtitle, tagline1 = 'KNOWLEDGE OF THIS TOPIC', tagline2 = 'REWARD: PEACE OF MIND') {
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8dfc0';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2a2420';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#2a2420';
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.fillText('WANTED', w / 2, 20);
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2, w - 12);
        ctx.font = '8px "Courier New", monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 16, w - 12);
        ctx.font = '7px "Courier New", monospace';
        ctx.fillText(tagline1, w / 2, h - 20);
        ctx.fillText(tagline2, w / 2, h - 10);
    }, 96, 128);
}

function addWantedPoster(x, z, rotY) {
    // ~1 in 5 -- scarce enough that finding one still feels like a find,
    // same logic as everything else in this maze that's actually real.
    const isPersonal = rng() < 0.2;
    const [title, subtitle] = pick(isPersonal ? PERSONAL_WANTED_FACTS : WIKI_FALLBACK);
    const tex = isPersonal
        ? makeWantedTexture(title, subtitle, 'ON FILE, ALLEGEDLY', "REWARD: NONE, HE'S FINE")
        : makeWantedTexture(title, subtitle);
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

// ---------- reusable geometry/materials ----------

const skirtBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const signGeo = new THREE.PlaneGeometry(1, 1);

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
function buildOrganicTowerGeometry(hw, height) {
    const maxCut = hw * 0.5;
    const cut = () => randRange(hw * 0.12, maxCut);
    const nwX = cut(), nwZ = cut(), neX = cut(), neZ = cut(),
        seX = cut(), seZ = cut(), swX = cut(), swZ = cut();
    const basePts = [
        [-hw + nwX, -hw], [hw - neX, -hw],  // north edge, z = -hw
        [hw, -hw + neZ], [hw, hw - seZ],    // east edge, x = hw
        [hw - seX, hw], [-hw + swX, hw],    // south edge, z = hw
        [-hw, hw - swZ], [-hw, -hw + nwZ],  // west edge, x = -hw
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
const buildingWallSegments = new Map(); // "row,col" -> [{x1,z1,x2,z2}, ...]
const WALL_THICKNESS = 0.12; // nominal -- the visual walls are flat planes with no real thickness

// elevation: mezzanines inside ~30% of building interiors, reached by a
// straight (always axis-aligned, never an arbitrary angle) run of steps.
// groundHeightAt() below is what actually moves the camera up/down.
const elevatedPlatforms = []; // {x,z,hx,hz,y}
const rampRuns = []; // {axis, from, to, fixedCoord, halfWidth, y0, y1}
// every building's ground-floor roof cap is a hard ceiling for whoever's
// jumping around inside that room -- separate from elevatedPlatforms
// (which are ALSO a ceiling when approached from below, just one that's
// also a legitimate floor once you're standing on top of it instead).
const overheadCeilings = []; // {x,z,hx,hz,y} -- always blocks upward, never a floor

// feetY (the player's actual current world foot height, from last frame)
// is what makes prop-tops work as real ground rather than either always
// blocking or always yanking you upward: a candidate only counts if
// you're already at/above it within MAX_STEP_HEIGHT slack, the same rule
// resolveCollisions uses to decide whether that same prop is a wall.
// Picks the tallest valid candidate under you, not just the first match
// -- matters now that props can overlap platforms/ramps underneath them.
function groundHeightAt(x, z, feetY = Infinity) {
    let best = 0; // bare ground
    for (const p of elevatedPlatforms) {
        if (Math.abs(x - p.x) < p.hx && Math.abs(z - p.z) < p.hz && p.y > best) best = p.y;
    }
    for (const r of rampRuns) {
        const along = r.axis === 'x' ? x : z;
        const cross = r.axis === 'x' ? z : x;
        if (Math.abs(cross - r.fixedCoord) > r.halfWidth) continue;
        const t = (along - r.from) / (r.to - r.from);
        if (t >= 0 && t <= 1) {
            const y = r.y0 + (r.y1 - r.y0) * t;
            if (y > best) best = y;
        }
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

// builds a walkable ground-floor shell: solid walls with exactly one
// real doorway (fully solid on all 4 sides if this cell happens to have
// no open neighbor to put a door toward -- rare, and correctly means
// "unreachable, so no door needed"). Returns wall segments for collision.
function buildGroundFloorShell(x, z, hw, groundFloorHeight, door, shellMat) {
    const doorWidth = 1.5, doorHeight = 2.3;
    const faces = [
        { dx: 0, dz: -1, rotY: 0 }, { dx: 0, dz: 1, rotY: Math.PI },
        { dx: -1, dz: 0, rotY: -Math.PI / 2 }, { dx: 1, dz: 0, rotY: Math.PI / 2 },
    ];
    const segments = [];
    for (const f of faces) {
        const isDoorWall = door && f.dx === door.dx && f.dz === door.dz;
        const wallLen = hw * 2;
        const cx = x + f.dx * hw, cz = z + f.dz * hw;
        const ex = f.dz !== 0 ? hw : 0, ez = f.dx !== 0 ? hw : 0; // tangent half-extent

        if (!isDoorWall) {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, groundFloorHeight), shellMat);
            wall.position.set(cx, groundFloorHeight / 2, cz);
            wall.rotation.y = f.rotY;
            scene.add(wall);
            segments.push({ x1: cx - ex, z1: cz - ez, x2: cx + ex, z2: cz + ez });
        } else {
            const jambWidth = (wallLen - doorWidth) / 2;
            const jex = f.dz !== 0 ? jambWidth / 2 : 0, jez = f.dx !== 0 ? jambWidth / 2 : 0;
            for (const side of [-1, 1]) {
                const jamb = new THREE.Mesh(new THREE.PlaneGeometry(jambWidth, groundFloorHeight), shellMat);
                const along = side * (doorWidth / 2 + jambWidth / 2);
                const jx = cx + (f.dz !== 0 ? along : 0);
                const jz = cz + (f.dx !== 0 ? along : 0);
                jamb.position.set(jx, groundFloorHeight / 2, jz);
                jamb.rotation.y = f.rotY;
                scene.add(jamb);
                segments.push({ x1: jx - jex, z1: jz - jez, x2: jx + jex, z2: jz + jez });
            }
            const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, groundFloorHeight - doorHeight), shellMat);
            lintel.position.set(cx, doorHeight + (groundFloorHeight - doorHeight) / 2, cz);
            lintel.rotation.y = f.rotY;
            scene.add(lintel);
            // lintel sits above head height -- the gap below it stays open, no segment there
        }
    }

    const roofCap = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hw * 2), shellMat);
    roofCap.rotation.x = -Math.PI / 2;
    roofCap.position.set(x, groundFloorHeight, z);
    scene.add(roofCap);

    const floorTex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#6a5030';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#4a3520';
        for (let i = 0; i < w; i += 10) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    }, 64, 64);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(hw * 1.9, hw * 1.9),
        new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.02, z);
    scene.add(floor);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(0xffe9b0, 3, groundFloorHeight * 2.2, 2);
        light.position.set(x, groundFloorHeight * 0.7, z);
        scene.add(light);
    }
    return segments;
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

    // straight stair run from near room-center up to the platform edge
    const stairFrom = axis === 'x' ? x : z;
    const stairTo = axis === 'x' ? px - awayX * platformHalf : pz - awayZ * platformHalf;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
        const tMid = (i + 0.5) / steps;
        const stepPos = stairFrom + (stairTo - stairFrom) * tMid;
        const stepY = platformY * tMid;
        const stepDepth = Math.abs(stairTo - stairFrom) / steps;
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(
                axis === 'x' ? stepDepth * 1.05 : 1.1, 0.12, axis === 'x' ? 1.1 : stepDepth * 1.05
            ),
            new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 })
        );
        step.position.set(axis === 'x' ? stepPos : x, stepY, axis === 'x' ? z : stepPos);
        scene.add(step);
    }

    elevatedPlatforms.push({ x: px, z: pz, hx: platformHalf, hz: platformHalf, y: platformY });
    rampRuns.push({
        axis, from: stairFrom, to: stairTo,
        fixedCoord: axis === 'x' ? z : x, halfWidth: 0.6,
        y0: 0, y1: platformY,
    });
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

    // face away from the wall it's mounted on, same convention
    // buildingFaceDefs/wall-hugging props use elsewhere
    g.rotation.y = Math.atan2(-w.dx, w.dz);
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
    let y = 0, dir = 1;
    while (y < topY) {
        const y1 = Math.min(topY, y + risePerFlight);
        const along1 = along + dir * flightLen;
        addStairFlight(axis, along, along1, cross, y, y1);
        const wx = axis === 'x' ? along1 : cross, wz = axis === 'x' ? cross : along1;
        addLandingPlatform(wx, wz, 0.65, y1);
        y = y1; along = along1; dir *= -1;
    }
}

function addBuilding(col, row) {
    const { x, z } = cellToWorld(col, row);
    // ~12% of buildings are squat warehouses instead of towers: near-full
    // cell width, a fraction of the usual height.
    const isWarehouse = rng() < 0.12;
    const margin = isWarehouse ? CONFIG.maze.buildingMarginMin : randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax);
    const footprint = CELL - margin;
    const hw = footprint / 2;
    footprintOf[row][col] = footprint;
    const isHeroTower = !isWarehouse && rng() < CONFIG.buildings.heroTowerChance;
    const height = isWarehouse ? randRange(6, 12)
        : isHeroTower ? randRange(CONFIG.buildings.heroHeightMin, CONFIG.buildings.heroHeightMax)
            : randRange(CONFIG.buildings.heightMin, CONFIG.buildings.heightMax);
    const color = pick(CONFIG.buildings.palette);

    // ~1 in 6 buildings is "stained" with the real elevation-gradient
    // texture instead of a flat facade color -- trench-dark at the base
    // climbing toward summit-pale near the roofline. Warehouses are too
    // short/squat for either treatment to read, so they stay flat-color
    // (matches the existing roof-topper skip below). Everything else
    // defaults to a real per-floor window grid now instead of a bare
    // flat prism -- facades finally have depth at a glance, not just in
    // silhouette.
    const useStain = !isWarehouse && rng() < 0.16;
    const useWindows = !isWarehouse && !useStain;
    const material = useStain
        ? new THREE.MeshStandardMaterial({ map: makeTopologyStainTexture(), roughness: CONFIG.buildings.roughness })
        : useWindows
            ? new THREE.MeshStandardMaterial({ map: makeWindowGridTexture(height, color), roughness: CONFIG.buildings.roughness })
            : new THREE.MeshStandardMaterial({ color, roughness: CONFIG.buildings.roughness });

    // every building has a walkable ground floor now: real solid walls
    // (they actually block), one real doorway toward an open neighbor if
    // it has one, a floor, light, dressing, and -- ~30% of the time -- a
    // raised mezzanine reached by real steps. The tower/archetype above
    // starts from the roof of this shell, not from the ground.
    const openDirs = [{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 1, dz: 0 }]
        .filter(d => grid[row + d.dz]?.[col + d.dx] === false);
    const door = openDirs.length ? pick(openDirs) : null;
    const groundFloorHeight = Math.min(3.2, height * 0.35);
    const shellMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    const segments = buildGroundFloorShell(x, z, hw, groundFloorHeight, door, shellMat);
    buildingWallSegments.set(`${row},${col}`, segments);
    overheadCeilings.push({ x, z, hx: hw, hz: hw, y: groundFloorHeight }); // its own roof cap is a real ceiling now -- can't jump through it from inside
    maybeAddMezzanine(x, z, hw, groundFloorHeight, door);
    maybeAddElevator(x, z, hw, groundFloorHeight, door);
    // denser interior dressing -- guaranteed pieces plus situational junk
    addCrate(x - hw * 0.4, z + hw * 0.3);
    addPottedPlant(x + hw * 0.5, z - hw * 0.4);
    scatterJunk('indoor', x, z, 2 + Math.floor(rng() * 3), hw * 0.55);
    // ~40% of interiors get the one real container -> contents ->
    // contents-of-contents chain in the whole maze: a table carrying a
    // bowl carrying fruit, occasionally carrying one more thing still.
    if (rng() < 0.4) addTableWithClutter(x + randRange(-hw * 0.35, hw * 0.35), z + randRange(-hw * 0.35, hw * 0.35));

    const upperHeight = height - groundFloorHeight;

    // ~30% of buildings are two-stage setback towers instead of a single
    // prism -- a wider base with a narrower tower rising off it, like a
    // real setback skyscraper. Reuses the same organic-tower builder
    // twice rather than a whole new geometry function; the base tower's
    // own top cap doubles as the roof deck the upper stage stands on,
    // and the upper stage's un-capped bottom is never seen from ground
    // level. Keeps the whole scene from reading as one repeated formula.
    const archetype = isWarehouse ? 'warehouse' : weightedPick({ single: 5, setback: 3, clustered: 2 });

    if (archetype === 'setback') {
        const baseHeight = upperHeight * randRange(0.4, 0.7);
        const topHeight = upperHeight - baseHeight;
        const upperHw = hw * randRange(0.5, 0.8);
        const base = new THREE.Mesh(buildOrganicTowerGeometry(hw, baseHeight), material);
        base.position.set(x, groundFloorHeight, z);
        scene.add(base);
        const upper = new THREE.Mesh(buildOrganicTowerGeometry(upperHw, topHeight), material);
        upper.position.set(x, groundFloorHeight + baseHeight, z);
        scene.add(upper);
    } else if (archetype === 'clustered') {
        // 2-3 independent thin towers sharing one footprint and a shared
        // low base block, instead of one solid mass -- a multi-spire
        // silhouette. The base block still fills the collision footprint.
        const baseHeight = upperHeight * randRange(0.15, 0.3);
        const base = new THREE.Mesh(buildOrganicTowerGeometry(hw, baseHeight), material);
        base.position.set(x, groundFloorHeight, z);
        scene.add(base);
        const spireCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < spireCount; i++) {
            const spireHw = hw * randRange(0.28, 0.42);
            const spireHeight = baseHeight + (upperHeight - baseHeight) * randRange(0.6, 1.0);
            const ox = randRange(-footprint / 4, footprint / 4);
            const oz = randRange(-footprint / 4, footprint / 4);
            const spireTower = new THREE.Mesh(buildOrganicTowerGeometry(spireHw, spireHeight - baseHeight), material);
            spireTower.position.set(x + ox, groundFloorHeight + baseHeight, z + oz);
            scene.add(spireTower);
        }
    } else {
        const building = new THREE.Mesh(buildOrganicTowerGeometry(hw, upperHeight), material);
        building.position.set(x, groundFloorHeight, z);
        scene.add(building);

        // roof toppers -- a fifth/sixth flavor of building silhouette,
        // skipped on warehouses (too short to read) and setbacks (already
        // have their own upper mass).
        if (!isWarehouse) {
            const topper = weightedPick({ none: 6, dome: 2, spire: 2 });
            if (topper === 'dome') {
                const dome = new THREE.Mesh(
                    new THREE.SphereGeometry(hw * 0.85, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
                    material
                );
                dome.position.set(x, height, z);
                scene.add(dome);
            } else if (topper === 'spire') {
                const spireH = randRange(3, 7);
                const spire = new THREE.Mesh(
                    jitterGeometry(new THREE.ConeGeometry(0.15, spireH, 6), 0.02),
                    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.5, metalness: 0.6 })
                );
                spire.position.set(x, height + spireH / 2, z);
                scene.add(spire);
            }
        }
    }

    // curb/base skirt so the building reads as sitting on something, not floating
    const curb = CONFIG.buildings.curb;
    const skirt = new THREE.Mesh(
        skirtBoxGeo,
        new THREE.MeshStandardMaterial({ color: curb.color, roughness: 1 })
    );
    skirt.scale.set(footprint + curb.overhang, curb.height, footprint + curb.overhang);
    skirt.position.set(x, curb.height / 2, z);
    scene.add(skirt);

    // sign faces: one candidate per side that borders an open alley cell.
    // every qualifying face is recorded in candidateFaces regardless of
    // whether a random sign lands on it — the content-card pass later
    // claims whatever's left over so real content never double-mounts.
    for (const face of buildingFaceDefs(footprint)) {
        const nc = col + face.dc, nr = row + face.dr;
        if (grid[nr]?.[nc] !== false) continue; // only sign faces open onto an alley

        const t = webAlignment(z);
        const signChance = THREE.MathUtils.lerp(
            CONFIG.narrative.darkWeb.signChance, CONFIG.narrative.lightWeb.signChance, t
        );

        if (rng() > signChance) {
            candidateFaces.push({ x: x + face.ox, z: z + face.oz, rotY: face.rotY, height });
            continue;
        }

        const content = pickSignContent();
        const neon = pickNeonForRow(row);
        // never below the shell's roofline -- otherwise a sign could end
        // up floating in an open doorway gap on whichever face has one
        const signHeight = randRange(Math.max(2.2, groundFloorHeight + 0.3), Math.max(groundFloorHeight + 1, Math.min(height - 2, 6)));
        addSign(
            x + face.ox, signHeight, z + face.oz,
            face.rotY, content.title, content.subtitle, neon, content.flicker
        );

        // low chance of a tag scrawled near ground level on the same wall —
        // independent of whether a sign landed above it.
        if (rng() < 0.3) {
            addGraffitiTag(x + face.ox * 0.99, randRange(0.6, 1.6), z + face.oz * 0.99, face.rotY);
            // the tagger's supplies, left at the base of their own work
            if (rng() < 0.3 * QUALITY.propDensity) {
                placeRealModel('sprayCans', x + face.ox * 0.85, z + face.oz * 0.85, randRange(0, Math.PI * 2));
            }
        }
        // low chance of a security camera watching the alley — everything
        // queryable is also everything watched.
        if (rng() < 0.1) {
            addSecurityCamera(x + face.ox * 0.97, z + face.oz * 0.97, face.rotY, height);
        }
        // ivy/dead-vine patch, independent of everything else on this wall
        if (rng() < 0.24) {
            addIvyPatch(x + face.ox * 0.98, randRange(0.6, Math.min(height - 1, 4)), z + face.oz * 0.98, face.rotY);
        }
        // shop awning, roughly shopfront height -- above the shell's door
        // gap so it never looks like it's hanging in an open doorway
        if (rng() < 0.42) {
            addAwning(x + face.ox, Math.max(2.4, groundFloorHeight + 0.2), z + face.oz, face.rotY, randRange(1.6, 2.4));
        }
        // a real fire escape zigzagging up the alley-facing wall -- the
        // single most back-alley-defining architectural feature there is.
        // the detailed GLTF model is the silhouette; buildFireEscapeStair
        // is what actually holds you -- these used to be pure decoration
        // (walk right through them) while ground junk blocked you solid,
        // which was backwards. now they climb, for real, like any interior
        // mezzanine stair does.
        if (rng() < 0.18) {
            placeRealModel('fireEscape', x + face.ox * 1.02, z + face.oz * 1.02, face.rotY);
            buildFireEscapeStair(x + face.ox * 1.02, z + face.oz * 1.02, face.rotY, randRange(5, 11));
        }
    }

    addRooftopClutter(x, z, footprint, height);
}

const candidateFaces = []; // faces that skipped a random sign — free for content cards

// the four wall-facing transforms for a building of a given footprint —
// shared by normal sign placement and the single forced "signal" sign.
function buildingFaceDefs(footprint) {
    return [
        { dc: 0, dr: -1, rotY: 0, ox: 0, oz: -footprint / 2 - 0.03 },
        { dc: 0, dr: 1, rotY: Math.PI, ox: 0, oz: footprint / 2 + 0.03 },
        { dc: -1, dr: 0, rotY: -Math.PI / 2, ox: -footprint / 2 - 0.03, oz: 0 },
        { dc: 1, dr: 0, rotY: Math.PI / 2, ox: footprint / 2 + 0.03, oz: 0 },
    ];
}

function addSign(x, y, z, rotY, title, subtitle, colorHex, flicker = false) {
    const b = CONFIG.billboards;
    const tex = makePixelTexture((ctx, w, h) => {
        const color = hexToCss(colorHex);
        ctx.fillStyle = '#020202';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = b.borderWidth;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.font = b.titleFont;
        ctx.fillText(title, w / 2, h / 2 - 4, w - 8);
        ctx.font = b.subtitleFont;
        ctx.fillText(subtitle, w / 2, h / 2 + 14, w - 8);
    }, b.canvasWidth, b.canvasHeight);

    const width = randRange(1.6, 2.6);
    const height = width * (b.canvasHeight / b.canvasWidth);
    const plane = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: tex }));
    plane.scale.set(width, height, 1);
    plane.position.set(x, y, z);
    plane.rotation.y = rotY;
    scene.add(plane);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const sl = CONFIG.lighting.signLight;
        const light = new THREE.PointLight(colorHex, sl.intensity, sl.distance, sl.decay);
        light.position.set(
            x + Math.sin(rotY) * 0.6,
            y,
            z + Math.cos(rotY) * 0.6
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
];
function addGraffitiTag(x, y, z, rotY) {
    const text = pick(GRAFFITI_TAGS);
    const colorHex = pick(CONFIG.neonPalette);
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = hexToCss(colorHex) + 'cc';
        ctx.textAlign = 'left';
        ctx.font = 'italic bold 13px "Courier New", monospace';
        let cx = 4;
        const cy = h / 2 + randRange(-2, 2);
        for (const ch of text) {
            ctx.save();
            ctx.translate(cx, cy + randRange(-2, 2));
            ctx.rotate(randRange(-0.12, 0.12));
            ctx.fillText(ch, 0, 0);
            ctx.restore();
            cx += ctx.measureText(ch).width + randRange(-0.5, 1.5);
        }
    }, Math.max(64, text.length * 10), 28);
    const width = randRange(0.9, 1.6);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * 0.28),
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
function addRooftopClutter(x, z, footprint, height) {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.7, metalness: 0.4 });

    if (rng() < 0.35) { // antenna
        const antenna = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(0.03, 0.03, randRange(1.5, 4), 5), 0.01), metalMat);
        antenna.position.set(x + randRange(-footprint / 3, footprint / 3), height + antenna.geometry.parameters.height / 2, z + randRange(-footprint / 3, footprint / 3));
        scene.add(antenna);
    }
    if (rng() < 0.25) { // water tank
        const tank = new THREE.Mesh(
            jitterGeometry(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10), 0.08),
            new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.8 })
        );
        tank.position.set(x + randRange(-footprint / 4, footprint / 4), height + 0.55, z + randRange(-footprint / 4, footprint / 4));
        scene.add(tank);
    }
    if (rng() < 0.3) { // AC/HVAC unit
        const ac = new THREE.Mesh(jitterGeometry(new THREE.BoxGeometry(0.7, 0.4, 0.5), 0.03), metalMat);
        ac.position.set(x + randRange(-footprint / 3, footprint / 3), height + 0.2, z + randRange(-footprint / 3, footprint / 3));
        scene.add(ac);
    }
}

// framed wall poster — client/design work and art pieces. Warm paper tone,
// thin border, two-line caption. Visually distinct from the neon signs.
function addWallPoster(x, y, z, rotY, title, subtitle) {
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8ddc2';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2a2420';
        ctx.lineWidth = 4;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = '#2a2420';
        ctx.textAlign = 'center';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2 - 6, w - 12);
        ctx.font = '10px "Courier New", monospace';
        ctx.fillText(subtitle, w / 2, h / 2 + 14, w - 12);
    }, 96, 72);
    const width = randRange(1.4, 2.0);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * 0.75),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    plane.position.set(x, y, z);
    plane.rotation.y = rotY;
    scene.add(plane);
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
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * (40 / 108)),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    plane.position.set(x, y, z);
    plane.rotation.y = rotY;
    scene.add(plane);

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
function mountContentCards() {
    const jobs = [];
    for (const [title, subtitle] of CONFIG.siteContent.art) jobs.push({ title, subtitle, kind: 'poster' });
    for (const [title, subtitle] of CONFIG.siteContent.webProjects) jobs.push({ title, subtitle, kind: 'poster' });
    for (const [title, subtitle] of CONFIG.siteContent.codeProjects) jobs.push({ title, subtitle, kind: 'terminal' });

    const faces = [...candidateFaces].sort(() => rng() - 0.5);
    let fi = 0;
    for (const job of jobs) {
        if (fi >= faces.length) break;
        const face = faces[fi++];
        const y = randRange(2.2, Math.min(face.height - 2, 6));
        const photoKey = PHOTO_BY_TITLE[job.title];
        if (photoKey) {
            placePhotoPoster(photoKey, face.x, y, face.z, face.rotY, job.title, job.subtitle);
        } else if (job.kind === 'poster') {
            addWallPoster(face.x, y, face.z, face.rotY, job.title, job.subtitle);
        } else {
            addTerminalPlaque(face.x, y, face.z, face.rotY, job.title, job.subtitle);
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
    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 1.1),
        new THREE.MeshBasicMaterial({ color: colorHex })
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
];

// a flyer dropped flat on the pavement — skills & rhetoric fragments.
// common, cheap, everywhere; the "public secret" hiding in plain sight.
function addStickerTag(x, z) {
    const [title, subtitle] = pick([...CONFIG.siteContent.skills, ...CONFIG.siteContent.about, ...CONFIG.billboards.flavorWords, ...MYTHOLOGY_FRAGMENTS]);
    const neon = pick(CONFIG.neonPalette);
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = hexToCss(neon);
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = hexToCss(neon);
        ctx.textAlign = 'center';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.fillText(title, w / 2, h / 2 - 2, w - 6);
        ctx.font = '7px "Courier New", monospace';
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
// average open-neighbor direction for a plaza cell, in the same
// atan2(dc,-dr) convention as buildingFaceDefs — so freestanding kiosks
// face toward the plaza's dominant opening instead of a coin flip that
// could just as easily point the screen at the narrowest gap.
function plazaFacingRotY(c, r) {
    const opens = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => grid[r + dr]?.[c + dc] === false);
    if (!opens.length) return undefined;
    let sx = 0, sz = 0;
    for (const [dc, dr] of opens) { sx += dc; sz += dr; }
    if (sx === 0 && sz === 0) return undefined; // symmetric plaza, no dominant side
    return Math.atan2(sx, -sz);
}

function addNewsstand(x, z, facingRotY) {
    const [headline, sub] = pick(CONFIG.billboards.tabloidHeadlines);
    const booth = new THREE.Mesh(
        jitterGeometry(new THREE.BoxGeometry(1.1, 2.0, 0.9), 0.04),
        new THREE.MeshStandardMaterial({ color: pick([0xc8b878, 0xa8c8c8, 0xc06858]), roughness: 0.85 })
    );
    booth.position.y = 1.0;
    const tex = makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#eee8d8';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#181818';
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillText(headline, w / 2, h / 2 - 6, w - 6);
        ctx.font = '8px "Courier New", monospace';
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
    const [msg, sub] = pick(CONFIG.billboards.systemNoise);
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

// every building cell gets a real building now -- addBuilding itself
// gives each one a walkable ground floor (door toward an open neighbor
// if it has one, real per-wall collision, interior dressing) plus the
// tower/archetype above it.
for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c]) addBuilding(c, r);
    }
}

mountContentCards(); // real site content claims leftover wall faces

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
            const footprint = footprintOf[br][bc];
            const { x, z } = cellToWorld(bc, br);
            // face pointing FROM the building back toward the dead end
            const face = buildingFaceDefs(footprint).find(f => f.dc === -dc && f.dr === -dr);
            if (!face) continue;
            if (i === 0) {
                // the one true signal carries his actual photo -- the
                // near-miss decoys stay text-only, since they're
                // specifically NOT him and showing a real photo there
                // would give the game away.
                placePhotoPoster('portrait', x + face.ox, 2.6, z + face.oz, face.rotY, content.title, content.subtitle, { width: 1.8, frameColor: '#ffffff' });
            } else {
                addSign(x + face.ox, 2.4, z + face.oz, face.rotY, content.title, content.subtitle, content.color);
            }
            break;
        }
    });
}

// special features placed on plaza cells (wider open junctions)
const shuffledPlazas = [...plazaCells].sort(() => rng() - 0.5);
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
    const r = addPark(x, z);
    // radius here is "keep other stuff clear of the whole park," not a
    // real object -- Infinity keeps that exactly the always-wall it's
    // always been, instead of a fake floating platform over the grass
    propColliders.push({ x, z, radius: r, height: Infinity });
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
            // real zebra crosswalk stripes across both approaches, plus a
            // stop bar just inside each of the 4 sides -- the one piece
            // of real traffic-control marking this street grid was still
            // missing entirely.
            ctx.fillStyle = '#e8e8dc';
            const band = 12; // stripe-zone width, centered on the intersection
            for (let i = 4; i < w; i += 9) ctx.fillRect(i, h / 2 - band / 2, 5, band); // crossing the horizontal street -- stripes run along z
            for (let i = 4; i < h; i += 9) ctx.fillRect(w / 2 - band / 2, i, band, 5); // crossing the vertical street -- stripes run along x
            const barLen = 14, barThick = 3, inset = 18;
            ctx.fillRect(inset, h / 2 - barThick / 2, barLen, barThick); // west approach
            ctx.fillRect(w - inset - barLen, h / 2 - barThick / 2, barLen, barThick); // east
            ctx.fillRect(w / 2 - barThick / 2, inset, barThick, barLen); // north
            ctx.fillRect(w / 2 - barThick / 2, h - inset - barLen, barThick, barLen); // south
        }
    }, 64, 64);
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.006, z);
    scene.add(road);

    // real sidewalk strip wherever this street cell actually borders a
    // building — a raised, lighter concrete band with a curb lip.
    for (const w of wallDirections(c, r)) {
        const stripWidth = CELL * 0.18;
        const stripLen = CELL * 0.92;
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
        const content = pickSignContent();
        const neon = pick(CONFIG.neonPalette);
        const tex = makePixelTexture((ctx, w, h) => {
            const color = hexToCss(neon);
            ctx.fillStyle = '#020202';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, w - 4, h - 4);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.font = 'bold 34px "Courier New", monospace';
            ctx.fillText(content.title, w / 2, h / 2 - 8, w - 16);
            ctx.font = '18px "Courier New", monospace';
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
            const fa = footprintOf[r][c - 1] ?? CELL * 0.6, fb = footprintOf[r][c + 1] ?? CELL * 0.6;
            if (rng() < 0.5) addOverheadCable(wa.x + fa / 2, wa.z, wb.x - fb / 2, wb.z);
            if (rng() < 0.48) addCanopyTarp(wa.x + fa / 2, wa.z, wb.x - fb / 2, wb.z);
        }
        if (grid[r - 1]?.[c] && grid[r + 1]?.[c]) {
            const wa = cellToWorld(c, r - 1), wb = cellToWorld(c, r + 1);
            const fa = footprintOf[r - 1][c] ?? CELL * 0.6, fb = footprintOf[r + 1][c] ?? CELL * 0.6;
            if (rng() < 0.5) addOverheadCable(wa.x, wa.z + fa / 2, wb.x, wb.z - fb / 2);
            if (rng() < 0.48) addCanopyTarp(wa.x, wa.z + fa / 2, wb.x, wb.z - fb / 2);
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
                // face away from the wall it's hugging, into the open alley —
                // matches the same (dc,dr) -> rotY convention buildingFaceDefs
                // uses, just inverted (wall direction, not facing direction).
                facingRotY = Math.atan2(-w.dx, w.dz);
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
spawnSkyJunk(QUALITY.skyJunkCount);

// ---------- player collision ----------

const PLAYER_RADIUS = CONFIG.camera.playerRadius;

function worldToCell(x, z) {
    return {
        col: Math.round(x / CELL + (GRID_COLS - 1) / 2),
        row: Math.round(z / CELL + (GRID_ROWS - 1) / 2),
    };
}

function resolveCollisions(position, feetY = Infinity) {
    const { col, row } = worldToCell(position.x, position.z);

    // real per-wall collision: every building has registered wall
    // segments (buildGroundFloorShell) -- only the actual solid walls
    // block, the door gap genuinely doesn't. Replaces the old whole-
    // footprint-square check entirely, for every building, not just a
    // special-cased few.
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const c = col + dc, r = row + dr;
            if (!grid[r]?.[c]) continue; // out of bounds or open cell — nothing solid
            const segments = buildingWallSegments.get(`${r},${c}`);
            if (!segments) continue;
            for (const seg of segments) {
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

const move = { forward: false, back: false, left: false, right: false, sprint: false };
let touchMoveVec = { x: 0, y: 0 }; // from joystick, x = strafe, y = forward
const velocity = new THREE.Vector3();

// jump: a real arc on top of groundHeightAt, not a snap -- rises while
// airborne, gravity pulls it back down, and it can never end up below
// whatever the ground/stair/platform height under you actually is (so
// jumping mid-staircase just hops you along the same climb, it can't
// clip you through anything).
let verticalVelocity = 0;
let heightAboveFloor = 0; // airborne offset above groundHeightAt; 0 = grounded
const JUMP_SPEED = 5.5;
const GRAVITY = -16;
// walking off the edge of a mezzanine/fire-escape/rooftop used to be an
// instant teleport straight down to whatever groundHeightAt reports under
// your new x/z -- the table lookup has no concept of "was standing on
// something, that something just ended". Small height changes (a stair
// riser, a curb, a continuous ramp) still snap immediately; only a drop
// bigger than this counts as walking off a real ledge.
const STEP_DOWN_TOLERANCE = 0.5;
let lastGroundedFloorY = null; // previous frame's floorY while grounded, for ledge detection

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
    showHint('click to look around · WASD to move · space to jump · shift to sprint · ESC to release');

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
            e.preventDefault(); // don't let the page scroll while locked
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
    for (let i = 0; i < CONFIG.movement.collisionIterations; i++) {
        resolveCollisions(camera.position, feetY);
    }
    // real elevation: standing on a mezzanine, climbing its stairs, or
    // standing on top of a crate/car/junk pile all actually change eye
    // height now, not just X/Z collision. Jump is layered on top as a
    // genuine arc, not an instant hop: a launch impulse when grounded (or
    // still within coyote time), gravity every frame after, clamped so it
    // never carries you below the floor/stair/platform/prop-top under
    // your feet.
    let floorY = groundHeightAt(camera.position.x, camera.position.z, feetY) + CONFIG.camera.eyeHeight;
    const wasGrounded = heightAboveFloor <= 0.001;
    coyoteTimer = wasGrounded ? COYOTE_TIME : Math.max(0, coyoteTimer - delta);
    if (wasGrounded && lastGroundedFloorY !== null && floorY < lastGroundedFloorY - STEP_DOWN_TOLERANCE) {
        // stepped off a real ledge -- don't snap down to the new (lower)
        // floor, fall to it instead. Reframe the gap as airborne offset
        // above the new floor so this frame renders at the same height
        // it already was, then gravity below carries it down naturally.
        heightAboveFloor = lastGroundedFloorY - floorY;
    }
    jumpBufferTimer = Math.max(0, jumpBufferTimer - delta);
    if (jumpBufferTimer > 0 && (heightAboveFloor <= 0.001 || coyoteTimer > 0)) {
        verticalVelocity = JUMP_SPEED;
        jumpBufferTimer = 0;
        coyoteTimer = 0;
    }
    verticalVelocity += GRAVITY * delta;
    heightAboveFloor = Math.max(0, heightAboveFloor + verticalVelocity * delta);
    if (heightAboveFloor <= 0) verticalVelocity = 0;
    camera.position.y = floorY + heightAboveFloor;

    // ceiling clamp: a mezzanine's underside (approached from below) and
    // every building's own ground-floor roof cap both block upward
    // movement the same way a floor blocks downward movement -- a real
    // head-bonk, not a clip-through. elevatedPlatforms double as floors
    // once you're standing at/above them, so those are only a ceiling
    // while you're genuinely still underneath.
    for (const c of elevatedPlatforms) {
        if (Math.abs(camera.position.x - c.x) >= c.hx || Math.abs(camera.position.z - c.z) >= c.hz) continue;
        if (camera.position.y - CONFIG.camera.eyeHeight >= c.y - 0.01) continue; // at/above it -- that's the floor, not a ceiling, from here
        const maxEyeY = c.y - HEAD_CLEARANCE;
        if (camera.position.y > maxEyeY) {
            camera.position.y = maxEyeY;
            heightAboveFloor = camera.position.y - floorY;
            if (verticalVelocity > 0) verticalVelocity = 0;
        }
    }
    for (const c of overheadCeilings) { // always a ceiling -- nobody ever stands on top of a roof cap from inside
        if (Math.abs(camera.position.x - c.x) >= c.hx || Math.abs(camera.position.z - c.z) >= c.hz) continue;
        const maxEyeY = c.y - HEAD_CLEARANCE;
        if (camera.position.y > maxEyeY) {
            camera.position.y = maxEyeY;
            heightAboveFloor = camera.position.y - floorY;
            if (verticalVelocity > 0) verticalVelocity = 0;
        }
    }
    if (heightAboveFloor <= 0.001) lastGroundedFloorY = floorY; // only tracked while actually grounded
    updateWebGradient(camera.position.z, camera.position.y, elapsedTime);
    updateRain(delta);

    composer.render();
}

animate();
