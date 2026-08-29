"use strict";

const CHUNK_SIZE = 96;
const LOTS = 6;
const LOT_SIZE = CHUNK_SIZE / LOTS;
const queue = [];
const queued = new Set();
let focusX = 0;
let focusZ = 0;
let paused = false;
let pumping = false;

function hash32(x, z) {
  let h = Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3) ^ 0x9e3779b9;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function generateChunk(cx, cz) {
  const random = rng(hash32(cx, cz));
  const rows = [];
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let z = 0; z < LOTS; z++) {
    for (let x = 0; x < LOTS; x++) {
      if (random() < 0.08) continue;

      const centerX = baseX + (x + 0.5) * LOT_SIZE;
      const centerZ = baseZ + (z + 0.5) * LOT_SIZE;

      // Keep a generous origin cross open so the first seconds are never blocked.
      if (Math.abs(centerX) < 13 || Math.abs(centerZ) < 13) continue;

      const width = 8.2 + random() * 4.6;
      const depth = 8.2 + random() * 4.6;
      const tower = random();
      const height = 6 + tower * tower * 78 + random() * 8;
      const jitterX = (random() - 0.5) * 1.8;
      const jitterZ = (random() - 0.5) * 1.8;
      const tint = random();

      rows.push(centerX + jitterX, 0, centerZ + jitterZ, width, height, depth, tint);
    }
  }

  return new Float32Array(rows);
}

function sortQueue() {
  queue.sort((a, b) => {
    const adx = a[0] - focusX;
    const adz = a[1] - focusZ;
    const bdx = b[0] - focusX;
    const bdz = b[1] - focusZ;
    return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
  });
}

function pump() {
  if (paused || pumping || queue.length === 0) return;
  pumping = true;

  const [cx, cz] = queue.shift();
  const key = `${cx},${cz}`;
  queued.delete(key);
  const data = generateChunk(cx, cz);
  postMessage({ type: "chunk", cx, cz, data }, [data.buffer]);

  pumping = false;
  if (!paused && queue.length) setTimeout(pump, 0);
}

onmessage = ({ data }) => {
  if (!data || typeof data.type !== "string") return;

  if (data.type === "pause") {
    paused = !!data.value;
    if (!paused) pump();
    return;
  }

  if (data.type === "focus") {
    focusX = data.cx | 0;
    focusZ = data.cz | 0;
    const maxDistance = Math.max(2, data.keepRadius | 0);
    for (let i = queue.length - 1; i >= 0; i--) {
      const [qx, qz] = queue[i];
      if (Math.max(Math.abs(qx - focusX), Math.abs(qz - focusZ)) > maxDistance) {
        queued.delete(`${qx},${qz}`);
        queue.splice(i, 1);
      }
    }
    sortQueue();
    pump();
    return;
  }

  if (data.type === "request" && Array.isArray(data.coords)) {
    for (const pair of data.coords) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const cx = pair[0] | 0;
      const cz = pair[1] | 0;
      const key = `${cx},${cz}`;
      if (queued.has(key)) continue;
      queued.add(key);
      queue.push([cx, cz]);
    }
    sortQueue();
    pump();
  }
};
