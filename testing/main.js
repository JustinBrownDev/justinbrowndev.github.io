import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';

// =====================================================================
// CONFIG — every tunable lives here. Desktop is the target experience;
// the `mobile` block only overrides what needs to change for touch/perf.
// =====================================================================

const CONFIG = {

    targetPlatform: 'desktop',

    scene: {
        backgroundColor: 0x0a0407,
        fogColor: 0x140508,
        fogDensity: 0.05,
    },

    camera: {
        fov: 78,
        near: 0.05,
        far: 200,
        eyeHeight: 1.65,
        playerRadius: 0.32,
    },

    lighting: {
        ambientColor: 0x2a1018,
        ambientIntensity: 0.85,
        moonColor: 0x5a4468,
        moonIntensity: 0.18,
        moonPosition: { x: -5, y: 30, z: -10 },
        // ambient red haze light so alleys aren't pitch black between signs
        fillColor: 0xff3355,
        fillIntensity: 0.25,
        signLight: {
            intensity: 5,
            distance: 9,
            decay: 2,
        },
    },

    // per-platform render quality. Desktop values are the intended look;
    // mobile trims cost (pixel ratio, bloom, lights, prop count) to hold
    // frame rate on weaker GPUs instead of cutting features outright.
    quality: {
        desktop: {
            maxPixelRatio: 2,
            antialias: true,
            bloom: { strength: 1.1, radius: 0.55, threshold: 0.2 },
            drawDistance: 200,
            maxDynamicLights: 40,
            propDensity: 1.0,
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.85, radius: 0.45, threshold: 0.25 },
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
        cols: 15,
        rows: 15,
        cellSize: 7,        // world units per grid cell
        loopChance: 0.12,   // chance a redundant wall opens up into a plaza/loop
        buildingMarginMin: 0.6,  // how much smaller than the cell a building footprint is
        buildingMarginMax: 1.8,
    },

    buildings: {
        heightMin: 26,
        heightMax: 95,
        roughness: 0.95,
        // grimy low-fi facade tones — near-black with faint color casts
        palette: [0x14100f, 0x120c10, 0x181212, 0x100e16, 0x151011, 0x0f0d12],
        curb: {
            height: 0.12,
            overhang: 0.35, // how far the curb/base skirt extends past the facade
            color: 0x1c1414,
        },
    },

    // expanded neon palette — reds/pinks dominate (red-light district) but
    // amber, gold, purple, cyan and green punch through for real variety.
    neonPalette: [
        0xff1f4f, // crimson
        0xff2fd6, // magenta
        0xff5f2f, // blood orange
        0xffb02f, // amber
        0xfff02f, // sign yellow
        0xb02fff, // violet
        0x7a2fff, // indigo
        0x2fe8ff, // cyan
        0x2fffb0, // acid green
        0xff2f8a, // hot pink
        0xffffff, // bare bulb white
        0x2f8aff, // cold blue
    ],

    billboards: {
        // small + nearest-filtered = chunky low-fi pixel signage
        canvasWidth: 96,
        canvasHeight: 56,
        borderWidth: 3,
        titleFont: 'bold 20px "Courier New", monospace',
        subtitleFont: '11px "Courier New", monospace',
        chancePerFace: 0.75, // odds a building face bordering an alley gets a sign
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
        ],
    },

    props: {
        // relative spawn weight per alley cell — higher = more common
        weights: {
            trashCan: 4,
            trafficCone: 3,
            trafficSign: 2,
            crate: 4,
            lantern: 3,
            vendingMachine: 2,
            fenceSegment: 1.5,
            none: 5, // keeps some open floor so it's not wall-to-wall clutter
        },
        maxSpecialFeatures: {
            statues: 2,
            constructionZones: 2,
            crimeScenes: 1,
        },
    },

    movement: {
        speed: 4.5, // slower than before — cramped alleys, not a sprint
        maxDeltaSeconds: 0.1,
        collisionIterations: 2,
    },

    desktopControls: {
        pointerSpeed: 1.0,
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

scene.add(new THREE.AmbientLight(CONFIG.lighting.ambientColor, CONFIG.lighting.ambientIntensity));
scene.add(new THREE.HemisphereLight(CONFIG.lighting.fillColor, 0x0a0407, CONFIG.lighting.fillIntensity));
const moon = new THREE.DirectionalLight(CONFIG.lighting.moonColor, CONFIG.lighting.moonIntensity);
moon.position.set(CONFIG.lighting.moonPosition.x, CONFIG.lighting.moonPosition.y, CONFIG.lighting.moonPosition.z);
scene.add(moon);

let dynamicLightsRemaining = QUALITY.maxDynamicLights;

// ---------- small helpers ----------

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randRange(min, max) { return min + Math.random() * (max - min); }

function weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
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

function makeGroundTexture() {
    return makePixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#0c0808';
        ctx.fillRect(0, 0, w, h);
        // grimy pavement speckle
        for (let i = 0; i < 260; i++) {
            const shade = 10 + Math.floor(Math.random() * 14);
            ctx.fillStyle = `rgb(${shade + 8},${shade},${shade + 4})`;
            ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
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
    const dirs = [...DIRS].sort(() => Math.random() - 0.5);
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
        if (openNeighbors >= 2 && Math.random() < CONFIG.maze.loopChance) {
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
for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
        if (!grid[r][c] && openNeighborCount(c, r) >= 3) plazaCells.push([c, r]);
    }
}

// ---------- reusable geometry/materials ----------

const buildingBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const signGeo = new THREE.PlaneGeometry(1, 1);

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

    const building = new THREE.Mesh(
        buildingBoxGeo,
        new THREE.MeshStandardMaterial({ color, roughness: CONFIG.buildings.roughness })
    );
    building.scale.set(footprint, height, footprint);
    building.position.set(x, height / 2, z);
    scene.add(building);

    // curb/base skirt so the building reads as sitting on something, not floating
    const curb = CONFIG.buildings.curb;
    const skirt = new THREE.Mesh(
        buildingBoxGeo,
        new THREE.MeshStandardMaterial({ color: curb.color, roughness: 1 })
    );
    skirt.scale.set(footprint + curb.overhang, curb.height, footprint + curb.overhang);
    skirt.position.set(x, curb.height / 2, z);
    scene.add(skirt);

    // sign faces: one candidate per side that borders an open alley cell
    const faceDefs = [
        { dc: 0, dr: -1, rotY: 0, ox: 0, oz: -footprint / 2 - 0.03 },
        { dc: 0, dr: 1, rotY: Math.PI, ox: 0, oz: footprint / 2 + 0.03 },
        { dc: -1, dr: 0, rotY: -Math.PI / 2, ox: -footprint / 2 - 0.03, oz: 0 },
        { dc: 1, dr: 0, rotY: Math.PI / 2, ox: footprint / 2 + 0.03, oz: 0 },
    ];

    for (const face of faceDefs) {
        const nc = col + face.dc, nr = row + face.dr;
        if (grid[nr]?.[nc] !== false) continue; // only sign faces open onto an alley
        if (Math.random() > CONFIG.billboards.chancePerFace) continue;

        const usesNav = navPageIndex < CONFIG.billboards.navPages.length && Math.random() < 0.35;
        const content = usesNav
            ? CONFIG.billboards.navPages[navPageIndex++]
            : (([t, s]) => ({ title: t, subtitle: s }))(pick(CONFIG.billboards.flavorWords));
        const neon = pick(CONFIG.neonPalette);

        const signHeight = randRange(2.2, Math.min(height - 2, 6));
        addSign(
            x + face.ox, signHeight, z + face.oz,
            face.rotY, content.title, content.subtitle, neon
        );
    }
}

let navPageIndex = 0;

function addSign(x, y, z, rotY, title, subtitle, colorHex) {
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
    }
}

// ---------- props / fixtures ----------

function addTrashCan(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.24, 0.75, 10),
        new THREE.MeshStandardMaterial({ color: 0x201c1a, roughness: 0.85, metalness: 0.3 })
    );
    body.position.y = 0.375;
    const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10),
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
        new THREE.ConeGeometry(0.22, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0xff5f1f, roughness: 0.7 })
    );
    cone.position.y = 0.32;
    const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.19, 0.1, 8),
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
        new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6),
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
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const size = randRange(0.35, 0.55);
        const crate = new THREE.Mesh(
            new THREE.BoxGeometry(size, size, size),
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
        new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.7 })
    );
    pole.position.y = 1.3;
    const paper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8),
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

function addVendingMachine(x, z) {
    const colorHex = pick([0xff2f4f, 0x2fe8ff, 0xffb02f]);
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.6, 0.55),
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
    g.position.set(x, 0, z);
    scene.add(g);

    if (dynamicLightsRemaining > 0) {
        dynamicLightsRemaining--;
        const light = new THREE.PointLight(colorHex, 2.5, 4, 2);
        light.position.set(x, 1, z + 0.4);
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

function addStatue(x, z) {
    const g = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a4238, roughness: 1 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), stoneMat);
    pedestal.position.y = 0.3;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), stoneMat);
    body.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), stoneMat);
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
    trafficSign: (x, z) => addTrafficSign(x, z, randRange(0, Math.PI * 2)),
    crate: addCrate,
    lantern: addLantern,
    vendingMachine: addVendingMachine,
    fenceSegment: (x, z) => addFenceSegment(x, z, randRange(0, Math.PI * 2)),
};

// ---------- lay out the grid ----------

const propColliders = []; // {x, z, radius} — soft obstacles, blended into collision pass

for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
        if (grid[r][c]) addBuilding(c, r);
    }
}

// special features placed on plaza cells (wider open junctions)
const shuffledPlazas = [...plazaCells].sort(() => Math.random() - 0.5);
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

// general clutter across all remaining open cells (skip start cell + used plazas)
const usedPlazas = new Set(shuffledPlazas.slice(0, plazaCursor).map(([c, r]) => `${c},${r}`));
for (let r = 1; r < GRID_ROWS - 1; r++) {
    for (let c = 1; c < GRID_COLS - 1; c++) {
        if (grid[r][c]) continue;
        if (c === startCol && r === startRow) continue;
        if (usedPlazas.has(`${c},${r}`)) continue;
        if (Math.random() > QUALITY.propDensity) continue;

        const choice = weightedPick(CONFIG.props.weights);
        if (choice === 'none') continue;
        const { x, z } = cellToWorld(c, r);
        const jitter = CELL * 0.28;
        const px = x + randRange(-jitter, jitter);
        const pz = z + randRange(-jitter, jitter);
        const radius = PROP_BUILDERS[choice](px, pz);
        propColliders.push({ x: px, z: pz, radius });
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

const spawn = cellToWorld(startCol, startRow);
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

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(CONFIG.movement.maxDeltaSeconds, clock.getDelta());

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

    composer.render();
}

animate();
