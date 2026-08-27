import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/controls/PointerLockControls.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';

// ---------- basic setup ----------

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const scene = new THREE.Scene();
const bgColor = 0x0a0716;
scene.background = new THREE.Color(bgColor);
scene.fog = new THREE.FogExp2(bgColor, 0.028);

const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 1.7, 8);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// bloom so neon billboards actually glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,   // strength
    0.6,   // radius
    0.15   // threshold
);
composer.addPass(bloomPass);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- lighting ----------

scene.add(new THREE.AmbientLight(0x201830, 1.2));
const moon = new THREE.DirectionalLight(0x8899ff, 0.25);
moon.position.set(-5, 20, -10);
scene.add(moon);

// ---------- ground ----------

const STREET_LENGTH = 80;
const STREET_HALF_WIDTH = 6;

function makeGroundTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d0b16';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#241f38';
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 24);
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
    new THREE.PlaneGeometry(0.15, STREET_LENGTH),
    new THREE.MeshBasicMaterial({ color: 0xff2fd6 })
);
centerline.rotation.x = -Math.PI / 2;
centerline.position.set(0, 0.01, ground.position.z);
scene.add(centerline);

// ---------- billboards ----------

const NEON = [0xff2fd6, 0x2fe8ff, 0xffe62f, 0x2fff8a, 0xff6b2f];

function makeBillboardTexture(title, subtitle, colorHex) {
    const w = 512, h = 288;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const color = '#' + colorHex.toString(16).padStart(6, '0');

    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px "Courier New", monospace';
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillText(title, w / 2, h / 2 - 10);

    ctx.font = '28px "Courier New", monospace';
    ctx.shadowBlur = 12;
    ctx.fillText(subtitle, w / 2, h / 2 + 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function addBillboard(x, z, rotY, title, subtitle, colorHex, width = 5, height = 2.8) {
    const tex = makeBillboardTexture(title, subtitle, colorHex);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    plane.position.set(x, 4, z);
    plane.rotation.y = rotY;
    scene.add(plane);

    const light = new THREE.PointLight(colorHex, 6, 12, 2);
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
        new THREE.MeshStandardMaterial({ color: 0x120e1e, roughness: 0.9 })
    );
    building.position.set(x, height / 2, z);
    scene.add(building);

    const faceX = facingRight ? x - width / 2 - 0.05 : x + width / 2 + 0.05;
    const rotY = facingRight ? Math.PI / 2 : -Math.PI / 2;
    return { faceX, rotY };
}

// placeholder content — swap for real site sections later
const PAGES = [
    { title: 'PROJECTS', subtitle: 'selected work' },
    { title: 'ABOUT', subtitle: 'who\'s behind this' },
    { title: 'BLOG', subtitle: 'notes & writeups' },
    { title: 'CONTACT', subtitle: 'say hello' },
    { title: 'RESUME', subtitle: 'the paper trail' },
    { title: 'LAB', subtitle: 'experiments & wips' },
];

const BUILDING_DEPTH = 8;
const BUILDING_SPACING = 13;
let pageIndex = 0;

for (let i = 0; i < 6; i++) {
    const z = -8 - i * BUILDING_SPACING;
    const height = 12 + (i % 3) * 5;

    // left side
    {
        const x = -(STREET_HALF_WIDTH + 4);
        const { faceX, rotY } = addBuilding(x, z, 8, BUILDING_DEPTH, height, false);
        const page = PAGES[pageIndex % PAGES.length];
        addBillboard(faceX, z, rotY, page.title, page.subtitle, NEON[pageIndex % NEON.length]);
        pageIndex++;
    }
    // right side
    {
        const x = STREET_HALF_WIDTH + 4;
        const { faceX, rotY } = addBuilding(x, z, 8, BUILDING_DEPTH, height, true);
        const page = PAGES[pageIndex % PAGES.length];
        addBillboard(faceX, z, rotY, page.title, page.subtitle, NEON[pageIndex % NEON.length]);
        pageIndex++;
    }
}

// a capstone billboard at the far end of the street
addBillboard(0, -STREET_LENGTH + 12, Math.PI, 'HOME', 'jweb.dev', 0xffffff, 6, 3);

// ---------- movement: shared state ----------

const move = { forward: false, back: false, left: false, right: false };
let touchMoveVec = { x: 0, y: 0 }; // from joystick, x = strafe, y = forward
const velocity = new THREE.Vector3();
const CLAMP_X = STREET_HALF_WIDTH - 0.6;
const CLAMP_Z_MIN = -STREET_LENGTH + 13;
const CLAMP_Z_MAX = 9;

function clampPlayer() {
    camera.position.x = Math.max(-CLAMP_X, Math.min(CLAMP_X, camera.position.x));
    camera.position.z = Math.max(CLAMP_Z_MIN, Math.min(CLAMP_Z_MAX, camera.position.z));
    camera.position.y = 1.7;
}

// ---------- desktop controls ----------

const controls = new PointerLockControls(camera, renderer.domElement);

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
        }, 4000);
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
    const joystickZone = document.getElementById('joystickZone');
    const lookZone = document.getElementById('lookZone');
    const base = document.getElementById('joystickBase');
    const knob = document.getElementById('joystickKnob');

    let joystickTouchId = null;
    let joystickOrigin = { x: 0, y: 0 };
    const JOYSTICK_RADIUS = 50;

    let lookTouchId = null;
    let lastLook = { x: 0, y: 0 };
    const LOOK_SENSITIVITY = 0.0035;
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
            const dist = Math.min(JOYSTICK_RADIUS, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * dist;
            dy = Math.sin(angle) * dist;
            knob.style.left = (joystickOrigin.x + dx - 22) + 'px';
            knob.style.top = (joystickOrigin.y + dy - 22) + 'px';
            touchMoveVec.x = dx / JOYSTICK_RADIUS;
            touchMoveVec.y = dy / JOYSTICK_RADIUS;
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

            camera.rotation.y -= dx * LOOK_SENSITIVITY;
            pitch -= dy * LOOK_SENSITIVITY;
            pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
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
const SPEED = 5.5;

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(0.1, clock.getDelta());

    const forwardInput = (move.forward ? 1 : 0) - (move.back ? 1 : 0) - touchMoveVec.y;
    const rightInput = (move.right ? 1 : 0) - (move.left ? 1 : 0) + touchMoveVec.x;

    velocity.set(rightInput, 0, -forwardInput);
    if (velocity.lengthSq() > 1) velocity.normalize();
    velocity.multiplyScalar(SPEED * delta);

    if (controls.isLocked || IS_TOUCH) {
        controls.moveRight(velocity.x);
        controls.moveForward(-velocity.z);
    }

    clampPlayer();
    composer.render();
}

animate();
