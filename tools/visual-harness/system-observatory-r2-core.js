// JWEB System Observatory R2
// Audit-aware, many-chunk, code-and-runtime diagnostic views.
// Pure data + SVG/HTML: no DOM, WebGL, or browser dependency.

import {
  analyzeChunkPayload,
  buildSweepAnalysis,
  countBy,
  renderAttentionLedgerSvg,
  renderBuildingStacksSvg,
  renderSystemStorySvg,
} from './system-observatory-core.js';

export const JWEB_SYSTEM_OBSERVATORY_R2_SCHEMA = 'jweb.system-observatory.v2';

export const AUDIT_LENSES = Object.freeze([
  Object.freeze({ id: 'F01', severity: 'P0', short: 'transfer realizability', title: 'Tower-transfer demand is not realizable by the Building Plan', files: ['world/architecture/tower-transfer-authority.js', 'world/architecture/building-plan-authority.js', 'world/sectional-circulation.js', 'world/city-route-composer.js', 'world/circulation-graph.js'] }),
  Object.freeze({ id: 'F02', severity: 'P1', short: 'vertical macro-shape', title: 'Ground and hanging fields read as separated slabs rather than an interlocked section', files: ['world/hanging-city-topology.js', 'kowloon-fabric-engine.js', 'world/sectional-circulation.js'] }),
  Object.freeze({ id: 'F03', severity: 'P1', short: 'void hierarchy', title: 'Figure-ground is too occupied or lacks large negative-space hierarchy', files: ['world/hanging-city-topology.js', 'world/district-block-composition.js', 'world/architecture/building-plan-authority.js'] }),
  Object.freeze({ id: 'F04', severity: 'P1', short: 'bridge family conflict', title: 'Hanging ownership overlays a suspension grammar onto a non-suspension bridge family', files: ['world/skybridge-architecture.js', 'world/sectional-circulation.js'] }),
  Object.freeze({ id: 'F05', severity: 'P1', short: 'bridge grammar stack', title: 'Multiple large structural grammars accumulate on one bridge span', files: ['world/skybridge-architecture.js', 'world/exterior-transport-network.js', 'world/city-route-composer.js'] }),
  Object.freeze({ id: 'F06', severity: 'P2', short: 'stair repetition', title: 'Compound stair topology repeats too uniformly across buildings/stories', files: ['world/interior-stair-core.js', 'world/stair-volume-contract.js', 'world/architecture/building-plan-authority.js'] }),
  Object.freeze({ id: 'F07', severity: 'P2', short: 'stair detail hierarchy', title: 'Tread/guard frequency can dominate the larger circulation read', files: ['world/stair-visual-treads.js', 'world/guardrail-authority.js', 'world/interior-stair-core.js'] }),
]);

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const arr = value => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value)));
const pct = value => `${(finite(value) * 100).toFixed(1)}%`;

function quantile(values, q = 0.5) {
  const sorted = arr(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(at), hi = Math.ceil(at), t = at - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function moduleCell(module, entity) {
  const key = String(module?.key ?? '');
  const match = key.match(/^(-?\d+),(-?\d+)$/);
  if (match) return { col: Number(match[1]), row: Number(match[2]), key };
  const source = entity?.primaryCell;
  if (Number.isFinite(Number(source?.col)) && Number.isFinite(Number(source?.row))) {
    return { col: Number(source.col), row: Number(source.row), key: `${source.col},${source.row}` };
  }
  return null;
}

function entityModules(entities, layer, ceilingY) {
  const out = [];
  for (const entity of arr(entities)) {
    const floorH = Math.max(0.1, finite(entity?.floorH, 3.15));
    const modules = arr(entity?.footprintModules).length ? entity.footprintModules : [entity];
    for (const module of modules) {
      const cell = moduleCell(module, entity);
      if (!cell) continue;
      const floorBase = Math.max(0, finite(module?.floorBase, 0));
      const floors = Math.max(1, finite(module?.floors, entity?.floors ?? 1));
      let y0, y1;
      if (layer === 'hanging') {
        y1 = Number.isFinite(Number(module?.roofY)) ? Number(module.roofY) : ceilingY;
        y0 = Number.isFinite(Number(module?.baseY)) ? Number(module.baseY) : y1 - floors * floorH;
      } else {
        y0 = Number.isFinite(Number(module?.baseY)) ? Number(module.baseY) : finite(entity?.baseY, 0) + floorBase * floorH;
        y1 = Number.isFinite(Number(module?.roofY)) ? Number(module.roofY) : y0 + floors * floorH;
      }
      out.push({ ...cell, layer, entityId: entity?.id ?? null, floorH, floors, floorBase, y0, y1 });
    }
  }
  return out;
}

function combineCellRanges(modules) {
  const map = new Map();
  for (const item of modules) {
    const row = map.get(item.key) ?? { key: item.key, col: item.col, row: item.row, y0: Infinity, y1: -Infinity, count: 0 };
    row.y0 = Math.min(row.y0, item.y0);
    row.y1 = Math.max(row.y1, item.y1);
    row.count++;
    map.set(item.key, row);
  }
  return map;
}

function analyzeMacroForm(payload) {
  const ceilingY = finite(payload?.hangingCity?.frame?.anchorY ?? payload?.hangingLayer?.frame?.anchorY, 34.02);
  const groundModules = entityModules(payload?.entities, 'ground', ceilingY);
  const hangingEntities = payload?.hangingLayer?.payload?.entities ?? [];
  const hangingModules = entityModules(hangingEntities, 'hanging', ceilingY);
  const ground = combineCellRanges(groundModules);
  const hanging = combineCellRanges(hangingModules);
  const keys = new Set([...ground.keys(), ...hanging.keys()]);
  const shared = [...ground.keys()].filter(key => hanging.has(key));
  const interlocks = [];
  const gaps = [];
  for (const key of shared) {
    const g = ground.get(key), h = hanging.get(key);
    const gap = h.y0 - g.y1;
    gaps.push(gap);
    if (gap <= 0.20) interlocks.push({ key, gap, groundTop: g.y1, hangingBottom: h.y0 });
  }
  const gridCells = 81;
  const bins = 18;
  const vertical = [];
  for (let i = 0; i < bins; i++) {
    const y0 = ceilingY * i / bins, y1 = ceilingY * (i + 1) / bins;
    const groundCells = new Set(groundModules.filter(m => m.y1 > y0 && m.y0 < y1).map(m => m.key));
    const hangingCells = new Set(hangingModules.filter(m => m.y1 > y0 && m.y0 < y1).map(m => m.key));
    vertical.push({ y0, y1, groundCells: groundCells.size, hangingCells: hangingCells.size, eitherCells: new Set([...groundCells, ...hangingCells]).size });
  }
  const groundTops = [...ground.values()].map(item => item.y1);
  const hangingBottoms = [...hanging.values()].map(item => item.y0);
  const medianGap = gaps.length ? quantile(gaps, 0.5) : null;
  return {
    ceilingY,
    gridCells,
    groundModules: groundModules.length,
    hangingModules: hangingModules.length,
    groundCells: ground.size,
    hangingCells: hanging.size,
    unionCells: keys.size,
    sharedCells: shared.length,
    emptyCells: Math.max(0, gridCells - keys.size),
    groundOccupancy: ground.size / gridCells,
    hangingOccupancy: hanging.size / gridCells,
    unionOccupancy: keys.size / gridCells,
    sharedOccupancy: shared.length / gridCells,
    interlockCells: interlocks.length,
    interlockShareOfShared: shared.length ? interlocks.length / shared.length : 0,
    medianSharedVerticalGap: medianGap,
    groundTopMedian: quantile(groundTops, 0.5),
    groundTopP90: quantile(groundTops, 0.9),
    hangingBottomMedian: quantile(hangingBottoms, 0.5),
    hangingBottomP10: quantile(hangingBottoms, 0.1),
    ground: [...ground.values()],
    hanging: [...hanging.values()],
    interlocks,
    vertical,
  };
}

function bridgeRowsFromPayload(payload) {
  const ground = arr(payload?.physics?.bridgeArchitecture).map(item => ({ ...item, layer: 'ground' }));
  const hanging = arr(payload?.hangingLayer?.payload?.physics?.bridgeArchitecture).map(item => ({ ...item, layer: 'hanging' }));
  return [...ground, ...hanging].map(item => {
    const variantSystem = finite(item?.variantParts, 0) > 0;
    const supportSystem = finite(item?.supportParts, 0) > 0;
    const familySystem = String(item?.family ?? 'simple-guarded') !== 'simple-guarded';
    const grammarLayers = 1 + Number(variantSystem) + Number(supportSystem);
    const suspensionOverlayConflict = item?.bridgeVariant === 'hanging-bridge'
      && item?.structuralGrammar === 'suspended-catenary-v1'
      && item?.family !== 'suspension-hanger';
    return {
      id: item?.bridgeId ?? null,
      layer: item.layer,
      family: item?.family ?? '(none)',
      widthClass: item?.widthClass ?? '(none)',
      bridgeVariant: item?.bridgeVariant ?? '(none)',
      structuralGrammar: item?.structuralGrammar ?? '(none)',
      supportMode: item?.supportMode ?? null,
      parts: finite(item?.parts, 0),
      supportParts: finite(item?.supportParts, 0),
      variantParts: finite(item?.variantParts, 0),
      span: finite(item?.span, 0),
      width: finite(item?.width, 0),
      grammarLayers,
      suspensionOverlayConflict,
      stackedLargeSystems: grammarLayers >= 3,
    };
  });
}

function analyzeBridgeGrammar(payload) {
  const rows = bridgeRowsFromPayload(payload);
  return {
    count: rows.length,
    families: countBy(rows, 'family'),
    variants: countBy(rows, 'bridgeVariant'),
    grammars: countBy(rows, 'structuralGrammar'),
    layers: countBy(rows, 'layer'),
    suspensionOverlayConflicts: rows.filter(row => row.suspensionOverlayConflict).length,
    stackedLargeSystems: rows.filter(row => row.stackedLargeSystems).length,
    maxGrammarLayers: rows.length ? Math.max(...rows.map(row => row.grammarLayers)) : 0,
    rows,
  };
}

function stairRowsFromPayload(payload) {
  const ownership = [
    ...arr(payload?.physics?.stairOwnership).map(item => ({ ...item, layer: 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.stairOwnership).map(item => ({ ...item, layer: 'hanging' })),
  ];
  const expressions = [
    ...arr(payload?.physics?.stairArchitectureExpressions).map(item => ({ ...item, layer: 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.stairArchitectureExpressions).map(item => ({ ...item, layer: 'hanging' })),
  ];
  return { ownership, expressions };
}

function analyzeStairRhythm(payload) {
  const { ownership, expressions } = stairRowsFromPayload(payload);
  const thoroughfareOwners = ownership.filter(item => item?.routeClass === 'thoroughfare');
  const thoroughfareWidths = thoroughfareOwners.map(item => finite(item?.clearWidth, 0)).filter(value => value > 0);
  const thoroughfareStories = thoroughfareOwners.reduce((sum, item) => sum + Math.max(0, finite(item?.floors, 0)), 0);
  const explicitTopology = ownership.filter(item => item?.stairTopology != null && String(item.stairTopology).length);
  const missingTopologyMetadata = ownership.length - explicitTopology.length;
  const topologyCounts = countBy(explicitTopology, item => item?.stairTopology);
  const sortedTopologies = Object.entries(topologyCounts).sort((a, b) => b[1] - a[1]);
  const dominantTopology = sortedTopologies[0]?.[0] ?? null;
  const dominantCount = sortedTopologies[0]?.[1] ?? 0;
  const explicitTopologyVariant = ownership.filter(item => item?.stairTopologyVariant != null && String(item.stairTopologyVariant).length);
  const topologyVariantCounts = countBy(explicitTopologyVariant, item => item?.stairTopologyVariant);
  const sortedTopologyVariants = Object.entries(topologyVariantCounts).sort((a, b) => b[1] - a[1]);
  const dominantTopologyVariant = sortedTopologyVariants[0]?.[0] ?? null;
  const dominantTopologyVariantCount = sortedTopologyVariants[0]?.[1] ?? 0;
  const floors = ownership.map(item => Math.max(0, finite(item?.floors, 0))).filter(Boolean);
  const ownedStories = floors.reduce((sum, value) => sum + value, 0);
  const guards = [
    ...arr(payload?.physics?.guardSpans).map(item => ({ ...item, layer: 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.guardSpans).map(item => ({ ...item, layer: 'hanging' })),
  ].filter(item => item?.stairOwnerId);
  const guardPrimitiveCount = guards.reduce((sum, item) => sum + Math.max(0, finite(item?.visualPrimitiveCount, 0)), 0);
  const guardSpansPerOwnedStory = ownedStories ? guards.length / ownedStories : 0;
  const guardPrimitivesPerOwnedStory = ownedStories ? guardPrimitiveCount / ownedStories : 0;
  const compoundOwnersWithoutTopology = ownership.filter(item => !item?.stairTopology && /compound-stair/i.test(String(item?.id ?? ''))).length;
  return {
    count: ownership.length,
    explicitTopologyCount: explicitTopology.length,
    missingTopologyMetadata,
    compoundOwnersWithoutTopology,
    topologyCounts,
    topologyVariantCounts,
    layerCounts: countBy(ownership, 'layer'),
    dominantTopology,
    dominantTopologyShare: explicitTopology.length ? dominantCount / explicitTopology.length : 0,
    explicitTopologyVariantCount: explicitTopologyVariant.length,
    dominantTopologyVariant,
    dominantTopologyVariantShare: explicitTopologyVariant.length ? dominantTopologyVariantCount / explicitTopologyVariant.length : 0,
    handednessCounts: countBy(ownership.filter(item => item?.returnHandedness), item => item?.returnHandedness),
    floorMedian: quantile(floors, 0.5),
    floorP90: quantile(floors, 0.9),
    floorCounts: countBy(ownership, item => String(Math.max(0, finite(item?.floors, 0)))),
    ownedStories,
    stairGuardSpans: guards.length,
    stairGuardPrimitiveCount: guardPrimitiveCount,
    guardSpansPerOwnedStory,
    guardPrimitivesPerOwnedStory,
    thoroughfareCount: thoroughfareOwners.length,
    thoroughfareStories,
    thoroughfareWidthMedian: quantile(thoroughfareWidths, 0.5),
    thoroughfareWidthMax: thoroughfareWidths.length ? Math.max(...thoroughfareWidths) : 0,
    thoroughfareDistrictRoutes: countBy(thoroughfareOwners, item => item?.districtRouteId ?? '(none)'),
    architectureExpressionCount: expressions.length,
    architectureFamilies: countBy(expressions, item => item?.family ?? '(none)'),
    expressionCoverage: ownership.length ? Math.min(1, expressions.length / ownership.length) : 0,
    ownership: ownership.map(item => ({ id: item?.id ?? null, layer: item.layer, topology: item?.stairTopology ?? '(metadata missing)', topologyVariant: item?.stairTopologyVariant ?? null, returnHandedness: item?.returnHandedness ?? null, stairAxis: item?.stairAxis ?? null, floors: finite(item?.floors, 0), buildingPlanId: item?.buildingPlanId ?? null, routeClass: item?.routeClass ?? 'local', clearWidth: finite(item?.clearWidth, 0), districtRouteId: item?.districtRouteId ?? null })),
    expressions: expressions.map(item => ({ id: item?.id ?? null, layer: item.layer, family: item?.family ?? '(none)', programArchitectureId: item?.programArchitectureId ?? null, parts: finite(item?.parts, 0) })),
  };
}

function analyzeTransfers(payload) {
  const demands = [
    ...arr(payload?.physics?.circulationDemands).map(item => ({ ...item, layer: item?.field ?? 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.circulationDemands).map(item => ({ ...item, layer: item?.field ?? 'hanging' })),
  ];
  return {
    demands: demands.length,
    vertical: demands.filter(item => item?.requiresVerticalTransfer).length,
    facadeChange: demands.filter(item => item?.requiresFacadeChange).length,
    routeCharacters: countBy(demands, item => item?.routeCharacter ?? '(none)'),
    fields: countBy(demands, item => item?.field ?? item?.layer ?? '(none)'),
    rows: demands.slice(0, 24).map(item => ({ id: item?.id ?? null, field: item?.field ?? null, fromBand: item?.fromBand ?? null, toBand: item?.toBand ?? null, requiresVerticalTransfer: Boolean(item?.requiresVerticalTransfer), requiresFacadeChange: Boolean(item?.requiresFacadeChange), routeCharacter: item?.routeCharacter ?? null })),
  };
}

function analyzeShellAuthority(payload) {
  const rows = [
    ...arr(payload?.physics?.structuralShellClosures).map(item => ({ ...item, layer: 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.structuralShellClosures).map(item => ({ ...item, layer: 'hanging' })),
  ];
  const claims = [
    ...arr(payload?.physics?.structuralSurfaceClaims).map(item => ({ ...item, layer: 'ground' })),
    ...arr(payload?.hangingLayer?.payload?.physics?.structuralSurfaceClaims).map(item => ({ ...item, layer: 'hanging' })),
  ];
  return {
    closures: rows.length,
    claims: claims.length,
    closureKinds: countBy(rows, item => item?.kind ?? item?.architectureRole ?? item?.role ?? '(none)'),
    claimKinds: countBy(claims, item => item?.kind ?? item?.architectureRole ?? item?.role ?? '(none)'),
    layers: countBy(rows, 'layer'),
  };
}

function lensEvidence(summary) {
  const macro = summary.macro, bridge = summary.bridgeGrammar, stair = summary.stairRhythm;
  const stairExpressionCount = stair.explicitTopologyVariantCount >= 3 ? stair.explicitTopologyVariantCount : stair.explicitTopologyCount;
  const stairExpression = stair.explicitTopologyVariantCount >= 3 ? stair.dominantTopologyVariant : stair.dominantTopology;
  const stairExpressionShare = stair.explicitTopologyVariantCount >= 3 ? stair.dominantTopologyVariantShare : stair.dominantTopologyShare;
  return {
    F01: { value: summary.transfers.demands, compact: `${summary.transfers.demands} demands`, label: `${summary.transfers.demands} transfer demands`, level: summary.buildFailure?.code === 'JWEB_TOWER_TRANSFER_UNREALIZED' ? 3 : 0 },
    F02: { value: macro.interlockShareOfShared, compact: `${pct(macro.interlockShareOfShared)} interlock`, label: `${macro.interlockCells}/${macro.sharedCells} shared plan cells vertically interlock`, level: macro.sharedCells && macro.interlockShareOfShared < 0.25 ? 2 : macro.sharedCells && macro.interlockShareOfShared < 0.55 ? 1 : 0 },
    F03: { value: macro.unionOccupancy, compact: `${pct(macro.unionOccupancy)} occupied`, label: `${pct(macro.unionOccupancy)} module union occupancy`, level: macro.unionOccupancy >= 0.78 ? 2 : macro.unionOccupancy >= 0.65 ? 1 : 0 },
    F04: { value: bridge.suspensionOverlayConflicts, compact: `${bridge.suspensionOverlayConflicts} conflicts`, label: `${bridge.suspensionOverlayConflicts} non-suspension families carrying suspension grammar`, level: bridge.suspensionOverlayConflicts ? 2 : 0 },
    F05: { value: bridge.stackedLargeSystems, compact: `${bridge.stackedLargeSystems} triple`, label: `${bridge.stackedLargeSystems} bridges with 3 large grammar layers`, level: bridge.stackedLargeSystems ? 2 : 0 },
    F06: { value: stairExpressionShare, compact: `${pct(stairExpressionShare)} dominant`, label: `${pct(stairExpressionShare)} of ${stairExpressionCount} physical stair expressions use ${stairExpression ?? 'no topology expression'}`, level: stairExpressionCount >= 3 && stairExpressionShare >= 0.90 ? 1 : 0 },
    F07: { value: stair.guardPrimitivesPerOwnedStory, compact: `${stair.guardPrimitivesPerOwnedStory.toFixed(1)} guard prim/story`, label: `${stair.stairGuardPrimitiveCount} stair guard primitives across ${stair.ownedStories} owned stories (${stair.guardPrimitivesPerOwnedStory.toFixed(1)}/story; heuristic visual-frequency signal)`, level: stair.ownedStories >= 4 && stair.guardPrimitivesPerOwnedStory >= 18 ? 1 : 0 },
  };
}

export function analyzeChunkPayloadR2(payload, chunk = {}) {
  const base = analyzeChunkPayload(payload, chunk);
  const summary = {
    ...base,
    schema: JWEB_SYSTEM_OBSERVATORY_R2_SCHEMA,
    macro: analyzeMacroForm(payload),
    bridgeGrammar: analyzeBridgeGrammar(payload),
    stairRhythm: analyzeStairRhythm(payload),
    transfers: analyzeTransfers(payload),
    shellAuthority: analyzeShellAuthority(payload),
  };
  summary.auditLenses = lensEvidence(summary);
  return summary;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) target[key] = (target[key] ?? 0) + finite(value, 0);
  return target;
}

export function classifyBuildFailure(error, chunk = {}) {
  const message = String(error?.stack ?? error?.message ?? error ?? 'unknown build failure');
  const code = String(error?.code ?? (message.match(/JWEB_[A-Z0-9_]+/)?.[0] ?? 'BUILD_FAILURE'));
  return {
    chunkKey: String(chunk?.key ?? ''), x: finite(chunk?.x, 0), z: finite(chunk?.z, 0), code,
    lens: code === 'JWEB_TOWER_TRANSFER_UNREALIZED' ? 'F01' : null,
    message: String(error?.message ?? message.split('\n')[0] ?? code),
    stack: message,
    ...(error?.transferDiagnostic ? { transferDiagnostic: error.transferDiagnostic } : {}),
  };
}

export function buildSweepAnalysisR2(chunks, failures = []) {
  const base = buildSweepAnalysis(chunks);
  const list = arr(chunks);
  const bridgeFamilies = {}, bridgeGrammars = {}, stairTopologies = {}, stairTopologyVariants = {}, stairHandedness = {}, stairFamilies = {}, runtimeCounts = {};
  for (const item of list) {
    mergeCounts(bridgeFamilies, item.bridgeGrammar?.families);
    mergeCounts(bridgeGrammars, item.bridgeGrammar?.grammars);
    mergeCounts(stairTopologies, item.stairRhythm?.topologyCounts);
    mergeCounts(stairTopologyVariants, item.stairRhythm?.topologyVariantCounts);
    mergeCounts(stairHandedness, item.stairRhythm?.handednessCounts);
    mergeCounts(stairFamilies, item.stairRhythm?.architectureFamilies);
    mergeCounts(runtimeCounts, item.counts);
  }
  const lensTotals = {};
  for (const lens of AUDIT_LENSES) lensTotals[lens.id] = { chunksFlagged: 0, levelSum: 0 };
  for (const item of list) for (const [id, row] of Object.entries(item.auditLenses ?? {})) {
    if (!lensTotals[id]) continue;
    if (row.level > 0) lensTotals[id].chunksFlagged++;
    lensTotals[id].levelSum += row.level;
  }
  for (const failure of failures) if (failure?.lens && lensTotals[failure.lens]) {
    lensTotals[failure.lens].chunksFlagged++;
    lensTotals[failure.lens].levelSum += 3;
  }
  const macroValues = list.map(item => item.macro);
  return {
    ...base,
    schema: 'jweb.system-observatory-sweep.v2',
    failures: arr(failures),
    auditLenses: AUDIT_LENSES,
    lensTotals,
    macro: {
      unionOccupancyMedian: quantile(macroValues.map(v => v.unionOccupancy), 0.5),
      unionOccupancyP90: quantile(macroValues.map(v => v.unionOccupancy), 0.9),
      interlockShareMedian: quantile(macroValues.filter(v => v.sharedCells).map(v => v.interlockShareOfShared), 0.5),
      medianSharedGapMedian: quantile(macroValues.map(v => v.medianSharedVerticalGap).filter(Number.isFinite), 0.5),
      emptyCellsMedian: quantile(macroValues.map(v => v.emptyCells), 0.5),
    },
    bridgeGrammar: {
      total: list.reduce((sum, item) => sum + item.bridgeGrammar.count, 0),
      families: bridgeFamilies,
      grammars: bridgeGrammars,
      suspensionOverlayConflicts: list.reduce((sum, item) => sum + item.bridgeGrammar.suspensionOverlayConflicts, 0),
      stackedLargeSystems: list.reduce((sum, item) => sum + item.bridgeGrammar.stackedLargeSystems, 0),
    },
    stairRhythm: {
      total: list.reduce((sum, item) => sum + item.stairRhythm.count, 0),
      explicitTopologyCount: list.reduce((sum, item) => sum + item.stairRhythm.explicitTopologyCount, 0),
      missingTopologyMetadata: list.reduce((sum, item) => sum + item.stairRhythm.missingTopologyMetadata, 0),
      compoundOwnersWithoutTopology: list.reduce((sum, item) => sum + item.stairRhythm.compoundOwnersWithoutTopology, 0),
      topologies: stairTopologies,
      topologyVariants: stairTopologyVariants,
      handedness: stairHandedness,
      architectureFamilies: stairFamilies,
      expressionCount: list.reduce((sum, item) => sum + item.stairRhythm.architectureExpressionCount, 0),
      ownedStories: list.reduce((sum, item) => sum + item.stairRhythm.ownedStories, 0),
      stairGuardSpans: list.reduce((sum, item) => sum + item.stairRhythm.stairGuardSpans, 0),
      stairGuardPrimitiveCount: list.reduce((sum, item) => sum + item.stairRhythm.stairGuardPrimitiveCount, 0),
      guardPrimitivesPerOwnedStory: list.reduce((sum, item) => sum + item.stairRhythm.ownedStories, 0) ? list.reduce((sum, item) => sum + item.stairRhythm.stairGuardPrimitiveCount, 0) / list.reduce((sum, item) => sum + item.stairRhythm.ownedStories, 0) : 0,
      thoroughfareCount: list.reduce((sum, item) => sum + finite(item.stairRhythm?.thoroughfareCount, 0), 0),
      thoroughfareStories: list.reduce((sum, item) => sum + finite(item.stairRhythm?.thoroughfareStories, 0), 0),
      thoroughfareWidthMedian: quantile(list.flatMap(item => arr(item.stairRhythm?.ownership).filter(owner => owner?.routeClass === 'thoroughfare').map(owner => finite(owner?.clearWidth, 0)).filter(value => value > 0)), 0.5),
      thoroughfareWidthMax: Math.max(0, ...list.flatMap(item => arr(item.stairRhythm?.ownership).filter(owner => owner?.routeClass === 'thoroughfare').map(owner => finite(owner?.clearWidth, 0)).filter(value => value > 0))),
    },
    runtimeCounts,
    transferDemandTotal: list.reduce((sum, item) => sum + finite(item.transfers?.demands, 0), 0),
    transferFailures: arr(failures).filter(item => item?.code === 'JWEB_TOWER_TRANSFER_UNREALIZED').length,
  };
}

function svgStart(width, height, title, subtitle = '') {
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#080b10"/>`,
    `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#eef2fb}.muted{fill:#8d98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:14px;font-weight:700}.title{font-size:24px;font-weight:800}.p0{fill:#ff5b78}.p1{fill:#ffbf5f}.p2{fill:#89b9ff}.ok{fill:#59dfa3}</style>`,
    `<text x="34" y="38" class="title">${esc(title)}</text>`,
    subtitle ? `<text x="34" y="61" class="small muted">${esc(subtitle)}</text>` : ''];
}

function rectForCell(col, row, x, y, cell, fill, stroke = '#263244', opacity = 1) {
  return `<rect x="${x + col * cell}" y="${y + row * cell}" width="${cell - 1}" height="${cell - 1}" rx="2" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`;
}

export function renderMacroAnatomySvg(summary, { width = 1500, height = 760 } = {}) {
  const m = summary.macro;
  const parts = svgStart(width, height, `Chunk ${summary.chunk.key} — macro anatomy`, 'Generator-module figure ground + actual vertical module extents. This is the code\'s own spatial abstraction, not a mesh screenshot.');
  const cell = 32, gridY = 122;
  const grids = [
    { x: 55, title: 'GROUND MODULES', rows: m.ground, fill: '#52df9b' },
    { x: 390, title: 'HANGING MODULES', rows: m.hanging, fill: '#63b5ff' },
    { x: 725, title: 'COMBINED / INTERLOCK', rows: null, fill: '#fff' },
  ];
  const gMap = new Map(m.ground.map(r => [r.key, r])), hMap = new Map(m.hanging.map(r => [r.key, r]));
  for (const grid of grids) {
    parts.push(`<text x="${grid.x}" y="102" class="med">${grid.title}</text>`);
    for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) parts.push(rectForCell(col, row, grid.x, gridY, cell, '#0d121b', '#1c2534'));
    if (grid.rows) {
      for (const r of grid.rows) if (r.col >= 0 && r.col < 9 && r.row >= 0 && r.row < 9) parts.push(rectForCell(r.col, r.row, grid.x, gridY, cell, grid.fill, '#dbe7f8', 0.78));
    } else {
      for (const key of new Set([...gMap.keys(), ...hMap.keys()])) {
        const [col, row] = key.split(',').map(Number); if (!(col >= 0 && col < 9 && row >= 0 && row < 9)) continue;
        const g = gMap.get(key), h = hMap.get(key);
        const fill = g && h ? (g.y1 >= h.y0 - 0.2 ? '#ff5b78' : '#d58bff') : g ? '#52df9b' : '#63b5ff';
        parts.push(rectForCell(col, row, grid.x, gridY, cell, fill, '#dbe7f8', 0.86));
      }
    }
  }
  parts.push(`<text x="725" y="435" class="tiny muted">red = vertical interlock in same plan cell; purple = shared plan cell but separated vertically</text>`);

  const plotX = 1065, plotY = 104, plotW = 380, plotH = 445;
  parts.push(`<text x="${plotX}" y="102" class="med">VERTICAL OCCUPANCY</text>`, `<rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="#0d121b" stroke="#2a3548"/>`);
  const yScale = y => plotY + plotH - clamp(y / Math.max(1, m.ceilingY), 0, 1) * plotH;
  for (let i = 0; i <= 6; i++) {
    const yy = m.ceilingY * i / 6, py = yScale(yy);
    parts.push(`<line x1="${plotX}" y1="${py}" x2="${plotX + plotW}" y2="${py}" stroke="#1f2938"/>`, `<text x="${plotX + 4}" y="${py - 4}" class="tiny muted">${yy.toFixed(1)}m</text>`);
  }
  const binW = plotW / m.vertical.length;
  m.vertical.forEach((bin, i) => {
    const x = plotX + i * binW;
    const gh = (bin.groundCells / 81) * 165, hh = (bin.hangingCells / 81) * 165;
    const centerY = yScale((bin.y0 + bin.y1) * 0.5);
    parts.push(`<rect x="${x}" y="${centerY - gh}" width="${Math.max(2, binW - 1)}" height="${gh}" fill="#52df9b" opacity="0.70"/>`, `<rect x="${x}" y="${centerY}" width="${Math.max(2, binW - 1)}" height="${hh}" fill="#63b5ff" opacity="0.70"/>`);
  });
  parts.push(`<line x1="${plotX}" y1="${yScale(m.ceilingY)}" x2="${plotX + plotW}" y2="${yScale(m.ceilingY)}" stroke="#ffffff" stroke-width="2" opacity="0.65"/>`);
  const metricsY = 590;
  const rows = [
    `ground occupied cells ${m.groundCells}/81 (${pct(m.groundOccupancy)})`,
    `hanging occupied cells ${m.hangingCells}/81 (${pct(m.hangingOccupancy)})`,
    `combined occupied cells ${m.unionCells}/81 (${pct(m.unionOccupancy)}); empty ${m.emptyCells}`,
    `shared plan cells ${m.sharedCells}; vertical interlock ${m.interlockCells} (${pct(m.interlockShareOfShared)})`,
    `median ground top ${m.groundTopMedian?.toFixed(2) ?? 'n/a'}m; median hanging bottom ${m.hangingBottomMedian?.toFixed(2) ?? 'n/a'}m`,
    `median vertical gap on shared cells ${m.medianSharedVerticalGap?.toFixed(2) ?? 'n/a'}m`,
  ];
  rows.forEach((text, i) => parts.push(`<text x="55" y="${metricsY + i * 23}" class="small ${i >= 3 && m.sharedCells && m.interlockShareOfShared < .25 ? 'p1' : ''}">${esc(text)}</text>`));
  parts.push('</svg>'); return parts.join('\n');
}

export function renderBridgeGrammarSvg(summary, { width = 1500 } = {}) {
  const rows = summary.bridgeGrammar.rows;
  const rowH = 34, height = 145 + Math.max(1, rows.length) * rowH;
  const parts = svgStart(width, height, `Chunk ${summary.chunk.key} — bridge grammar`, 'Each row is one emitted bridge-architecture record. Red means a suspension grammar is overlaid on a non-suspension family.');
  const headers = [['layer',40],['family',125],['variant',305],['structural grammar',485],['support',720],['parts',875],['grammar layers',965],['interpretation',1115]];
  headers.forEach(([text,x]) => parts.push(`<text x="${x}" y="95" class="tiny muted">${text}</text>`));
  rows.forEach((r, i) => {
    const y = 122 + i * rowH;
    const bad = r.suspensionOverlayConflict, stacked = r.stackedLargeSystems;
    parts.push(`<rect x="30" y="${y - 20}" width="1440" height="29" rx="5" fill="${bad ? '#371018' : stacked ? '#32220c' : '#101722'}" stroke="${bad ? '#ff5b78' : stacked ? '#ffbf5f' : '#29364a'}"/>`);
    const values = [[r.layer,40],[r.family,125],[r.bridgeVariant,305],[r.structuralGrammar,485],[r.supportMode ?? '—',720],[`${r.parts}/${r.variantParts}/${r.supportParts}`,875],[String(r.grammarLayers),1005],[bad ? 'F04 family/grammar conflict' : stacked ? 'F05 triple structural stack' : 'single/double grammar',1115]];
    values.forEach(([text,x], j) => parts.push(`<text x="${x}" y="${y}" class="small ${j === 7 && bad ? 'p0' : j === 7 && stacked ? 'p1' : ''}">${esc(text)}</text>`));
  });
  if (!rows.length) parts.push(`<text x="40" y="130" class="small muted">No bridge architecture records in this chunk.</text>`);
  parts.push('</svg>'); return parts.join('\n');
}

export function renderStairRhythmSvg(summary, { width = 1500, height = 620 } = {}) {
  const s = summary.stairRhythm;
  const parts = svgStart(width, height, `Chunk ${summary.chunk.key} — stair rhythm`, 'One column per exact stair ownership record. This view intentionally suppresses treads/rails so the repeated architectural cell is visible.');
  const maxFloors = Math.max(1, ...s.ownership.map(r => r.floors));
  const left = 60, baseY = 470, availableW = 920, colW = Math.max(25, Math.min(75, availableW / Math.max(1, s.ownership.length)));
  s.ownership.forEach((r, i) => {
    const x = left + i * colW, h = (r.floors / maxFloors) * 300;
    const fill = r.layer === 'hanging' ? '#63b5ff' : '#52df9b';
    parts.push(`<rect x="${x}" y="${baseY - h}" width="${Math.max(16, colW - 8)}" height="${h}" fill="${fill}" opacity="0.72" stroke="#dfe8f5"/>`, `<text transform="translate(${x + 8},${baseY + 12}) rotate(55)" class="tiny muted">${esc(r.topology.replace('two-flight-', '2F-'))}</text>`, `<text x="${x + 3}" y="${baseY - h - 7}" class="tiny">${r.floors}F</text>`);
  });
  parts.push(`<text x="1035" y="130" class="med">SYSTEM SUMMARY</text>`);
  const summaryRows = [
    `stair ownership records: ${s.count} (${s.explicitTopologyCount} topology-tagged; ${s.missingTopologyMetadata} missing)`,
    `dominant explicit topology: ${s.dominantTopology ?? 'none'}`,
    `dominant physical expression: ${s.dominantTopologyVariant ?? s.dominantTopology ?? 'none'} (${pct(s.explicitTopologyVariantCount >= 3 ? s.dominantTopologyVariantShare : s.dominantTopologyShare)})`,
    `return handedness: ${Object.entries(s.handednessCounts ?? {}).map(([k,v]) => `${k}×${v}`).join(', ') || 'unpublished'}`,
    `compound owners missing topology metadata: ${s.compoundOwnersWithoutTopology}`,
    `stair guard detail: ${s.stairGuardPrimitiveCount} primitives / ${s.ownedStories} stories = ${s.guardPrimitivesPerOwnedStory.toFixed(1)}/story`,
    `architecture expressions: ${s.architectureExpressionCount}; families: ${Object.entries(s.architectureFamilies).map(([k,v]) => `${k}×${v}`).join(', ') || 'none'}`,
  ];
  summaryRows.forEach((text, i) => parts.push(`<text x="1035" y="${165 + i * 28}" class="small ${i === 2 && s.count >= 3 && (s.explicitTopologyVariantCount >= 3 ? s.dominantTopologyVariantShare : s.dominantTopologyShare) >= .9 ? 'p1' : ''}">${esc(text)}</text>`));
  parts.push(`<text x="60" y="545" class="small muted">Same-height color means only ground/hanging field. The point is to expose repeated topology, not imply each stair should differ arbitrarily.</text>`, '</svg>');
  return parts.join('\n');
}

export function renderAuditLensSvg(summary, { width = 1500, height = 500 } = {}) {
  const parts = svgStart(width, height, `Chunk ${summary.chunk.key} — audit lenses`, 'These cells translate the R2D audit vocabulary into live runtime evidence. They are triage cues, not automatic bug verdicts.');
  AUDIT_LENSES.forEach((lens, i) => {
    const row = summary.auditLenses[lens.id];
    const x = 35 + (i % 4) * 360, y = 95 + Math.floor(i / 4) * 180;
    const level = row?.level ?? 0;
    const stroke = level >= 3 ? '#ff5b78' : level >= 2 ? '#ff9d5b' : level === 1 ? '#ffcf6b' : '#39506a';
    const fill = level >= 3 ? '#321018' : level >= 2 ? '#2c1a0e' : level === 1 ? '#28220f' : '#101722';
    parts.push(`<rect x="${x}" y="${y}" width="335" height="145" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${level ? 2 : 1}"/>`, `<text x="${x+15}" y="${y+28}" class="med">${lens.id} · ${esc(lens.short)}</text>`, `<text x="${x+15}" y="${y+52}" class="tiny muted">${esc(lens.severity)} · runtime lens</text>`);
    const words = String(row?.label ?? '').match(/.{1,48}(?:\s|$)/g) ?? [];
    words.slice(0,3).forEach((line,j) => parts.push(`<text x="${x+15}" y="${y+82+j*18}" class="small ${level >= 2 ? 'p1' : ''}">${esc(line.trim())}</text>`));
  });
  parts.push('</svg>'); return parts.join('\n');
}

export function renderMacroFieldSvg(sweep, { width = 1650, cellW = 250, cellH = 220 } = {}) {
  const list = arr(sweep?.chunks); const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(list.length))));
  const rows = Math.ceil(list.length / cols); const height = 105 + rows * cellH + 30;
  const parts = svgStart(width, height, 'Many-chunk macro field', 'Each card is the same 0→ceiling section: green grows up from ground, blue grows down from the hanging datum. Occupancy and interlock come from generator modules.');
  list.forEach((s, i) => {
    const col = i % cols, row = Math.floor(i / cols), x = 28 + col * cellW, y = 88 + row * cellH;
    const m = s.macro, plotX = x + 16, plotY = y + 48, plotW = 80, plotH = 125;
    const gTop = finite(m.groundTopMedian, 0), hBottom = finite(m.hangingBottomMedian, m.ceilingY);
    const sy = yy => plotY + plotH - clamp(yy / Math.max(1,m.ceilingY),0,1)*plotH;
    const inter = m.sharedCells ? m.interlockShareOfShared : 0;
    const border = inter < .25 ? '#ffbf5f' : '#3c5169';
    parts.push(`<rect x="${x}" y="${y}" width="${cellW-14}" height="${cellH-16}" rx="9" fill="#0e141e" stroke="${border}"/>`, `<text x="${x+14}" y="${y+25}" class="med">${esc(s.chunk.key)}</text>`, `<rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="#080b10" stroke="#263347"/>`, `<rect x="${plotX+8}" y="${sy(gTop)}" width="${plotW-16}" height="${plotY+plotH-sy(gTop)}" fill="#52df9b" opacity=".72"/>`, `<rect x="${plotX+8}" y="${plotY}" width="${plotW-16}" height="${sy(hBottom)-plotY}" fill="#63b5ff" opacity=".72"/>`, `<line x1="${plotX}" y1="${plotY}" x2="${plotX+plotW}" y2="${plotY}" stroke="#fff" opacity=".5"/>`);
    const tx = x + 112;
    parts.push(`<text x="${tx}" y="${y+58}" class="small">union ${pct(m.unionOccupancy)}</text>`, `<text x="${tx}" y="${y+82}" class="small">shared ${m.sharedCells}/81</text>`, `<text x="${tx}" y="${y+106}" class="small ${inter < .25 && m.sharedCells ? 'p1':''}">interlock ${pct(inter)}</text>`, `<text x="${tx}" y="${y+130}" class="small">bridges ${s.bridgeGrammar.count}</text>`, `<text x="${tx}" y="${y+154}" class="small ${s.bridgeGrammar.suspensionOverlayConflicts ? 'p1':''}">F04 ${s.bridgeGrammar.suspensionOverlayConflicts}</text>`, `<text x="${tx}" y="${y+178}" class="small">stairs ${s.stairRhythm.count}</text>`);
  });
  parts.push('</svg>'); return parts.join('\n');
}


export function renderModuleAtlasSvg(sweep, { width = 1600 } = {}) {
  const chunks = arr(sweep?.chunks);
  const cols = 6, cardW = 250, cardH = 182, cell = 11;
  const height = 92 + Math.ceil(Math.max(1, chunks.length) / cols) * cardH;
  const parts = svgStart(width, height, 'Many-chunk module figure-ground atlas', 'Every mini-plan is the generator’s own 9×9 module footprint. Green=ground only, blue=hanging only, purple=same plan cell but vertically separated, red=actual vertical interlock.');
  chunks.forEach((summary, i) => {
    const col = i % cols, row = Math.floor(i / cols), x = 24 + col * cardW, y = 78 + row * cardH;
    const g = new Map(arr(summary.macro?.ground).map(v => [v.key, v]));
    const h = new Map(arr(summary.macro?.hanging).map(v => [v.key, v]));
    parts.push(`<rect x="${x}" y="${y}" width="${cardW-12}" height="${cardH-12}" rx="8" fill="#0d131c" stroke="#354257"/>`, `<text x="${x+10}" y="${y+20}" class="med">${esc(summary.chunk.key)}</text>`);
    const gx=x+10, gy=y+32;
    for(let rr=0;rr<9;rr++) for(let cc=0;cc<9;cc++) parts.push(rectForCell(cc,rr,gx,gy,cell,'#111925','#1d2938'));
    for(const key of new Set([...g.keys(),...h.keys()])){
      const [cc,rr]=key.split(',').map(Number); if(!(cc>=0&&cc<9&&rr>=0&&rr<9)) continue;
      const gv=g.get(key), hv=h.get(key); const inter=gv&&hv&&gv.y1>=hv.y0-0.2;
      const fill=gv&&hv?(inter?'#ff5b78':'#b768e5'):gv?'#52df9b':'#63b5ff';
      parts.push(rectForCell(cc,rr,gx,gy,cell,fill,'#d5dfef',0.9));
    }
    const tx=x+118;
    parts.push(`<text x="${tx}" y="${y+48}" class="small">union ${pct(summary.macro?.unionOccupancy)}</text>`, `<text x="${tx}" y="${y+69}" class="small">shared ${summary.macro?.sharedCells ?? 0}/81</text>`, `<text x="${tx}" y="${y+90}" class="small ${summary.macro?.sharedCells && summary.macro?.interlockShareOfShared < .25 ? 'p1':''}">interlock ${pct(summary.macro?.interlockShareOfShared)}</text>`, `<text x="${tx}" y="${y+111}" class="tiny muted">median gap</text>`, `<text x="${tx}" y="${y+129}" class="small">${finite(summary.macro?.medianSharedVerticalGap,0).toFixed(1)}m</text>`);
  });
  parts.push('</svg>'); return parts.join('\n');
}

export function renderStairContractMatrixSvg(sweep, { width = 1500 } = {}) {
  const chunks=arr(sweep?.chunks), rowH=29, height=130+chunks.length*rowH;
  const parts=svgStart(width,height,'Stair contract matrix across chunks','This separates topology sameness from metadata completeness and rail/detail frequency. The missing-topology column is a contract observation, not an inferred stair type.');
  const headers=[['chunk',36],['owners',235],['physical expression',345],['missing topology',555],['dominant expression',755],['guard primitives / story',1110]];
  headers.forEach(([t,x])=>parts.push(`<text x="${x}" y="100" class="tiny muted">${t}</text>`));
  chunks.forEach((s,i)=>{const y=116+i*rowH, st=s.stairRhythm; const missing=st.missingTopologyMetadata??0; const gp=finite(st.guardPrimitivesPerOwnedStory,0); const expressionCount=st.explicitTopologyVariantCount>=3?st.explicitTopologyVariantCount:st.explicitTopologyCount; const expressionShare=st.explicitTopologyVariantCount>=3?st.dominantTopologyVariantShare:st.dominantTopologyShare; const expression=st.explicitTopologyVariantCount>=3?st.dominantTopologyVariant:st.dominantTopology; parts.push(`<text x="36" y="${y+18}" class="small">${esc(s.chunk.key)}</text>`,`<text x="235" y="${y+18}" class="small">${st.count}</text>`,`<text x="345" y="${y+18}" class="small ${expressionCount>=3&&expressionShare>=.9?'p1':''}">${expressionCount} · ${pct(expressionShare)}</text>`,`<rect x="545" y="${y+3}" width="175" height="21" rx="4" fill="${missing?'#3a2445':'#111925'}" stroke="#354257"/>`,`<text x="555" y="${y+18}" class="small ${missing?'p2':''}">${missing} (${st.compoundOwnersWithoutTopology??0} compound)</text>`,`<text x="755" y="${y+18}" class="small">${esc(expression??'none')}</text>`,`<text x="1110" y="${y+18}" class="small ${gp>=18?'p1':''}">${gp.toFixed(1)}</text>`);});
  parts.push('</svg>'); return parts.join('\n');
}

export function renderRuntimePipelineSvg(sweep, { width = 1600, height = 720 } = {}) {
  const c=sweep?.runtimeCounts??{};
  const parts=svgStart(width,height,'Runtime authority pipeline — general picture','Actual record counts emitted across this sweep. Arrows indicate adjacent responsibility layers, not a claim of one-to-one causal edges.');
  const stages=[
    {x:45,title:'MASS / PROGRAM',nodes:[['ground entities',c.groundEntities],['hanging buildings',c.hangingBuildings],['semantic spaces',c.spaces],['surface records',c.surfaces]]},
    {x:430,title:'CIRCULATION CONTRACT',nodes:[['transfer demands',sweep.transferDemandTotal],['connectors',c.connectors],['portals',c.portals],['reservations',c.reservations]]},
    {x:815,title:'WORLD / TRANSPORT',nodes:[['world nodes',c.worldNodes],['world edges',c.worldEdges],['transport surfaces',c.transportSurfaces],['transport edges',c.transportEdges]]},
    {x:1200,title:'ARCHITECTURAL EXPRESSION',nodes:[['bridge architecture',sweep.bridgeGrammar?.total],['stair owners',sweep.stairRhythm?.total],['stair expressions',sweep.stairRhythm?.expressionCount],['stair guard primitives',sweep.stairRhythm?.stairGuardPrimitiveCount]]},
  ];
  for(let i=0;i<stages.length-1;i++) parts.push(`<line x1="${stages[i].x+300}" y1="345" x2="${stages[i+1].x-35}" y2="345" stroke="#506783" stroke-width="3" marker-end="url(#arrow)"/>`);
  parts.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#506783"/></marker></defs>`);
  stages.forEach(stage=>{parts.push(`<text x="${stage.x}" y="115" class="med">${stage.title}</text>`); stage.nodes.forEach(([label,value],i)=>{const y=145+i*94; parts.push(`<rect x="${stage.x}" y="${y}" width="300" height="72" rx="9" fill="#101722" stroke="#354b67"/>`,`<text x="${stage.x+15}" y="${y+25}" class="small muted">${esc(label)}</text>`,`<text x="${stage.x+15}" y="${y+55}" class="title">${Math.round(finite(value,0)).toLocaleString()}</text>`);});});
  parts.push(`<text x="45" y="650" class="small p0">hard failures ${sweep.transferFailures??0}</text>`,`<text x="250" y="650" class="small p1">unbound portal apertures ${sweep.totals?.unboundPortalApertures??0}</text>`,`<text x="535" y="650" class="small p1">orphan reservations ${sweep.totals?.orphanReservations??0}</text>`,`<text x="790" y="650" class="small p1">hard connectivity failures ${sweep.totals?.hardConnectivityFailures??0}</text>`,`<text x="1110" y="650" class="small p1">bridge grammar conflicts ${sweep.bridgeGrammar?.suspensionOverlayConflicts??0}</text>`);
  parts.push('</svg>'); return parts.join('\n');
}


export function buildTriageTargets(sweep, limit = 8) {
  const chunks=arr(sweep?.chunks), failures=arr(sweep?.failures);
  const top=(rows,score,reason)=>[...rows].sort((a,b)=>score(b)-score(a)).slice(0,limit).map(item=>({chunkKey:item.chunk.key,x:item.chunk.x,z:item.chunk.z,score:score(item),reason:reason(item)}));
  return {
    F01: failures.filter(f=>f.code==='JWEB_TOWER_TRANSFER_UNREALIZED').slice(0,limit).map(f=>({chunkKey:f.chunkKey,x:f.x,z:f.z,score:3,reason:'hard transfer build failure'})),
    F02: top(chunks,s=>(s.auditLenses?.F02?.level??0)*1e6+(s.macro?.sharedCells??0)*1e3+finite(s.macro?.medianSharedVerticalGap,0),s=>`${s.macro.sharedCells} shared cells · ${finite(s.macro.medianSharedVerticalGap,0).toFixed(1)}m median gap`),
    F03: top(chunks,s=>finite(s.macro?.unionOccupancy,0),s=>`${pct(s.macro.unionOccupancy)} module occupancy`),
    F04: top(chunks,s=>finite(s.bridgeGrammar?.suspensionOverlayConflicts,0),s=>`${s.bridgeGrammar.suspensionOverlayConflicts} family/grammar conflicts`),
    F05: top(chunks,s=>finite(s.bridgeGrammar?.stackedLargeSystems,0),s=>`${s.bridgeGrammar.stackedLargeSystems} triple grammar stacks`),
    F06: top(chunks,s=>{const st=s.stairRhythm??{}; const count=finite(st.explicitTopologyVariantCount,0)>=3?finite(st.explicitTopologyVariantCount,0):finite(st.explicitTopologyCount,0); const share=finite(st.explicitTopologyVariantCount,0)>=3?finite(st.dominantTopologyVariantShare,0):finite(st.dominantTopologyShare,0); return count*share;},s=>{const st=s.stairRhythm??{}; const useVariant=finite(st.explicitTopologyVariantCount,0)>=3; const count=useVariant?st.explicitTopologyVariantCount:st.explicitTopologyCount; const share=useVariant?st.dominantTopologyVariantShare:st.dominantTopologyShare; const expression=useVariant?st.dominantTopologyVariant:st.dominantTopology; return `${count} expressions · ${pct(share)} ${expression??'dominant'}`;}),
    F07: top(chunks,s=>finite(s.stairRhythm?.guardPrimitivesPerOwnedStory,0),s=>`${finite(s.stairRhythm.guardPrimitivesPerOwnedStory,0).toFixed(1)} guard primitives/story`),
  };
}

export function renderTriageTargetDeckSvg(sweep, { width = 1600 } = {}) {
  const targets=sweep?.triageTargets??buildTriageTargets(sweep); const rowH=128, height=100+AUDIT_LENSES.length*rowH;
  const parts=svgStart(width,height,'Triage target deck — where to inspect next','Top live chunks per audit lens. These coordinates are designed to feed directly into the exact geometry/screenshot harness after the broad observatory finds a pattern.');
  AUDIT_LENSES.forEach((lens,li)=>{const y=82+li*rowH; parts.push(`<text x="28" y="${y+24}" class="med">${lens.id}</text>`,`<text x="72" y="${y+24}" class="small">${esc(lens.short)}</text>`); const rows=arr(targets[lens.id]); rows.forEach((t,i)=>{const x=270+i*160; parts.push(`<rect x="${x}" y="${y}" width="150" height="86" rx="7" fill="${lens.id==='F01'?'#301019':'#111925'}" stroke="${lens.id==='F01'?'#ff5b78':'#3d526d'}"/>`,`<text x="${x+10}" y="${y+24}" class="med">${esc(t.chunkKey)}</text>`); const words=String(t.reason??'').match(/.{1,24}(?:\s|$)/g)??[]; words.slice(0,2).forEach((w,wi)=>parts.push(`<text x="${x+10}" y="${y+48+wi*17}" class="tiny muted">${esc(w.trim())}</text>`));});});
  parts.push('</svg>'); return parts.join('\n');
}

export function renderAuditLensMatrixSvg(sweep, { width = 1500 } = {}) {
  const chunks = arr(sweep?.chunks), failures = arr(sweep?.failures); const rowH = 32, height = 155 + (chunks.length + failures.length) * rowH;
  const parts = svgStart(width, height, 'Audit-lens matrix across chunks', 'A compact answer to “where does each known class of problem show up?” Dark means no signal from this lens; brighter cells need inspection.');
  const x0 = 240, colW = 150;
  AUDIT_LENSES.forEach((lens, i) => parts.push(`<text x="${x0+i*colW+12}" y="100" class="med">${lens.id}</text>`, `<text x="${x0+i*colW+12}" y="120" class="tiny muted">${esc(lens.short)}</text>`));
  let row = 0;
  const drawRow = (label, lenses, isFailure = false) => {
    const y = 140 + row++ * rowH;
    parts.push(`<text x="35" y="${y+20}" class="small ${isFailure?'p0':''}">${esc(label)}</text>`);
    AUDIT_LENSES.forEach((lens,i) => {
      const level = lenses?.[lens.id]?.level ?? (isFailure && lens.id==='F01' ? 3 : 0);
      const fill = level >= 3 ? '#ff5b78' : level === 2 ? '#ff935e' : level === 1 ? '#d9a843' : '#121a25';
      parts.push(`<rect x="${x0+i*colW}" y="${y}" width="${colW-8}" height="${rowH-4}" rx="4" fill="${fill}" opacity="${level?0.82:1}" stroke="#263348"/>`, level ? `<text x="${x0+i*colW+12}" y="${y+20}" class="tiny">${esc(lenses?.[lens.id]?.compact ?? lenses?.[lens.id]?.label ?? 'build failure')}</text>` : '');
    });
  };
  chunks.forEach(s => drawRow(s.chunk.key, s.auditLenses));
  failures.forEach(f => drawRow(`${f.chunkKey} · ${f.code}`, null, true));
  parts.push('</svg>'); return parts.join('\n');
}

function barRows(counts, x, y, width, rowH = 30, label = '') {
  const entries = Object.entries(counts ?? {}).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(1, ...entries.map(([,v])=>v)); const out=[];
  if (label) out.push(`<text x="${x}" y="${y-16}" class="med">${esc(label)}</text>`);
  entries.forEach(([name,value],i)=>{ const yy=y+i*rowH; const w=(value/max)*width; out.push(`<text x="${x}" y="${yy+17}" class="small">${esc(name)}</text>`,`<rect x="${x+230}" y="${yy+4}" width="${w}" height="18" rx="3" fill="#5d88c5"/>`,`<text x="${x+238+w}" y="${yy+18}" class="small">${value}</text>`); });
  return out;
}

export function renderSystemFingerprintSvg(sweep, { width = 1600, height = 920 } = {}) {
  const parts = svgStart(width, height, 'System fingerprint — what the generator actually emits', 'Aggregated live runtime records across this sweep. This intentionally reports system vocabulary before judging aesthetics.');
  parts.push(...barRows(sweep.bridgeGrammar?.families, 45, 125, 320, 30, 'BRIDGE FAMILIES'));
  parts.push(...barRows(sweep.bridgeGrammar?.grammars, 800, 125, 290, 30, 'BRIDGE STRUCTURAL GRAMMARS'));
  parts.push(...barRows(sweep.stairRhythm?.topologies, 45, 520, 320, 30, 'STAIR OWNERSHIP TOPOLOGIES'));
  parts.push(...barRows(sweep.stairRhythm?.architectureFamilies, 800, 520, 290, 30, 'STAIR ARCHITECTURE EXPRESSIONS'));
  parts.push(`<text x="45" y="855" class="small muted">bridge conflicts: ${sweep.bridgeGrammar?.suspensionOverlayConflicts ?? 0} · triple grammar stacks: ${sweep.bridgeGrammar?.stackedLargeSystems ?? 0} · topology metadata missing: ${sweep.stairRhythm?.missingTopologyMetadata ?? 0} · transfer build failures: ${sweep.transferFailures ?? 0}</text>`);
  parts.push('</svg>'); return parts.join('\n');
}

export function renderCodeIssueMapSvg(issueScan, { width = 1600 } = {}) {
  const lenses = arr(issueScan?.lenses); const laneH = 128, height = 100 + lenses.length*laneH;
  const parts = svgStart(width, height, 'Code ownership map for the audit lenses', 'File names and imports are scanned from this checkout. The issue-to-file grouping comes from the audit/code evidence and is kept explicit rather than inferred from geometry.');
  lenses.forEach((lens,li)=>{
    const y=88+li*laneH; parts.push(`<text x="32" y="${y+24}" class="med">${lens.id}</text>`,`<text x="75" y="${y+24}" class="small">${esc(lens.short)}</text>`);
    lens.files.forEach((file,fi)=>{ const x=280+fi*245; const node=issueScan.nodes?.[file]; parts.push(`<rect x="${x}" y="${y}" width="225" height="78" rx="8" fill="#101722" stroke="${node?.exists?'#40516c':'#7a3947'}"/>`,`<text x="${x+10}" y="${y+23}" class="small">${esc(file.replace('world/',''))}</text>`,`<text x="${x+10}" y="${y+44}" class="tiny muted">${node?.schemas?.slice(0,2).join(' · ') || 'no schema literal found'}</text>`,`<text x="${x+10}" y="${y+62}" class="tiny muted">${node?.intentMarkers?.join(' · ') || `${node?.imports?.length ?? 0} imports`}</text>`); });
  }); parts.push('</svg>'); return parts.join('\n');
}

export function renderChunkIndexHtmlR2(summary) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>JWEB chunk ${esc(summary.chunk.key)} observatory R2</title><style>:root{color-scheme:dark}body{margin:0;background:#080b10;color:#eef2fb;font:14px ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:1650px;margin:auto;padding:28px}a{color:#78bfff}.muted{color:#8d98aa}.views{display:grid;gap:22px}img{width:100%;border:1px solid #29364a;border-radius:10px;background:#080b10}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:#0e141e;border:1px solid #29364a;padding:14px;border-radius:8px}</style></head><body><main><p><a href="../../index.html">← sweep</a></p><h1>Chunk ${esc(summary.chunk.key)} · observatory R2</h1><p class="muted">Start abstract, then descend toward exact geometry. These views deliberately suppress most mesh detail.</p><div class="views"><img src="audit-lenses.svg"><img src="macro-anatomy.svg"><img src="bridge-grammar.svg"><img src="stair-rhythm.svg"><img src="system-story.svg"><img src="building-stacks.svg"><img src="attention-ledger.svg"></div><h2>Raw live summary</h2><p><a href="summary.json">summary.json</a></p><pre>${esc(JSON.stringify({macro:summary.macro,bridgeGrammar:summary.bridgeGrammar,stairRhythm:summary.stairRhythm,transfers:summary.transfers,shellAuthority:summary.shellAuthority},null,2))}</pre></main></body></html>`;
}

export function renderSweepIndexHtmlR2(sweep, { title = 'JWEB System Observatory R2' } = {}) {
  const ranked = [...arr(sweep?.chunks)].sort((a,b)=>((b.auditLenses?.F04?.level??0)+(b.auditLenses?.F05?.level??0)+(b.auditLenses?.F02?.level??0))-((a.auditLenses?.F04?.level??0)+(a.auditLenses?.F05?.level??0)+(a.auditLenses?.F02?.level??0)) || b.attention-a.attention);
  const rows = ranked.map(s=>`<tr><td><a href="chunks/${esc(s.chunk.key)}/index.html">${esc(s.chunk.key)}</a></td><td>${pct(s.macro.unionOccupancy)}</td><td>${pct(s.macro.interlockShareOfShared)}</td><td>${s.bridgeGrammar.count}</td><td>${s.bridgeGrammar.suspensionOverlayConflicts}</td><td>${s.bridgeGrammar.stackedLargeSystems}</td><td>${s.stairRhythm.count}</td><td>${pct(s.stairRhythm.dominantTopologyShare)}</td><td>${s.transfers.demands}</td></tr>`).join('\n');
  const failures = arr(sweep.failures).map(f=>`<tr><td>${esc(f.chunkKey)}</td><td>${esc(f.code)}</td><td>${esc(f.message)}</td></tr>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>:root{color-scheme:dark}body{margin:0;background:#080b10;color:#eef2fb;font:14px ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:1750px;margin:auto;padding:28px}a{color:#78bfff}.muted{color:#8d98aa}.cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.card{background:#101722;border:1px solid #29364a;border-radius:9px;padding:14px}.big{font-size:26px;font-weight:800}img{width:100%;border:1px solid #29364a;border-radius:10px;background:#080b10;margin:10px 0 30px}table{border-collapse:collapse;width:100%;margin:12px 0 30px}th,td{padding:8px;border-bottom:1px solid #222c3c;text-align:right}th:first-child,td:first-child{text-align:left}@media(max-width:1050px){.cards{grid-template-columns:repeat(2,1fr)}}</style></head><body><main><h1>${esc(title)}</h1><p class="muted">A general picture first: macro figure-ground and section, known audit lenses, repeated system grammars, then per-chunk exact semantic topology.</p><div class="cards"><div class="card"><div class="big">${sweep.totals.chunks}</div>built chunks</div><div class="card"><div class="big">${sweep.failures.length}</div>build failures</div><div class="card"><div class="big">${pct(sweep.macro.unionOccupancyMedian)}</div>median module union</div><div class="card"><div class="big">${pct(sweep.macro.interlockShareMedian)}</div>median vertical interlock</div><div class="card"><div class="big">${sweep.bridgeGrammar.suspensionOverlayConflicts}</div>F04 bridge conflicts</div><div class="card"><div class="big">${sweep.bridgeGrammar.stackedLargeSystems}</div>F05 triple stacks</div></div><h2>1. General runtime picture</h2><img src="runtime-pipeline.svg"><h2>2. Vertical macro shape across chunks</h2><img src="macro-field.svg"><h2>3. Figure-ground atlas across chunks</h2><img src="module-atlas.svg"><h2>4. Known-issue lenses</h2><img src="audit-lens-matrix.svg"><h2>5. Stair contract / repetition</h2><img src="stair-contract-matrix.svg"><h2>6. What systems are actually being emitted?</h2><img src="system-fingerprint.svg"><h2>7. Where in code do those systems live?</h2><img src="code-issue-map.svg"><h2>8. Where should the exact harness look next?</h2><img src="triage-target-deck.svg"><h2>Chunks</h2><table><thead><tr><th>chunk</th><th>module union</th><th>interlock</th><th>bridges</th><th>F04</th><th>F05</th><th>stairs</th><th>dominant stair</th><th>transfer demands</th></tr></thead><tbody>${rows}</tbody></table>${failures?`<h2>Build failures</h2><table><thead><tr><th>chunk</th><th>code</th><th>message</th></tr></thead><tbody>${failures}</tbody></table>`:''}<p><a href="sweep.json">raw sweep JSON</a> · <a href="SYSTEM-FINDINGS.md">generated findings</a> · <a href="code-issue-scan.json">code issue scan</a></p></main></body></html>`;
}

export function renderFindingsMarkdownR2(sweep) {
  const lines = ['# JWEB System Observatory R2 — generated sweep findings','', '> This is a triage report. It deliberately distinguishes measured runtime/code facts from aesthetic hypotheses.','', `Built chunks: **${sweep.totals.chunks}**`, `Build failures: **${sweep.failures.length}** (${sweep.transferFailures} tower-transfer unrealized)`, `Median combined 9×9 module occupancy: **${pct(sweep.macro.unionOccupancyMedian)}**`, `Median vertical interlock among shared ground/hanging plan cells: **${pct(sweep.macro.interlockShareMedian)}**`, `Bridge architecture records: **${sweep.bridgeGrammar.total}**`, `Non-suspension bridge families carrying suspended-catenary grammar: **${sweep.bridgeGrammar.suspensionOverlayConflicts}**`, `Bridges carrying family + variant + support systems: **${sweep.bridgeGrammar.stackedLargeSystems}**`, `Exact compound-stair ownership records: **${sweep.stairRhythm.total}**`, `Topology-tagged stair owners: **${sweep.stairRhythm.explicitTopologyCount}**; missing topology metadata: **${sweep.stairRhythm.missingTopologyMetadata}**`, `District thoroughfare stairs: **${sweep.stairRhythm.thoroughfareCount}** spanning **${sweep.stairRhythm.thoroughfareStories}** owned stories; median/max clear width **${sweep.stairRhythm.thoroughfareWidthMedian.toFixed(2)}m / ${sweep.stairRhythm.thoroughfareWidthMax.toFixed(2)}m**`, `Stair guard visual primitives: **${sweep.stairRhythm.stairGuardPrimitiveCount}** across **${sweep.stairRhythm.ownedStories}** owned stories (**${sweep.stairRhythm.guardPrimitivesPerOwnedStory.toFixed(1)}/story**)`, `Semantic spaces/connectors/portals emitted: **${sweep.runtimeCounts?.spaces ?? 0} / ${sweep.runtimeCounts?.connectors ?? 0} / ${sweep.runtimeCounts?.portals ?? 0}**`, ''];
  lines.push('## Audit lens incidence','');
  for (const lens of AUDIT_LENSES) lines.push(`- **${lens.id} ${lens.short}:** ${sweep.lensTotals[lens.id]?.chunksFlagged ?? 0} chunks/failures flagged by this diagnostic lens.`);
  lines.push('', '## Bridge family census',''); for (const [k,v] of Object.entries(sweep.bridgeGrammar.families).sort((a,b)=>b[1]-a[1])) lines.push(`- ${k}: ${v}`);
  lines.push('', '## Stair topology census',''); for (const [k,v] of Object.entries(sweep.stairRhythm.topologies).sort((a,b)=>b[1]-a[1])) lines.push(`- ${k}: ${v}`);
  lines.push('', '## Most useful next targets','');
  const ranked=[...sweep.chunks].sort((a,b)=>((b.auditLenses.F04.level+b.auditLenses.F05.level+b.auditLenses.F02.level)-(a.auditLenses.F04.level+a.auditLenses.F05.level+a.auditLenses.F02.level))||b.attention-a.attention).slice(0,12);
  for(const s of ranked) lines.push(`- **${s.chunk.key}** — module union ${pct(s.macro.unionOccupancy)}, interlock ${pct(s.macro.interlockShareOfShared)}, F04=${s.bridgeGrammar.suspensionOverlayConflicts}, F05=${s.bridgeGrammar.stackedLargeSystems}, stair dominant=${pct(s.stairRhythm.dominantTopologyShare)}.`);
  for(const f of sweep.failures.slice(0,12)) lines.push(`- **${f.chunkKey}** — BUILD FAILURE ${f.code}: ${f.message}`);
  return lines.join('\n')+'\n';
}

// Re-export the older exact semantic/topology renderers so R2 remains one import.
export { renderAttentionLedgerSvg, renderBuildingStacksSvg, renderSystemStorySvg };
