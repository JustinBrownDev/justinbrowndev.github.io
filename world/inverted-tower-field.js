export const INVERTED_TOWER_FIELD_SCHEMA = 'jweb.inverted-tower-field.v1';
export const VERTICAL_MASSING_FRAME_SCHEMA = 'jweb.vertical-massing-frame.v1';
export const INVERTED_TOWER_VERTICAL_POLARITY = -1;
export const INVERTED_TOWER_DEFAULT_CEILING_Y = 92;
export const INVERTED_TOWER_MIN_TIP_Y = 24;

function hashString32(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(value).length; i++) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function siteBounds(site, { chunkCenterX, chunkCenterZ, chunkSize, microCells }) {
  const cellSize = chunkSize / microCells;
  const chunkX0 = chunkCenterX - chunkSize * 0.5;
  const chunkZ0 = chunkCenterZ - chunkSize * 0.5;
  let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
  for (const cell of site.cells ?? []) {
    minCol = Math.min(minCol, cell.col); maxCol = Math.max(maxCol, cell.col);
    minRow = Math.min(minRow, cell.row); maxRow = Math.max(maxRow, cell.row);
  }
  if (!Number.isFinite(minCol)) return null;
  const x0 = chunkX0 + minCol * cellSize;
  const x1 = chunkX0 + (maxCol + 1) * cellSize;
  const z0 = chunkZ0 + minRow * cellSize;
  const z1 = chunkZ0 + (maxRow + 1) * cellSize;
  return { cx: (x0 + x1) * 0.5, cz: (z0 + z1) * 0.5, width: x1 - x0, depth: z1 - z0, cellSize };
}

export function planInvertedTowerField({
  worldSeed = 0,
  chunkKey = '0,0',
  chunkCenterX = 0,
  chunkCenterZ = 0,
  chunkSize = 64,
  microCells = 9,
  sites = [],
  weirdness = 0,
  ceilingY = INVERTED_TOWER_DEFAULT_CEILING_Y,
} = {}) {
  if (!(Number(chunkSize) > 0) || !Number.isInteger(microCells) || microCells <= 0) {
    throw new Error('planInvertedTowerField requires positive chunkSize and microCells');
  }
  const eligible = sites
    .filter(site => Array.isArray(site?.cells) && site.cells.length >= 4)
    .map(site => ({ site, bounds: siteBounds(site, { chunkCenterX, chunkCenterZ, chunkSize, microCells }) }))
    .filter(item => item.bounds)
    .sort((a, b) => b.site.cells.length - a.site.cells.length || Number(a.site.id ?? 0) - Number(b.site.id ?? 0));
  if (!eligible.length) return Object.freeze({ schema: INVERTED_TOWER_FIELD_SCHEMA, verticalPolarity: -1, ceilingY, towers: Object.freeze([]), masses: Object.freeze([]), instanceCount: 0 });

  const rng = mulberry32(hashString32(`${worldSeed}:inverted-tower-field:${chunkKey}`));
  const w = clamp(Number(weirdness) || 0, 0, 1);
  // One macro tower is the baseline. Weird outer districts may support a second,
  // but the first-paint cost stays bounded at three boxes per tower.
  const towerCount = Math.min(eligible.length, 1 + (w > 0.58 && rng() > 0.45 ? 1 : 0));
  const masses = [];
  const towers = [];
  for (let index = 0; index < towerCount; index++) {
    const candidate = eligible[(index + Math.floor(rng() * eligible.length)) % eligible.length];
    const { site, bounds } = candidate;
    const mirrorX = chunkCenterX * 2 - bounds.cx;
    const mirrorZ = chunkCenterZ * 2 - bounds.cz;
    const topWidth = Math.max(bounds.cellSize * 1.8, bounds.width * 0.88);
    const topDepth = Math.max(bounds.cellSize * 1.8, bounds.depth * 0.88);
    const requestedHeight = clamp(34 + site.cells.length * 0.72 + rng() * 15 + w * 10, 38, 66);
    const localCeilingY = ceilingY + (rng() - 0.5) * 8;
    const height = Math.min(requestedHeight, localCeilingY - INVERTED_TOWER_MIN_TIP_Y);
    const tierFractions = [0.42, 0.34, 0.24];
    const footprintScales = [1, 0.72, 0.46];
    let descended = 0;
    const towerMasses = [];
    const towerId = `${chunkKey}:inverted:${site.id ?? index}`;
    const sourceCells = Object.freeze((site.cells ?? [])
      .map(cell => Object.freeze({ col: Number(cell.col), row: Number(cell.row) }))
      .sort((a, b) => a.row - b.row || a.col - b.col));
    const sourceSignature = sourceCells.map(cell => `${cell.col},${cell.row}`).join('|');
    const verticalFrame = Object.freeze({
      schema: VERTICAL_MASSING_FRAME_SCHEMA,
      id: `${towerId}:vertical-frame`,
      anchorY: localCeilingY,
      verticalPolarity: INVERTED_TOWER_VERTICAL_POLARITY,
      localZeroRole: 'ceiling-anchor',
      positiveLocalYDirection: 'down',
    });
    for (let tier = 0; tier < tierFractions.length; tier++) {
      const sy = height * tierFractions[tier];
      const y = localCeilingY - descended - sy * 0.5;
      descended += sy;
      const scale = footprintScales[tier];
      const mass = Object.freeze({
        x: mirrorX,
        y,
        z: mirrorZ,
        sx: topWidth * scale,
        sy,
        sz: topDepth * scale,
        kind: 'inverted-tower-mass',
        towerId,
        sourceSiteId: site.id ?? null,
        verticalPolarity: INVERTED_TOWER_VERTICAL_POLARITY,
        verticalAnchorY: localCeilingY,
        verticalFrameId: verticalFrame.id,
        massTier: tier,
        structuralAuthority: 'kowloon-compound',
      });
      masses.push(mass);
      towerMasses.push(mass);
    }
    towers.push(Object.freeze({
      id: towerId,
      sourceSiteId: site.id ?? null,
      sourceSiteCellCount: sourceCells.length,
      sourceSignature,
      sourceCells,
      verticalPolarity: INVERTED_TOWER_VERTICAL_POLARITY,
      verticalFrame,
      anchorY: localCeilingY,
      tipY: localCeilingY - height,
      localHeight: height,
      footprint: Object.freeze({ x: mirrorX, z: mirrorZ, width: topWidth, depth: topDepth }),
      masses: Object.freeze(towerMasses),
    }));
  }
  return Object.freeze({
    schema: INVERTED_TOWER_FIELD_SCHEMA,
    verticalPolarity: INVERTED_TOWER_VERTICAL_POLARITY,
    ceilingY,
    towers: Object.freeze(towers),
    masses: Object.freeze(masses),
    instanceCount: masses.length,
  });
}
