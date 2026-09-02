const MINIMUM_ONE_CELL = 1;

function isCirculationRole(space) {
  return space?.role === 'circulation' || space?.role === 'entry';
}

function minimumFor(space, minimumCellsByKey) {
  const raw = minimumCellsByKey instanceof Map
    ? minimumCellsByKey.get(space?.key)
    : minimumCellsByKey?.[space?.key];
  return Math.max(MINIMUM_ONE_CELL, Math.floor(Number(raw) || MINIMUM_ONE_CELL));
}

export function minimumEligibleCellsReservedForRemaining({
  currentSpace,
  remainingSpaces = [],
  grid,
  minimumCellsByKey,
} = {}) {
  const later = remainingSpaces.filter(Boolean);
  if (!later.length) return 0;

  const laterTotal = later.reduce((sum, space) => sum + minimumFor(space, minimumCellsByKey), 0);
  if (isCirculationRole(currentSpace)) return laterTotal;

  const laterOrdinary = later
    .filter(space => !isCirculationRole(space))
    .reduce((sum, space) => sum + minimumFor(space, minimumCellsByKey), 0);
  const laterCirculation = laterTotal - laterOrdinary;
  const unassignedReserved = (grid?.cells ?? [])
    .filter(cell => !cell?.spaceId && cell?.structuralReservationId)
    .length;

  return laterOrdinary + Math.max(0, laterCirculation - unassignedReserved);
}

function humanScaleDropRank(role) {
  if (role === 'shared') return 0;
  if (role === 'storage') return 1;
  if (role === 'service') return 2;
  if (role === 'private' || role === 'program' || role === 'work') return 3;
  if (role === 'public') return 4;
  return 10;
}

export function chooseHumanScaleProgramDrop({
  spaces = [],
  shortfalls = [],
  protectedKeys = [],
} = {}) {
  const protectedSet = new Set(protectedKeys.filter(Boolean).map(String));
  const shortfallKeys = new Set(shortfalls.map(item => String(item?.key ?? item)).filter(Boolean));
  const countsByTemplate = new Map();
  for (const space of spaces) {
    countsByTemplate.set(space.templateKey, (countsByTemplate.get(space.templateKey) ?? 0) + 1);
  }
  const droppable = space => !protectedSet.has(String(space.key)) && !isCirculationRole(space);
  const tiers = [
    spaces.filter(space => droppable(space)
      && (countsByTemplate.get(space.templateKey) ?? 0) > Math.max(1, Number(space.repeat?.min) || 1)),
    spaces.filter(space => droppable(space)
      && (countsByTemplate.get(space.templateKey) ?? 0) > 1),
    spaces.filter(space => droppable(space) && shortfallKeys.has(String(space.key))),
    spaces.filter(droppable),
  ];
  const candidates = tiers.find(items => items.length) ?? [];
  candidates.sort((a, b) => {
    const aShort = shortfallKeys.has(String(a.key)) ? 0 : 1;
    const bShort = shortfallKeys.has(String(b.key)) ? 0 : 1;
    if (aShort !== bShort) return aShort - bShort;
    const aEcho = String(a.source).includes('echo') ? 0 : 1;
    const bEcho = String(b.source).includes('echo') ? 0 : 1;
    if (aEcho !== bEcho) return aEcho - bEcho;
    const role = humanScaleDropRank(a.role) - humanScaleDropRank(b.role);
    if (role) return role;
    return Number(a.areaWeight || 0) - Number(b.areaWeight || 0)
      || String(a.key).localeCompare(String(b.key));
  });
  return candidates[0] ?? null;
}

export { isCirculationRole };

export function claimUnassignedRasterToEligibleSpaces({
  cells = [],
  spaces = [],
  neighborsOfCell,
  cellEligibleForSpace,
  preferenceScoreForSpace = () => 0,
} = {}) {
  if (typeof neighborsOfCell !== 'function') throw new Error('raster closure requires neighborsOfCell');
  if (typeof cellEligibleForSpace !== 'function') throw new Error('raster closure requires cellEligibleForSpace');

  const spaceByKey = new Map(spaces.map(space => [space.key, space]));
  const circulation = spaces.find(space => space.role === 'circulation')
    ?? spaces.find(space => space.role === 'entry')
    ?? null;

  // Reservation substrate is semantic circulation, not dead raster. Claim it
  // before the ordinary flood so a stair/apron band can bridge cells on the
  // far side instead of permanently isolating them.
  let structuralClaims = 0;
  if (circulation) {
    for (const cell of cells) {
      if (cell.spaceId || !cell.structuralReservationId) continue;
      if (!cellEligibleForSpace(cell, circulation)) continue;
      cell.spaceId = circulation.key;
      structuralClaims++;
    }
  }

  let floodClaims = 0;
  let passes = 0;
  while (passes++ < cells.length + 4) {
    let progress = 0;
    for (const cell of cells) {
      if (cell.spaceId) continue;
      const candidateKeys = [...new Set(
        neighborsOfCell(cell)
          .map(neighbor => neighbor?.spaceId)
          .filter(Boolean),
      )];
      const candidates = candidateKeys
        .map(key => spaceByKey.get(key))
        .filter(space => space && cellEligibleForSpace(cell, space));
      if (!candidates.length) continue;
      candidates.sort((a, b) => Number(preferenceScoreForSpace(cell, b) || 0)
        - Number(preferenceScoreForSpace(cell, a) || 0)
        || String(a.key).localeCompare(String(b.key)));
      cell.spaceId = candidates[0].key;
      floodClaims++;
      progress++;
    }
    if (!progress) break;
  }

  const unclaimed = cells.filter(cell => !cell.spaceId);
  return {
    structuralClaims,
    floodClaims,
    passes,
    unclaimed,
    unclaimedCount: unclaimed.length,
  };
}
