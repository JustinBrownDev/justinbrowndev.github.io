"use strict";

const bootStart = performance.now();
const canvas = document.getElementById("view");
const statusEl = document.getElementById("status");

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  desynchronized: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false
});

if (!gl) {
  document.body.innerHTML = '<div class="fatal">WebGL2 is required for the /test performance renderer.</div>';
  throw new Error("WebGL2 unavailable");
}

const CHUNK_SIZE = 96;
const STRIDE_FLOATS = 7;
const PLAYER_RADIUS = 0.55;
const EYE_HEIGHT = 1.72;
const hardware = {
  cores: navigator.hardwareConcurrency || 4,
  memory: navigator.deviceMemory || 8,
  mobile: matchMedia("(pointer:coarse)").matches && Math.min(innerWidth, innerHeight) < 900
};
hardware.low = hardware.cores <= 2 || (hardware.cores <= 4 && hardware.memory <= 4);

const GENERATE_RADIUS = hardware.low ? 2 : hardware.mobile ? 3 : 4;
const RENDER_RADIUS = GENERATE_RADIUS;
const KEEP_RADIUS = GENERATE_RADIUS + 2;
const MAX_INSTANCES = hardware.low ? 2400 : hardware.mobile ? 4200 : 6500;
const PIXEL_BUDGET = hardware.low ? 1_150_000 : hardware.mobile ? 1_750_000 : 2_600_000;
const DPR_CAP = hardware.low ? 1 : hardware.mobile ? 1.25 : 1.5;
const params = new URLSearchParams(location.search);
const requestedSeed = Number(params.get("seed"));
const WORLD_SEED = Number.isFinite(requestedSeed)
  ? requestedSeed >>> 0
  : crypto.getRandomValues(new Uint32Array(1))[0];
const TARGET_CHUNKS = (GENERATE_RADIUS * 2 + 1) ** 2;

const player = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0 };
const keys = new Uint8Array(256);
const projection = new Float32Array(16);
const view = new Float32Array(16);
const instanceScratch = new Float32Array(MAX_INSTANCES * STRIDE_FLOATS);
const chunks = new Map();
const requested = new Map();
let worker = null;
let workerStarted = false;
let currentChunkX = 0;
let currentChunkZ = 0;
let instanceCount = 1;
let dirtyInstances = true;
let resizePending = true;
let resolutionScale = 1;
let effectiveDpr = 1;
let frameMsEma = 16.67;
let lastFrame = 0;
let lastHud = 0;
let lastScaleCheck = 0;
let firstFrameMs = 0;
let fastScaleVotes = 0;
let frameNumber = 0;

function shader(type, source) {
  const out = gl.createShader(type);
  gl.shaderSource(out, source);
  gl.compileShader(out);
  if (!gl.getShaderParameter(out, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(out) || "Shader compilation failed";
    gl.deleteShader(out);
    throw new Error(message);
  }
  return out;
}

function program(vertexSource, fragmentSource) {
  const vertex = shader(gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
  const out = gl.createProgram();
  gl.attachShader(out, vertex);
  gl.attachShader(out, fragment);
  gl.linkProgram(out);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(out, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(out) || "Program link failed";
    gl.deleteProgram(out);
    throw new Error(message);
  }
  return out;
}

const buildingProgram = program(`#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iBase;
layout(location=3) in vec3 iScale;
layout(location=4) in float iTint;
uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uCamera;
out vec3 vNormal;
out float vTint;
out float vFog;
void main() {
  vec3 world = iBase + aPosition * iScale;
  vNormal = aNormal;
  vTint = iTint;
  float distanceFromCamera = length(world.xz - uCamera.xz);
  vFog = smoothstep(215.0, 455.0, distanceFromCamera);
  gl_Position = uProjection * uView * vec4(world, 1.0);
}`,
`#version 300 es
precision mediump float;
in vec3 vNormal;
in float vTint;
in float vFog;
out vec4 outColor;
void main() {
  const vec3 fog = vec3(0.019, 0.028, 0.038);
  vec3 color;
  if (vTint < 0.0) {
    color = vec3(0.027, 0.035, 0.042);
  } else {
    vec3 low = vec3(0.050, 0.085, 0.105);
    vec3 high = vec3(0.105, 0.205, 0.270);
    color = mix(low, high, vTint);
    float light = 0.34 + 0.66 * max(dot(normalize(vNormal), normalize(vec3(0.42, 0.82, 0.29))), 0.0);
    color *= light;
  }
  outColor = vec4(mix(color, fog, vFog), 1.0);
}`);

const uProjection = gl.getUniformLocation(buildingProgram, "uProjection");
const uView = gl.getUniformLocation(buildingProgram, "uView");
const uCamera = gl.getUniformLocation(buildingProgram, "uCamera");

const cube = new Float32Array([
  // front +Z
  -0.5,0,0.5, 0,0,1,   0.5,0,0.5, 0,0,1,   0.5,1,0.5, 0,0,1,
  -0.5,0,0.5, 0,0,1,   0.5,1,0.5, 0,0,1,  -0.5,1,0.5, 0,0,1,
  // back -Z
   0.5,0,-0.5, 0,0,-1, -0.5,0,-0.5, 0,0,-1, -0.5,1,-0.5, 0,0,-1,
   0.5,0,-0.5, 0,0,-1, -0.5,1,-0.5, 0,0,-1,  0.5,1,-0.5, 0,0,-1,
  // left -X
  -0.5,0,-0.5, -1,0,0, -0.5,0,0.5, -1,0,0, -0.5,1,0.5, -1,0,0,
  -0.5,0,-0.5, -1,0,0, -0.5,1,0.5, -1,0,0, -0.5,1,-0.5, -1,0,0,
  // right +X
   0.5,0,0.5, 1,0,0,   0.5,0,-0.5, 1,0,0,   0.5,1,-0.5, 1,0,0,
   0.5,0,0.5, 1,0,0,   0.5,1,-0.5, 1,0,0,   0.5,1,0.5, 1,0,0,
  // top +Y
  -0.5,1,-0.5, 0,1,0, -0.5,1,0.5, 0,1,0,   0.5,1,0.5, 0,1,0,
  -0.5,1,-0.5, 0,1,0,  0.5,1,0.5, 0,1,0,   0.5,1,-0.5, 0,1,0,
  // bottom -Y
  -0.5,0,0.5, 0,-1,0, -0.5,0,-0.5, 0,-1,0,  0.5,0,-0.5, 0,-1,0,
  -0.5,0,0.5, 0,-1,0,  0.5,0,-0.5, 0,-1,0,  0.5,0,0.5, 0,-1,0
]);

const vao = gl.createVertexArray();
const cubeBuffer = gl.createBuffer();
const instanceBuffer = gl.createBuffer();
gl.bindVertexArray(vao);

gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer);
gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferData(gl.ARRAY_BUFFER, instanceScratch.byteLength, gl.DYNAMIC_DRAW);
const strideBytes = STRIDE_FLOATS * 4;
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 3, gl.FLOAT, false, strideBytes, 0);
gl.vertexAttribDivisor(2, 1);
gl.enableVertexAttribArray(3);
gl.vertexAttribPointer(3, 3, gl.FLOAT, false, strideBytes, 12);
gl.vertexAttribDivisor(3, 1);
gl.enableVertexAttribArray(4);
gl.vertexAttribPointer(4, 1, gl.FLOAT, false, strideBytes, 24);
gl.vertexAttribDivisor(4, 1);
gl.bindVertexArray(null);

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);
gl.disable(gl.BLEND);
gl.clearColor(0.019, 0.028, 0.038, 1);

function writeGround() {
  // One huge, shallow cube. It keeps the critical renderer to one draw call.
  instanceScratch[0] = -5000;
  instanceScratch[1] = -0.12;
  instanceScratch[2] = -5000;
  instanceScratch[3] = 10000;
  instanceScratch[4] = 0.08;
  instanceScratch[5] = 10000;
  instanceScratch[6] = -1;
}

function rebuildInstances() {
  writeGround();
  let count = 1;

  for (const chunk of chunks.values()) {
    if (Math.max(Math.abs(chunk.cx - currentChunkX), Math.abs(chunk.cz - currentChunkZ)) > RENDER_RADIUS) continue;
    const available = MAX_INSTANCES - count;
    if (available <= 0) break;
    const buildingCount = Math.min(available, chunk.data.length / STRIDE_FLOATS);
    const floatCount = buildingCount * STRIDE_FLOATS;
    instanceScratch.set(chunk.data.subarray(0, floatCount), count * STRIDE_FLOATS);
    count += buildingCount;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceScratch, 0, count * STRIDE_FLOATS);
  instanceCount = count;
  dirtyInstances = false;
}

function setPerspective(aspect) {
  const near = 0.08;
  const far = 900;
  const f = 1 / Math.tan((72 * Math.PI / 180) / 2);
  projection.fill(0);
  projection[0] = f / aspect;
  projection[5] = f;
  projection[10] = (far + near) / (near - far);
  projection[11] = -1;
  projection[14] = (2 * far * near) / (near - far);
}

function updateView() {
  const cp = Math.cos(player.pitch);
  const fx = Math.sin(player.yaw) * cp;
  const fy = Math.sin(player.pitch);
  const fz = -Math.cos(player.yaw) * cp;

  // Camera backward axis.
  const z0 = -fx;
  const z1 = -fy;
  const z2 = -fz;
  // right = normalize(cross(worldUp, backward))
  const xLen = Math.hypot(z2, z0) || 1;
  const x0 = z2 / xLen;
  const x1 = 0;
  const x2 = -z0 / xLen;
  // up = cross(backward, right)
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  view[0] = x0; view[1] = y0; view[2] = z0; view[3] = 0;
  view[4] = x1; view[5] = y1; view[6] = z1; view[7] = 0;
  view[8] = x2; view[9] = y2; view[10] = z2; view[11] = 0;
  view[12] = -(x0 * player.x + x1 * player.y + x2 * player.z);
  view[13] = -(y0 * player.x + y1 * player.y + y2 * player.z);
  view[14] = -(z0 * player.x + z1 * player.y + z2 * player.z);
  view[15] = 1;
}

function resize() {
  const cssWidth = Math.max(1, canvas.clientWidth | 0);
  const cssHeight = Math.max(1, canvas.clientHeight | 0);
  const deviceDpr = Math.max(1, window.devicePixelRatio || 1);
  const budgetDpr = Math.sqrt(PIXEL_BUDGET / (cssWidth * cssHeight));
  effectiveDpr = Math.max(0.55, Math.min(deviceDpr, DPR_CAP, budgetDpr) * resolutionScale);
  const width = Math.max(1, Math.floor(cssWidth * effectiveDpr));
  const height = Math.max(1, Math.floor(cssHeight * effectiveDpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
  setPerspective(width / height);
  resizePending = false;
}

function chunkKey(cx, cz) {
  // Allocation-free signed integer pairing for hot collision lookups.
  const x = cx >= 0 ? cx * 2 : -cx * 2 - 1;
  const z = cz >= 0 ? cz * 2 : -cz * 2 - 1;
  const sum = x + z;
  return sum * (sum + 1) * 0.5 + z;
}

function queueWorldAround(cx, cz) {
  if (!worker) return;

  worker.postMessage({ type: "focus", cx, cz, keepRadius: KEEP_RADIUS });
  const coords = [];
  for (let r = 0; r <= GENERATE_RADIUS; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const qx = cx + dx;
        const qz = cz + dz;
        const key = chunkKey(qx, qz);
        if (requested.has(key)) continue;
        requested.set(key, [qx, qz]);
        coords.push([qx, qz]);
      }
    }
  }
  if (coords.length) worker.postMessage({ type: "request", coords });

  for (const [key, pair] of requested) {
    if (Math.max(Math.abs(pair[0] - cx), Math.abs(pair[1] - cz)) > KEEP_RADIUS) requested.delete(key);
  }
  for (const [key, chunk] of chunks) {
    if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > KEEP_RADIUS) {
      chunks.delete(key);
      requested.delete(key);
      dirtyInstances = true;
    }
  }
}

function startWorker() {
  if (workerStarted) return;
  workerStarted = true;
  worker = new Worker("./world-worker.js");
  worker.postMessage({ type: "init", seed: WORLD_SEED });
  worker.onmessage = ({ data }) => {
    if (!data || data.type !== "chunk" || !(data.data instanceof Float32Array)) return;
    if (Math.max(Math.abs(data.cx - currentChunkX), Math.abs(data.cz - currentChunkZ)) > KEEP_RADIUS) {
      requested.delete(chunkKey(data.cx, data.cz));
      return;
    }
    chunks.set(chunkKey(data.cx, data.cz), { cx: data.cx, cz: data.cz, data: data.data });
    dirtyInstances = true;
  };
  worker.onerror = (event) => {
    console.error("World worker failed", event.error || event.message);
  };
  queueWorldAround(currentChunkX, currentChunkZ);
}

function blocked(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const chunk = chunks.get(chunkKey(cx + dx, cz + dz));
      if (!chunk) continue;
      const data = chunk.data;
      for (let i = 0; i < data.length; i += STRIDE_FLOATS) {
        const halfW = data[i + 3] * 0.5 + PLAYER_RADIUS;
        const halfD = data[i + 5] * 0.5 + PLAYER_RADIUS;
        if (Math.abs(x - data[i]) < halfW && Math.abs(z - data[i + 2]) < halfD) return true;
      }
    }
  }
  return false;
}

function updatePlayer(dt) {
  let forward = keys[87] - keys[83]; // W - S
  let right = keys[68] - keys[65];   // D - A
  if (forward === 0 && right === 0) return;
  startWorker();

  const length = Math.hypot(forward, right) || 1;
  forward /= length;
  right /= length;
  const speed = (keys[16] ? 14.5 : 8.2) * dt;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const dx = (sin * forward + cos * right) * speed;
  const dz = (-cos * forward + sin * right) * speed;

  const nextX = player.x + dx;
  if (!blocked(nextX, player.z)) player.x = nextX;
  const nextZ = player.z + dz;
  if (!blocked(player.x, nextZ)) player.z = nextZ;

  const cx = Math.floor(player.x / CHUNK_SIZE);
  const cz = Math.floor(player.z / CHUNK_SIZE);
  if (cx !== currentChunkX || cz !== currentChunkZ) {
    currentChunkX = cx;
    currentChunkZ = cz;
    dirtyInstances = true;
    queueWorldAround(cx, cz);
  }
}

function adaptResolution(now) {
  if (now - lastScaleCheck < 1800 || frameNumber < 90 || document.hidden) return;
  lastScaleCheck = now;

  if (frameMsEma > 19.2 && resolutionScale > 0.56) {
    resolutionScale = Math.max(0.55, resolutionScale * 0.88);
    fastScaleVotes = 0;
    resizePending = true;
  } else if (frameMsEma < 17.2 && resolutionScale < 0.995) {
    fastScaleVotes++;
    if (fastScaleVotes >= 2) {
      resolutionScale = Math.min(1, resolutionScale * 1.07);
      fastScaleVotes = 0;
      resizePending = true;
    }
  } else {
    fastScaleVotes = 0;
  }
}

function updateHud(now) {
  if (now - lastHud < 250) return;
  lastHud = now;
  const fps = Math.min(999, 1000 / Math.max(1, frameMsEma));
  statusEl.textContent =
    `FPS ${fps.toFixed(0)}  DPR ${effectiveDpr.toFixed(2)}\n` +
    `DRAW 1  INST ${instanceCount}  CHUNKS ${Math.min(chunks.size, TARGET_CHUNKS)}/${TARGET_CHUNKS}\n` +
    `BOOT ${firstFrameMs.toFixed(0)}ms  WORLD ${workerStarted ? (chunks.size >= TARGET_CHUNKS ? "READY" : "STREAM") : "IDLE"}\n` +
    `SEED ${WORLD_SEED}  compare with ?seed=${WORLD_SEED}`;
}

function draw(now) {
  if (resizePending) resize();
  if (dirtyInstances) rebuildInstances();
  updateView();

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(buildingProgram);
  gl.uniformMatrix4fv(uProjection, false, projection);
  gl.uniformMatrix4fv(uView, false, view);
  gl.uniform3f(uCamera, player.x, player.y, player.z);
  gl.bindVertexArray(vao);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, instanceCount);

  if (firstFrameMs === 0) firstFrameMs = now;
}

function frame(now) {
  const dtMs = lastFrame === 0 ? 16.67 : Math.min(50, Math.max(1, now - lastFrame));
  lastFrame = now;
  frameNumber++;

  if (!document.hidden) {
    frameMsEma += (dtMs - frameMsEma) * 0.055;
    updatePlayer(dtMs / 1000);
    draw(now);
    adaptResolution(now);
    updateHud(now);
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("click", () => {
  startWorker();
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});

document.addEventListener("pointerlockchange", () => {
  document.body.classList.toggle("locked", document.pointerLockElement === canvas);
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw += event.movementX * 0.00215;
  player.pitch -= event.movementY * 0.00215;
  player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch));
});

document.addEventListener("keydown", (event) => {
  if (event.keyCode >= 0 && event.keyCode < keys.length) keys[event.keyCode] = 1;
  if (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD") startWorker();
});
document.addEventListener("keyup", (event) => {
  if (event.keyCode >= 0 && event.keyCode < keys.length) keys[event.keyCode] = 0;
});

window.addEventListener("blur", () => keys.fill(0));
window.addEventListener("resize", () => { resizePending = true; }, { passive: true });
document.addEventListener("visibilitychange", () => {
  lastFrame = performance.now();
  keys.fill(0);
  if (worker) worker.postMessage({ type: "pause", value: document.hidden });
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  statusEl.textContent = "WEBGL CONTEXT LOST";
}, false);
canvas.addEventListener("webglcontextrestored", () => location.reload(), false);

// Paint and controls first. World generation starts on interaction or the first idle slice.
if ("requestIdleCallback" in window) {
  requestIdleCallback(startWorker, { timeout: 800 });
} else {
  setTimeout(startWorker, 250);
}

writeGround();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceScratch, 0, STRIDE_FLOATS);
resize();
statusEl.textContent = `BOOT ${(performance.now() - bootStart).toFixed(1)}ms`;
requestAnimationFrame(frame);
