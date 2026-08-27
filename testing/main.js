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

    // which experience to favor when the two disagree. Desktop settings
    // below are the "real" experience; mobile is a lighter fallback so
    // touch users still get the full walkaround, not a stripped demo.
    targetPlatform: 'desktop',

    scene: {
        backgroundColor: 0x0a0716,
        fogColor: 0x0a0716,
        fogDensity: 0.028,
    },

    camera: {
        fov: 75,
        near: 0.1,
        far: 200,
        eyeHeight: 1.7,
        startPosition: { x: 0, y: 1.7, z: 8 },
    },

    lighting: {
        ambientColor: 0x201830,
        ambientIntensity: 1.2,
        moonColor: 0x8899ff,
        moonIntensity: 0.25,
        moonPosition: { x: -5, y: 20, z: -10 },
        billboardLight: {
            intensity: 6,
            distance: 12,
            decay: 2,
        },
    },

    // per-platform render quality. Desktop values are the intended look;
    // mobile trims cost (pixel ratio, bloom, draw distance) to hold frame
    // rate on weaker GPUs instead of cutting features outright.
    quality: {
        desktop: {
            maxPixelRatio: 2,
            antialias: true,
            bloom: { strength: 0.9, radius: 0.6, threshold: 0.15 },
            drawDistance: 200,
        },
        mobile: {
            maxPixelRatio: 1.5,
            antialias: false,
            bloom: { strength: 0.7, radius: 0.5, threshold: 0.2 },
            drawDistance: 140,
        },
    },

    street: {
        length: 80,
        halfWidth: 6,
        texture: {
            canvasSize: 512,
            baseColor: '#0d0b16',
            gridColor: '#241f38',
            gridSpacing: 32,
            gridLineWidth: 2,
            repeatX: 6,
            repeatY: 24,
        },
        centerline: {
            width: 0.15,
            color: 0xff2fd6,
        },
    },

    buildings: {
        count: 6,
        width: 8,
        depth: 8,
        spacing: 13,
        startZ: -8,
        minHeight: 12,
        heightVariance: 5,
        heightVarianceSteps: 3,
        color: 0x120e1e,
        roughness: 0.9,
    },

    billboards: {
        width: 5,
        height: 2.8,
        neonColors: [0xff2fd6, 0x2fe8ff, 0xffe62f, 0x2fff8a, 0xff6b2f],
        texture: {
            canvasWidth: 512,
            canvasHeight: 288,
            backgroundColor: '#050308',
            borderWidth: 6,
            titleFont: 'bold 56px "Courier New", monospace',
            subtitleFont: '28px "Courier New", monospace',
            titleShadowBlur: 24,
            subtitleShadowBlur: 12,
        },
        // placeholder content — swap for real site sections later
        pages: [
            { title: 'PROJECTS', subtitle: 'selected work' },
            { title: 'ABOUT', subtitle: 'who\'s behind this' },
            { title: 'BLOG', subtitle: 'notes & writeups' },
            { title: 'CONTACT', subtitle: 'say hello' },
            { title: 'RESUME', subtitle: 'the paper trail' },
            { title: 'LAB', subtitle: 'experiments & wips' },
        ],
        capstone: { title: 'HOME', subtitle: 'jweb.dev', color: 0xffffff, width: 6, height: 3 },
    },

    movement: {
        speed: 5.5,
        maxDeltaSeconds: 0.1, // clamp for tab-switch / frame hitches
        clampMargin: 0.6,     // how far from street edge the player can walk
    },

    // desktop input — keyboard is fixed (WASD/arrows), mouse look is tunable
    desktopControls: {
        pointerSpeed: 1.0,
    },

    // touch input — only relevant when a touch-primary device is detected
    touchControls: {
        joystickRadius: 50,
        lookSensitivity: 0.0035,
        hintDisplayMs: 4000,
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
camera.position.set(
    CONFIG.camera.startPosition.x,
    CONFIG.camera.startPosition.y,
    CONFIG.camera.startPosition.z
);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// bloom so neon billboards actually glow
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
const moon = new THREE.DirectionalLight(CONFIG.lighting.moonColor, CONFIG.lighting.moonIntensity);
moon.position.set(
    CONFIG.lighting.moonPosition.x,
    CONFIG.lighting.moonPosition.y,
    CONFIG.lighting.moonPosition.z
);
scene.add(moon);

// ---------- ground ----------

const STREET_LENGTH = CONFIG.street.length;
const STREET_HALF_WIDTH = CONFIG.street.halfWidth;

function makeGroundTexture() {
    const t = CONFIG.street.texture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = t.canvasSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = t.baseColor;
    ctx.fillRect(0, 0, t.canvasSize, t.canvasSize);
    ctx.strokeStyle = t.gridColor;
    ctx.lineWidth = t.gridLineWidth;
    for (let i = 0; i <= t.canvasSize; i += t.gridSpacing) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, t.canvasSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(t.canvasSize, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(t.repeatX, t.repeatY);
    return tex;
}

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET_HALF_WIDTH * 2, STREET_LENGTH),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -STREET_LENGTH / 2 + 8);
scene.add(ground);

// glowing centerline down the street, cheap avant-garde touch
const centerline = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.street.centerline.width, STREET_LENGTH),
    new THREE.MeshBasicMaterial({ color: CONFIG.street.centerline.color })
);
centerline.rotation.x = -Math.PI / 2;
centerline.position.set(0, 0.01, ground.position.z);
scene.add(centerline);

// ---------- billboards ----------

function makeBillboardTexture(title, subtitle, colorHex) {
    const t = CONFIG.billboards.texture;
    const canvas = document.createElement('canvas');
    canvas.width = t.canvasWidth; canvas.height = t.canvasHeight;
    const ctx = canvas.getContext('2d');
    const color = '#' + colorHex.toString(16).padStart(6, '0');

    ctx.fillStyle = t.backgroundColor;
    ctx.fillRect(0, 0, t.canvasWidth, t.canvasHeight);

    ctx.strokeStyle = color;
    ctx.lineWidth = t.borderWidth;
    ctx.strokeRect(10, 10, t.canvasWidth - 20, t.canvasHeight - 20);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = t.titleFont;
    ctx.shadowColor = color;
    ctx.shadowBlur = t.titleShadowBlur;
    ctx.fillText(title, t.canvasWidth / 2, t.canvasHeight / 2 - 10);

    ctx.font = t.subtitleFont;
    ctx.shadowBlur = t.subtitleShadowBlur;
    ctx.fillText(subtitle, t.canvasWidth / 2, t.canvasHeight / 2 + 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function addBillboard(x, z, rotY, title, subtitle, colorHex, width = CONFIG.billboards.width, height = CONFIG.billboards.height) {
    const tex = makeBillboardTexture(title, subtitle, colorHex);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    plane.position.set(x, 4, z);
    plane.rotation.y = rotY;
    scene.add(plane);

    const bl = CONFIG.lighting.billboardLight;
    const light = new THREE.PointLight(colorHex, bl.intensity, bl.distance, bl.decay);
    light.position.set(
        x + Math.sin(rotY) * 1.5,
        4,
        z + Math.cos(rotY) * 1.5
    );
    scene.add(light);
}

// ---------- buildings ----------

function addBuilding(x, z, width, depth, height, facingRight) {
    const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: CONFIG.buildings.color, roughness: CONFIG.buildings.roughness })
    );
    building.position.set(x, height / 2, z);
    scene.add(building);

    const faceX = facingRight ? x - width / 2 - 0.05 : x + width / 2 + 0.05;
    const rotY = facingRight ? Math.PI / 2 : -Math.PI / 2;
    return { faceX, rotY };
}

{
    const b = CONFIG.buildings;
    const pages = CONFIG.billboards.pages;
    let pageIndex = 0;

    for (let i = 0; i < b.count; i++) {
        const z = b.startZ - i * b.spacing;
        const height = b.minHeight + (i % b.heightVarianceSteps) * b.heightVariance;

        // left side
        {
            const x = -(STREET_HALF_WIDTH + 4);
            const { faceX, rotY } = addBuilding(x, z, b.width, b.depth, height, false);
            const page = pages[pageIndex % pages.length];
            addBillboard(faceX, z, rotY, page.title, page.subtitle, CONFIG.billboards.neonColors[pageIndex % CONFIG.billboards.neonColors.length]);
            pageIndex++;
        }
        // right side
        {
            const x = STREET_HALF_WIDTH + 4;
            const { faceX, rotY } = addBuilding(x, z, b.width, b.depth, height, true);
            const page = pages[pageIndex % pages.length];
            addBillboard(faceX, z, rotY, page.title, page.subtitle, CONFIG.billboards.neonColors[pageIndex % CONFIG.billboards.neonColors.length]);
            pageIndex++;
        }
    }

    // a capstone billboard at the far end of the street
    const cap = CONFIG.billboards.capstone;
    addBillboard(0, -STREET_LENGTH + 12, Math.PI, cap.title, cap.subtitle, cap.color, cap.width, cap.height);
}

// ---------- movement: shared state ----------

const move = { forward: false, back: false, left: false, right: false };
let touchMoveVec = { x: 0, y: 0 }; // from joystick, x = strafe, y = forward
const velocity = new THREE.Vector3();
const CLAMP_X = STREET_HALF_WIDTH - CONFIG.movement.clampMargin;
const CLAMP_Z_MIN = -STREET_LENGTH + 13;
const CLAMP_Z_MAX = 9;

function clampPlayer() {
    camera.position.x = Math.max(-CLAMP_X, Math.min(CLAMP_X, camera.position.x));
    camera.position.z = Math.max(CLAMP_Z_MIN, Math.min(CLAMP_Z_MAX, camera.position.z));
    camera.position.y = CONFIG.camera.eyeHeight;
}

// ---------- desktop controls ----------

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = CONFIG.desktopControls.pointerSpeed;

const overlay = document.getElementById('overlay');
const enterBtn = document.getElementById('enterBtn');
const crosshair = document.getElementById('crosshair');
const controlsHint = document.getElementById('controlsHint');

controlsHint.textContent = IS_TOUCH
    ? 'left half: move · right half: drag to look'
    : 'WASD to move · mouse to look · ESC to pause';

enterBtn.addEventListener('click', () => {
    if (IS_TOUCH) {
        overlay.style.display = 'none';
        document.getElementById('joystickZone').style.display = 'block';
        document.getElementById('lookZone').style.display = 'block';
        document.getElementById('touchHint').style.display = 'block';
        setTimeout(() => {
            document.getElementById('touchHint').style.display = 'none';
        }, CONFIG.touchControls.hintDisplayMs);
    } else {
        controls.lock();
    }
});

controls.addEventListener('lock', () => {
    overlay.style.display = 'none';
    crosshair.style.display = 'block';
});
controls.addEventListener('unlock', () => {
    overlay.style.display = 'flex';
    crosshair.style.display = 'none';
});

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

    clampPlayer();
    composer.render();
}

animate();
