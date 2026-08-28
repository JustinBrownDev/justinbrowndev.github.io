import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';

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
// street level, between the two.
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
            signChance: 0.7,
            propDensityMul: 0.85,
        },
    },

    camera: {
        fov: 78,
        near: 0.05,
        far: 220,
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
            drawDistance: 200,
            maxDynamicLights: 40,
            propDensity: 1.0,
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.4, radius: 0.35, threshold: 0.9 },
            drawDistance: 130,
            maxDynamicLights: 18,
            propDensity: 0.6,
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
        heightMin: 26,
        heightMax: 95,
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
    neonPalette: [
        0xffffff, // white
        0xfff02f, // yellow
        0xffd93f, // gold-yellow
        0x3aff6a, // green
        0x5eff8a, // light green
        0xff8a2f, // orange
        0xffa64d, // light orange
        0xff3b3b, // red
        0xff5555, // light red
        0x2fe8ff, // cyan
        0x5ff0ff, // light cyan
    ],
    // same colors, split by temperature so signage can lean warm toward
    // the light-web pole and cool toward the dark-web pole.
    neonWarm: [0xffffff, 0xfff02f, 0xffd93f, 0xff8a2f, 0xffa64d, 0xff3b3b, 0xff5555],
    neonCool: [0xffffff, 0x3aff6a, 0x5eff8a, 0x2fe8ff, 0x5ff0ff],

    // ---------------- real-world data ----------------
    // not synthetic noise — actual sourced numbers, fetched live and baked
    // in rather than called from the browser at runtime (a live third-party
    // API is a fragile thing to hang a visitor's page on). Everything here
    // is real; nothing is invented to look real.
    realData: {
        // DJIA closing-milestone history, Wikipedia "Closing milestones of
        // the Dow Jones Industrial Average" (fetched 2026-08-27). Real
        // value/year pairs, including the genuine 23-year gap where no new
        // milestone was set (1930-1953, the Depression) and the 2007-2013
        // gap (the financial crisis) — those flat stretches are real, not
        // decorative. This drives the "crack in the concrete" texture.
        djiaMilestones: [
            [1885, 62.76], [1890, 78.38], [1896, 28.48], [1906, 103.00],
            [1919, 119.62], [1929, 381.17], [1932, 41.22], [1972, 1003.16],
            [1973, 1050], [1987, 2000], [1987, 2250], [1987, 2500],
            [1989, 2750], [1991, 3000], [1993, 3500], [1995, 4000],
            [1995, 4500], [1995, 5000], [1996, 5500], [1996, 6000],
            [1996, 6500], [1997, 7000], [1997, 7500], [1997, 8000],
            [1998, 8500], [1998, 9000], [1999, 9500], [1999, 10000],
            [1999, 11000], [2006, 12000], [2007, 13000], [2007, 14000],
            [2013, 15000], [2013, 16000], [2014, 17000], [2014, 18000],
            [2016, 19000], [2017, 20000], [2017, 22500], [2018, 25000],
            [2019, 27500], [2019, 28000], [2020, 29000], [2020, 29500],
            [2020, 30000], [2020, 30500], [2021, 31000], [2021, 32000],
            [2021, 33000], [2021, 34000], [2021, 35000], [2021, 36000],
            [2022, 36500], [2023, 37000], [2023, 37500], [2024, 38000],
            [2024, 39000], [2024, 40000], [2024, 41000], [2024, 42000],
            [2024, 43000], [2024, 44000], [2024, 45000], [2025, 45500],
            [2025, 46500], [2025, 47500], [2025, 48500], [2026, 49500],
            [2026, 50000], [2026, 51000], [2026, 52000], [2026, 53000],
            [2026, 54000],
        ],
        // Real elevations in feet, Wikipedia (fetched 2026-08-27). Illinois
        // is the literal center of this project (SIU Carbondale, College of
        // DuPage — his actual home ground) and it is, factually, almost
        // dead flat: 590ft mean, a 956ft total range statewide. Everything
        // else here is real-world extremity around that flat, ordinary
        // center — Mount St. Helens' pair is a real BEFORE/AFTER: an
        // actual mountain that really lost 1,314ft in the 1980 eruption,
        // not a fabricated contrast.
        elevationsFt: [
            ['Mariana Trench (Challenger Deep)', -35876],
            ['Death Valley', -282],
            ['Illinois: Mississippi/Ohio confluence (low pt)', 279],
            ['Illinois: mean elevation', 590],
            ['Illinois: Charles Mound (high pt)', 1235],
            ['Mount St. Helens, post-1980 eruption', 8363],
            ['Mount St. Helens, pre-1980 eruption', 9677],
            ['Little Tahoma Peak', 11138],
            ['Mount Rainier: Liberty Cap', 14112],
            ['Mount Rainier: Point Success', 14158],
            ['Mount Rainier: Columbia Crest (summit)', 14406],
            ['Denali', 20310],
            ['K2', 28251],
            ['Mount Everest', 29032],
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
        ],
        // the whole reason this is a maze: the internet has more Justin
        // Browns on it than one person could ever Google through. these
        // are all decoys — every one of them queryable, none of them him.
        decoyIdentities: [
            ['J. BROWN', 'orthodontist · OH'], ['JUSTIN BROWN', 'youth soccer, U12'],
            ['J BROWN', 'in memoriam 1958–2011'], ['JUSTINBROWN99', 'last seen 2013'],
            ['J BROWN LLC', 'entity dissolved'], ['JUSTIN R. BROWN', 'unclaimed property'],
            ['@justinbrown', 'account suspended'], ['J. BROWN', '214 county matches'],
            ['JUSTIN BROWN', 'this is not him'], ['J. BROWN', 'no relation'],
            ['JUSTIN BROWN', 'real estate, TX'], ['J BROWN', 'obituary, 1972'],
            ['JUSTIN BROWN', 'band, defunct'], ['J. BROWN', 'wrong number'],
            ['JUSTIN BROWN', 'see also: 4,281 others'],
        ],
        // the site itself talking back — the machinery of search admitting
        // it came up short, or asking you to keep paying for the privilege.
        systemNoise: [
            ['NO RESULTS', 'refine your query'], ['0 OF 4,281,006', 'matches'],
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
            ['4,281 JUSTIN BROWNS FOUND', 'none of them him — full report pg. 6'],
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
            none: 1.5,
        },
        maxSpecialFeatures: {
            statues: 3,
            constructionZones: 3,
            crimeScenes: 2,
            newsstands: 2,
            phoneBooths: 2,
            atmKiosks: 2,
        },
    },

    movement: {
        speed: 4.5, // slower than before — cramped alleys, not a sprint
        maxDeltaSeconds: 0.1,
        collisionIterations: 2,
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
const QUALITY = IS_TOUCH ? CONFIG.quality.mobile : CONFIG.quality.desktop;

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

const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    QUALITY.bloom.strength,
    QUALITY.bloom.radius,
    QUALITY.bloom.threshold
);
composer.addPass(bloomPass);

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

const _fogLerp = new THREE.Color();
const _ambLerp = new THREE.Color();

function webAlignment(worldZ) {
    return THREE.MathUtils.clamp((worldZ / (GRID_H / 2) + 1) / 2, 0, 1);
}

function updateWebGradient(worldZ) {
    const t = webAlignment(worldZ);
    const dark = CONFIG.narrative.darkWeb;
    const light = CONFIG.narrative.lightWeb;

    _fogLerp.set(dark.fogColor).lerp(new THREE.Color(light.fogColor), t);
    scene.fog.color.copy(_fogLerp);
    scene.fog.density = THREE.MathUtils.lerp(dark.fogDensity, light.fogDensity, t);

    _ambLerp.set(dark.ambientColor).lerp(new THREE.Color(light.ambientColor), t);
    ambientLight.color.copy(_ambLerp);
    ambientLight.intensity = THREE.MathUtils.lerp(dark.ambientIntensity, light.ambientIntensity, t);
    hemiLight.intensity = THREE.MathUtils.lerp(dark.hemiIntensity, light.hemiIntensity, t);
    // weather rides the same gradient: damp/overcast toward dark-web
    // (north), bone dry toward light-web (south) — never both, never
    // neither, the contrast is continuous just like everything else here.
    rainMat.opacity = (1 - t) * 0.5;
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

// a real fissure in the pavement, dropped as ground clutter — pulls
// straight from makeCrackTexture rather than a synthetic crack pattern.
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
    const pushUV = (y0, y1, y2) => { uvs.push(0.5, y0 / height, 0.5, y1 / height, 0.5, y2 / height); };

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
        pushTri(b0, t1, b1); pushUV(0, 1, 0);
        pushTri(b0, t0, t1); pushUV(0, 1, 1);
    }
    for (let i = 1; i < n - 1; i++) { // top cap fan (footprint is convex)
        const t0 = [topPts[0][0], height, topPts[0][1]];
        const ti = [topPts[i][0], height, topPts[i][1]];
        const tj = [topPts[i + 1][0], height, topPts[i + 1][1]];
        pushTri(t0, tj, ti); pushUV(1, 1, 1); // same fix, normal was pointing down into the roof
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

function addBuilding(col, row) {
    const { x, z } = cellToWorld(col, row);
    const margin = randRange(CONFIG.maze.buildingMarginMin, CONFIG.maze.buildingMarginMax);
    const footprint = CELL - margin;
    footprintOf[row][col] = footprint;
    const height = randRange(CONFIG.buildings.heightMin, CONFIG.buildings.heightMax);
    const color = pick(CONFIG.buildings.palette);

    // ~1 in 6 buildings is "stained" with the real elevation-gradient
    // texture instead of a flat facade color — trench-dark at the base
    // climbing toward summit-pale near the roofline.
    const useStain = rng() < 0.16;
    const material = useStain
        ? new THREE.MeshStandardMaterial({ map: makeTopologyStainTexture(), roughness: CONFIG.buildings.roughness })
        : new THREE.MeshStandardMaterial({ color, roughness: CONFIG.buildings.roughness });

    // ~30% of buildings are two-stage setback towers instead of a single
    // prism — a wider base with a narrower tower rising off it, like a
    // real setback skyscraper. Reuses the same organic-tower builder
    // twice rather than a whole new geometry function; the base tower's
    // own top cap doubles as the roof deck the upper stage stands on,
    // and the upper stage's un-capped bottom is never seen from ground
    // level. Keeps the whole scene from reading as one repeated formula.
    if (rng() < 0.3) {
        const baseHeight = height * randRange(0.4, 0.7);
        const upperHeight = height - baseHeight;
        const upperHw = (footprint / 2) * randRange(0.5, 0.8);
        const base = new THREE.Mesh(buildOrganicTowerGeometry(footprint / 2, baseHeight), material);
        base.position.set(x, 0, z);
        scene.add(base);
        const upper = new THREE.Mesh(buildOrganicTowerGeometry(upperHw, upperHeight), material);
        upper.position.set(x, baseHeight, z);
        scene.add(upper);
    } else {
        const building = new THREE.Mesh(buildOrganicTowerGeometry(footprint / 2, height), material);
        building.position.set(x, 0, z); // organic geometry already spans y=0..height
        scene.add(building);
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
        const signHeight = randRange(2.2, Math.min(height - 2, 6));
        addSign(
            x + face.ox, signHeight, z + face.oz,
            face.rotY, content.title, content.subtitle, neon, content.flicker
        );

        // low chance of a tag scrawled near ground level on the same wall —
        // independent of whether a sign landed above it.
        if (rng() < 0.16) {
            addGraffitiTag(x + face.ox * 0.99, randRange(0.6, 1.6), z + face.oz * 0.99, face.rotY);
        }
        // low chance of a security camera watching the alley — everything
        // queryable is also everything watched.
        if (rng() < 0.06) {
            addSecurityCamera(x + face.ox * 0.97, z + face.oz * 0.97, face.rotY, height);
        }
        // ivy/dead-vine patch, independent of everything else on this wall
        if (rng() < 0.14) {
            addIvyPatch(x + face.ox * 0.98, randRange(0.6, Math.min(height - 1, 4)), z + face.oz * 0.98, face.rotY);
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
        if (job.kind === 'poster') {
            addWallPoster(face.x, y, face.z, face.rotY, job.title, job.subtitle);
        } else {
            addTerminalPlaque(face.x, y, face.z, face.rotY, job.title, job.subtitle);
        }
    }
}

// ---------- props / fixtures ----------

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
    return 0.32;
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

// a flyer dropped flat on the pavement — skills & rhetoric fragments.
// common, cheap, everywhere; the "public secret" hiding in plain sight.
function addStickerTag(x, z) {
    const [title, subtitle] = pick([...CONFIG.siteContent.skills, ...CONFIG.siteContent.about]);
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
    return 1.4;
}

const PROP_BUILDERS = {
    trashCan: addTrashCan,
    trafficCone: addTrafficCone,
    trafficSign: (x, z, facingRotY) => addTrafficSign(x, z, facingRotY ?? randRange(0, Math.PI * 2)),
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

// ---------- lay out the grid ----------

const propColliders = []; // {x, z, radius} — soft obstacles, blended into collision pass

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
            addSign(x + face.ox, 2.4, z + face.oz, face.rotY, content.title, content.subtitle, content.color);
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
    propColliders.push({ x, z, radius: r });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.constructionZones; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addConstructionZone(x, z);
    propColliders.push({ x, z, radius: r });
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
    propColliders.push({ x, z, radius: r });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.phoneBooths; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addPhoneBooth(x, z);
    propColliders.push({ x, z, radius: r });
}
for (let i = 0; i < CONFIG.props.maxSpecialFeatures.atmKiosks; i++) {
    const cell = nextPlazaCell();
    if (!cell) break;
    const { x, z } = cellToWorld(cell[0], cell[1]);
    const r = addAtmKiosk(x, z, plazaFacingRotY(cell[0], cell[1]));
    propColliders.push({ x, z, radius: r });
}

// every plaza gets a bright pool of light, regardless of whether it also
// hosts a statue/landmark — open areas are lit, full stop.
for (const [pc, pr] of plazaCells) {
    const { x, z } = cellToWorld(pc, pr);
    addPlazaGlow(x, z);
}

// props that realistically sit against a wall rather than floating in
// the middle of a walkway — real alleys put trash cans and machines
// against the building, not centered in the path.
const WALL_HUGGING_PROPS = new Set([
    'trashCan', 'vendingMachine', 'museumPlacard', 'trafficSign',
    'fenceSegment', 'stickerTag', 'businessCardLitter',
]);

// which adjacent cells (if any) are solid walls this cell could hug —
// returns unit direction(s) pointing FROM the open cell TOWARD each wall.
function wallDirections(c, r) {
    const dirs = [];
    if (grid[r]?.[c - 1]) dirs.push({ dx: -1, dz: 0 });
    if (grid[r]?.[c + 1]) dirs.push({ dx: 1, dz: 0 });
    if (grid[r - 1]?.[c]) dirs.push({ dx: 0, dz: -1 });
    if (grid[r + 1]?.[c]) dirs.push({ dx: 0, dz: 1 });
    return dirs;
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

        // overhead cables: strung across the alley wherever there's a
        // building directly on both sides (either axis) — the literal
        // network overhead, independent of ground clutter below it.
        if (grid[r]?.[c - 1] && grid[r]?.[c + 1] && rng() < 0.3) {
            const wa = cellToWorld(c - 1, r), wb = cellToWorld(c + 1, r);
            const fa = footprintOf[r][c - 1] ?? CELL * 0.6, fb = footprintOf[r][c + 1] ?? CELL * 0.6;
            addOverheadCable(wa.x + fa / 2, wa.z, wb.x - fb / 2, wb.z);
        }
        if (grid[r - 1]?.[c] && grid[r + 1]?.[c] && rng() < 0.3) {
            const wa = cellToWorld(c, r - 1), wb = cellToWorld(c, r + 1);
            const fa = footprintOf[r - 1][c] ?? CELL * 0.6, fb = footprintOf[r + 1][c] ?? CELL * 0.6;
            addOverheadCable(wa.x, wa.z + fa / 2, wb.x, wb.z - fb / 2);
        }

        const t = webAlignment(cellToWorld(c, r).z);
        const gradientMul = THREE.MathUtils.lerp(
            CONFIG.narrative.darkWeb.propDensityMul, CONFIG.narrative.lightWeb.propDensityMul, t
        );
        if (rng() > QUALITY.propDensity * gradientMul) continue;

        const choice = weightedPick(CONFIG.props.weights);
        if (choice === 'none') continue;
        const { x, z } = cellToWorld(c, r);

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
                [randRange(-jitter, jitter), randRange(-jitter, jitter)],
                [randRange(-jitter, jitter), randRange(-jitter, jitter)],
                [0, 0],
            ]);
            px = spot.x; pz = spot.z;
        }

        const radius = PROP_BUILDERS[choice](px, pz, facingRotY);
        propColliders.push({ x: px, z: pz, radius });
        // a tree means this pocket reads as dense/overgrown — shade it
        if (choice === 'tree') addThicketShade(x, z);
    }
}

// ---------- player collision ----------

const PLAYER_RADIUS = CONFIG.camera.playerRadius;

function worldToCell(x, z) {
    return {
        col: Math.round(x / CELL + (GRID_COLS - 1) / 2),
        row: Math.round(z / CELL + (GRID_ROWS - 1) / 2),
    };
}

function resolveCollisions(position) {
    const { col, row } = worldToCell(position.x, position.z);

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const c = col + dc, r = row + dr;
            if (!grid[r]?.[c]) continue; // out of bounds or open cell — nothing solid

            const { x: cx, z: cz } = cellToWorld(c, r);
            const footprint = footprintOf[r]?.[c] ?? (CELL - CONFIG.maze.buildingMarginMin);
            const half = footprint / 2 + PLAYER_RADIUS;
            const dx = position.x - cx;
            const dz = position.z - cz;

            if (Math.abs(dx) > half || Math.abs(dz) > half) continue;

            // push out along the axis of least penetration
            const penX = half - Math.abs(dx);
            const penZ = half - Math.abs(dz);
            if (penX < penZ) {
                position.x = cx + Math.sign(dx || 1) * half;
            } else {
                position.z = cz + Math.sign(dz || 1) * half;
            }
        }
    }

    // soft props: simple circle-circle push-out
    for (const p of propColliders) {
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

const move = { forward: false, back: false, left: false, right: false };
let touchMoveVec = { x: 0, y: 0 }; // from joystick, x = strafe, y = forward
const velocity = new THREE.Vector3();

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
} else {
    crosshair.style.display = 'block';
    showHint('click to look around · WASD to move · ESC to release');

    document.addEventListener('click', (e) => {
        if (e.target.closest('#backLink')) return;
        if (!controls.isLocked) controls.lock();
    });
    controls.addEventListener('lock', () => fadeHint(300));
    controls.addEventListener('unlock', () => showHint('click to look around · WASD to move'));
}

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = true; break;
        case 'KeyS': case 'ArrowDown': move.back = true; break;
        case 'KeyA': case 'ArrowLeft': move.left = true; break;
        case 'KeyD': case 'ArrowRight': move.right = true; break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = false; break;
        case 'KeyS': case 'ArrowDown': move.back = false; break;
        case 'KeyA': case 'ArrowLeft': move.left = false; break;
        case 'KeyD': case 'ArrowRight': move.right = false; break;
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

// ---------- render loop ----------

const clock = new THREE.Clock();

let elapsedTime = 0; // hand-accumulated: clock.getElapsedTime() would double-consume delta

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(CONFIG.movement.maxDeltaSeconds, clock.getDelta());
    elapsedTime += delta;

    for (const f of flickerLights) {
        f.light.intensity = f.mode === 'blink'
            ? (Math.floor(elapsedTime * f.speed + f.phase) % 2 === 0 ? f.base : 0)
            : f.base * (0.55 + 0.45 * Math.sin(elapsedTime * f.speed + f.phase));
    }

    const forwardInput = (move.forward ? 1 : 0) - (move.back ? 1 : 0) - touchMoveVec.y;
    const rightInput = (move.right ? 1 : 0) - (move.left ? 1 : 0) + touchMoveVec.x;

    velocity.set(rightInput, 0, -forwardInput);
    if (velocity.lengthSq() > 1) velocity.normalize();
    velocity.multiplyScalar(CONFIG.movement.speed * delta);

    if (controls.isLocked || IS_TOUCH) {
        controls.moveRight(velocity.x);
        controls.moveForward(-velocity.z);
    }

    for (let i = 0; i < CONFIG.movement.collisionIterations; i++) {
        resolveCollisions(camera.position);
    }
    camera.position.y = CONFIG.camera.eyeHeight;
    updateWebGradient(camera.position.z);
    updateRain(delta);

    composer.render();
}

animate();
