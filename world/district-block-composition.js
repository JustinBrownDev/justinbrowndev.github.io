export const DISTRICT_BLOCK_COMPOSITION_SCHEMA = 'jweb.district-block-composition.v1';
export const DISTRICT_BUILDING_CONTEXT_SCHEMA = 'jweb.district-building-context.v1';
export const DISTRICT_MACROCELL_SIZE = 3;

const SIDES = Object.freeze(['north', 'east', 'south', 'west']);
const DISTRICT_FAMILIES = Object.freeze(['network', 'market', 'service', 'industrial', 'residential', 'transit', 'mechanical', 'archive']);

const DISTRICT_PROFILES = Object.freeze({
    network: Object.freeze({
        subCharacters: Object.freeze(['exchange-canyon', 'relay-market', 'switchyard-frontage']),
        commercial: 0.72, service: 0.46, quiet: 0.22, mechanical: 0.48, bridge: 0.72,
        spectacle: 0.76, pedestrian: 0.72, courtyard: 0.24,
        rooflineRhythms: Object.freeze(['stepped', 'signal-spikes', 'mixed-crown']),
    }),
    market: Object.freeze({
        subCharacters: Object.freeze(['night-market-canyon', 'shopfront-run', 'arcade-frontage']),
        commercial: 0.94, service: 0.42, quiet: 0.18, mechanical: 0.34, bridge: 0.42,
        spectacle: 0.88, pedestrian: 0.92, courtyard: 0.18,
        rooflineRhythms: Object.freeze(['sign-crown', 'stepped', 'busy-low-high']),
    }),
    service: Object.freeze({
        subCharacters: Object.freeze(['loading-backbone', 'repair-alley', 'utility-court']),
        commercial: 0.36, service: 0.92, quiet: 0.26, mechanical: 0.82, bridge: 0.56,
        spectacle: 0.34, pedestrian: 0.46, courtyard: 0.34,
        rooflineRhythms: Object.freeze(['utility-sawtooth', 'flat-plant', 'stepped-service']),
    }),
    industrial: Object.freeze({
        subCharacters: Object.freeze(['workshop-belt', 'plant-yard', 'fabrication-canyon']),
        commercial: 0.28, service: 0.82, quiet: 0.16, mechanical: 0.96, bridge: 0.62,
        spectacle: 0.28, pedestrian: 0.34, courtyard: 0.42,
        rooflineRhythms: Object.freeze(['sawtooth', 'stack-and-tank', 'plant-roof']),
    }),
    residential: Object.freeze({
        subCharacters: Object.freeze(['tenement-pocket', 'lodging-lane', 'quiet-upper-block']),
        commercial: 0.34, service: 0.30, quiet: 0.88, mechanical: 0.24, bridge: 0.38,
        spectacle: 0.18, pedestrian: 0.62, courtyard: 0.56,
        rooflineRhythms: Object.freeze(['calm-step', 'courtyard-ring', 'domestic-roof']),
    }),
    transit: Object.freeze({
        subCharacters: Object.freeze(['transfer-canyon', 'bridge-junction', 'platform-edge']),
        commercial: 0.56, service: 0.54, quiet: 0.16, mechanical: 0.52, bridge: 0.94,
        spectacle: 0.58, pedestrian: 0.88, courtyard: 0.16,
        rooflineRhythms: Object.freeze(['connector-step', 'signal-spikes', 'mixed-crown']),
    }),
    mechanical: Object.freeze({
        subCharacters: Object.freeze(['duct-canyon', 'plant-cluster', 'service-stack']),
        commercial: 0.22, service: 0.92, quiet: 0.12, mechanical: 1.00, bridge: 0.58,
        spectacle: 0.38, pedestrian: 0.30, courtyard: 0.24,
        rooflineRhythms: Object.freeze(['plant-roof', 'stack-and-tank', 'utility-sawtooth']),
    }),
    archive: Object.freeze({
        subCharacters: Object.freeze(['archive-court', 'institutional-pocket', 'stack-lane']),
        commercial: 0.24, service: 0.34, quiet: 0.72, mechanical: 0.30, bridge: 0.32,
        spectacle: 0.30, pedestrian: 0.52, courtyard: 0.48,
        rooflineRhythms: Object.freeze(['monolith-step', 'calm-step', 'courtyard-ring']),
    }),
});

const PROGRAM_OPTIONS = Object.freeze({
    'residential-lodging': Object.freeze({ commercial: 'motel_room', service: 'motel_room', quiet: 'motel_room', anchor: 'motel_room', fallback: 'motel_room' }),
    'mercantile-public': Object.freeze({ commercial: 'convenience', service: 'hardware_store', quiet: 'pharmacy', anchor: 'bar', fallback: 'convenience' }),
    business: Object.freeze({ commercial: 'bank', service: 'radio_station', quiet: 'office', anchor: 'post_office', fallback: 'office' }),
    'assembly-institutional': Object.freeze({ commercial: 'library', service: 'fire_station', quiet: 'library', anchor: 'courtroom', fallback: 'library' }),
    'industrial-service': Object.freeze({ commercial: 'auto_shop', service: 'electronics_repair', quiet: 'laboratory', anchor: 'factory_control', fallback: 'electronics_repair' }),
    storage: Object.freeze({ commercial: 'archive', service: 'boiler_room', quiet: 'archive', anchor: 'mainframe_room', fallback: 'archive' }),
    'maintenance-utility': Object.freeze({ commercial: 'server_room', service: 'boiler_room', quiet: 'server_room', anchor: 'mainframe_room', fallback: 'server_room' }),
});

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, finite(value)));
}

function floorDiv(value, divisor) {
    return Math.floor(finite(value) / divisor);
}

function oppositeSide(side) {
    const index = SIDES.indexOf(side);
    return index < 0 ? 'south' : SIDES[(index + 2) % SIDES.length];
}

function sideOffset(side, offset) {
    const index = SIDES.indexOf(side);
    return index < 0 ? SIDES[0] : SIDES[(index + offset + SIDES.length) % SIDES.length];
}

function stableFraction(key) {
    return hash32(key) / 0xffffffff;
}

function buildingsFrom(payload, entities) {
    return [...(entities ?? payload?.entities ?? [])]
        .filter(entity => entity?.kind === 'building' || entity?.kind === 'district-landmark')
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function connectorPressureByEntity(payload) {
    const pressure = new Map();
    for (const connector of payload?.physics?.semanticConnectors ?? []) {
        const entityId = connector?.metadata?.entityId;
        if (entityId == null) continue;
        const kind = String(connector?.kind ?? '');
        const weight = kind === 'bridge' ? 1
            : kind === 'fire-escape' ? 0.78
                : kind === 'stair' || kind === 'landing' ? 0.52
                    : kind === 'door' ? 0.18 : 0.24;
        pressure.set(String(entityId), finite(pressure.get(String(entityId))) + weight);
    }
    return pressure;
}

function entityMass(entity) {
    const modules = entity?.footprintModules ?? [];
    if (modules.length) {
        return modules.reduce((sum, module) => {
            const area = Math.max(0.2, finite(module.halfX, 0.5) * 2) * Math.max(0.2, finite(module.halfZ, 0.5) * 2);
            return sum + area * Math.max(1, finite(module.floors, finite(entity?.floors, 1)));
        }, 0);
    }
    return Math.max(0.2, finite(entity?.halfX, 1) * 2) * Math.max(0.2, finite(entity?.halfZ, 1) * 2)
        * Math.max(1, finite(entity?.floors, finite(entity?.height, 3) / Math.max(1, finite(entity?.floorH, 3))));
}

function primaryEdgeFor(entity, extents) {
    if (SIDES.includes(entity?.doorSide)) return entity.doorSide;
    const x = finite(entity?.x);
    const z = finite(entity?.z);
    const distances = [
        ['north', Math.abs(z - extents.minZ)],
        ['east', Math.abs(extents.maxX - x)],
        ['south', Math.abs(extents.maxZ - z)],
        ['west', Math.abs(x - extents.minX)],
    ];
    distances.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    return distances[0]?.[0] ?? 'north';
}

function blockExtents(buildings, chunk) {
    if (buildings.length) {
        const xs = buildings.map(entity => finite(entity?.x));
        const zs = buildings.map(entity => finite(entity?.z));
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        if (maxX > minX || maxZ > minZ) return { minX, maxX, minZ, maxZ };
    }
    const half = Math.max(1, finite(chunk?.chunkSize, 32) * 0.5);
    const cx = finite(chunk?.centerX, finite(chunk?.x) * finite(chunk?.chunkSize, 32));
    const cz = finite(chunk?.centerZ, finite(chunk?.z) * finite(chunk?.chunkSize, 32));
    return { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half };
}

function gradientValue(entity, extents, axis, sign) {
    const min = axis === 'x' ? extents.minX : extents.minZ;
    const max = axis === 'x' ? extents.maxX : extents.maxZ;
    const value = axis === 'x' ? finite(entity?.x) : finite(entity?.z);
    const t = max > min ? clamp01((value - min) / (max - min)) : 0.5;
    return sign < 0 ? 1 - t : t;
}

function profileFor(family) {
    return DISTRICT_PROFILES[family] ?? DISTRICT_PROFILES.network;
}

function familyForDistrict(worldId, districtX, districtZ) {
    return DISTRICT_FAMILIES[hash32(`${worldId}:district-family:${districtX}:${districtZ}`) % DISTRICT_FAMILIES.length];
}

function edgeIntent(worldId, blockKey, family, profile) {
    const baseIndex = hash32(`${worldId}:${blockKey}:${family}:commercial-edge`) % SIDES.length;
    const commercial = SIDES[baseIndex];
    const service = sideOffset(commercial, (hash32(`${worldId}:${blockKey}:service-edge`) & 1) ? 1 : -1);
    let quiet = oppositeSide(commercial);
    if (quiet === service) quiet = sideOffset(quiet, 1);
    const pedestrian = profile.pedestrian >= 0.75 ? commercial : sideOffset(commercial, 1);
    const spectacleSides = profile.spectacle >= 0.72
        ? [commercial, sideOffset(commercial, (hash32(`${worldId}:${blockKey}:spectacle-turn`) & 1) ? 1 : -1)]
        : profile.spectacle >= 0.42 ? [commercial] : [];
    return Object.freeze({
        commercial,
        service,
        quiet,
        pedestrian,
        loading: service,
        spectacleSides: Object.freeze([...new Set(spectacleSides)]),
    });
}

function roleProgramHint(entity, role) {
    const family = String(entity?.physicalUse?.family ?? '');
    const options = PROGRAM_OPTIONS[family];
    if (!options) return null;
    if (role === 'anchor' || role === 'secondary-landmark') return options.anchor ?? options.fallback;
    if (role === 'commercial-frontage') return options.commercial ?? options.fallback;
    if (role === 'service-edge' || role === 'connector-node') return options.service ?? options.fallback;
    if (role === 'quiet-edge') return options.quiet ?? options.fallback;
    return options.fallback ?? null;
}

function contextualRole({ entity, edge, edgeIntent: edges, anchorId, secondaryIds, connectorPressure, profile, seedBasis }) {
    if (String(entity.id) === String(anchorId)) return 'anchor';
    if (secondaryIds.has(String(entity.id))) return 'secondary-landmark';
    const connector = clamp01(connectorPressure / 1.5);
    const candidates = [
        ['commercial-frontage', edge === edges.commercial ? profile.commercial + 0.25 : profile.commercial * 0.36],
        ['service-edge', edge === edges.service ? profile.service + 0.25 : profile.service * 0.36],
        ['quiet-edge', edge === edges.quiet ? profile.quiet + 0.25 : profile.quiet * 0.32],
        ['connector-node', connector + profile.bridge * 0.22],
        ['background', 0.34],
    ];
    candidates.sort((a, b) => b[1] - a[1]
        || hash32(`${seedBasis}:${entity.id}:role:${a[0]}`) - hash32(`${seedBasis}:${entity.id}:role:${b[0]}`)
        || a[0].localeCompare(b[0]));
    return candidates[0][0];
}

function exteriorHintsFor(context) {
    if (context.blockRole === 'quiet-edge' || context.quietPressure >= 0.72) {
        return Object.freeze({
            styleBiases: Object.freeze(['institutional-monolith', 'roof-heavy', 'mixed']),
            facadeSemanticFamily: 'security-hardware',
            roofSemanticFamily: 'roof-mechanical',
        });
    }
    if (context.blockRole === 'service-edge' || context.blockRole === 'connector-node' || context.servicePressure >= 0.68 || context.mechanicalPressure >= 0.72) {
        return Object.freeze({
            styleBiases: Object.freeze(['pipe-nightmare', 'service-bunker', 'roof-heavy', 'mixed']),
            facadeSemanticFamily: context.mechanicalPressure >= 0.78 ? 'vertical-mechanical' : 'mechanical-service',
            roofSemanticFamily: 'roof-mechanical',
        });
    }
    if (context.blockRole === 'commercial-frontage' || context.commercialPressure >= 0.68 || context.spectacleCorridor) {
        return Object.freeze({
            styleBiases: Object.freeze(['signage-bazaar', 'media-monster', 'mixed']),
            facadeSemanticFamily: 'signage',
            roofSemanticFamily: 'roof-antenna',
        });
    }
    return Object.freeze({
        styleBiases: Object.freeze(['mixed', 'roof-heavy', 'service-bunker']),
        facadeSemanticFamily: 'mechanical-service',
        roofSemanticFamily: 'roof-mechanical',
    });
}

function buildBuildingContext({
    entity,
    edge,
    role,
    profile,
    district,
    block,
    edges,
    extents,
    gradient,
    connectorPressure,
    anchorId,
    secondaryIds,
    seedBasis,
}) {
    const edgeCommercial = edge === edges.commercial ? 1 : 0;
    const edgeService = edge === edges.service ? 1 : 0;
    const edgeQuiet = edge === edges.quiet ? 1 : 0;
    const spectacleCorridor = edges.spectacleSides.includes(edge);
    const anchor = String(entity.id) === String(anchorId);
    const secondaryLandmark = secondaryIds.has(String(entity.id));
    const commercialPressure = clamp01(profile.commercial * 0.56 + edgeCommercial * 0.42 + (role === 'commercial-frontage' ? 0.18 : 0));
    const servicePressure = clamp01(profile.service * 0.54 + edgeService * 0.40 + (role === 'service-edge' ? 0.20 : 0));
    const quietPressure = clamp01(profile.quiet * 0.58 + edgeQuiet * 0.40 + (role === 'quiet-edge' ? 0.18 : 0));
    const mechanicalPressure = clamp01(profile.mechanical * 0.68 + servicePressure * 0.28);
    const connector = clamp01(connectorPressure / 1.5);
    const bridgePressure = clamp01(profile.bridge * 0.66 + connector * 0.34);
    const spectaclePriority = clamp01(
        profile.spectacle * 0.42
        + (spectacleCorridor ? 0.28 : 0)
        + (anchor ? 0.28 : secondaryLandmark ? 0.16 : 0)
        + commercialPressure * 0.12
        - quietPressure * 0.24
    );
    const visualIntensity = clamp01(
        block.visualIntensityBase * 0.50
        + gradient * 0.24
        + spectaclePriority * 0.22
        + mechanicalPressure * 0.14
        - quietPressure * 0.20
    );
    const frontageCharacter = quietPressure >= 0.72 ? 'quiet'
        : servicePressure >= 0.70 ? 'service'
            : commercialPressure >= 0.68 ? 'commercial-public'
                : edge === edges.pedestrian ? 'pedestrian-active' : 'mixed';
    const rooflineTarget = anchor ? 'anchor-crown'
        : secondaryLandmark ? 'secondary-step'
            : quietPressure >= 0.72 ? 'calm'
                : mechanicalPressure >= 0.72 ? 'mechanical-cluster'
                    : block.rooflineRhythm;
    const programHint = roleProgramHint(entity, role);
    const context = {
        schema: DISTRICT_BUILDING_CONTEXT_SCHEMA,
        compositionId: block.compositionId,
        districtId: district.id,
        blockId: block.id,
        entityId: String(entity.id),
        districtFamily: district.family,
        districtSubCharacter: district.subCharacter,
        blockRole: role,
        primaryEdge: edge,
        frontageCharacter,
        spectacleCorridor,
        anchor,
        secondaryLandmark,
        commercialPressure,
        servicePressure,
        quietPressure,
        mechanicalPressure,
        bridgePressure,
        connectorPressure: connector,
        spectaclePriority,
        visualIntensity,
        courtyardVoidTendency: block.courtyardVoidTendency,
        rooflineRhythm: block.rooflineRhythm,
        rooflineTarget,
        buildingProgramHint: programHint,
        semanticFamilyHint: role === 'service-edge' || mechanicalPressure >= 0.72 ? 'service'
            : role === 'commercial-frontage' ? 'commercial'
                : role === 'quiet-edge' ? 'quiet' : role,
        deterministicRank: hash32(`${seedBasis}:${entity.id}:building-context`),
        normalizedPosition: Object.freeze({
            x: extents.maxX > extents.minX ? clamp01((finite(entity.x) - extents.minX) / (extents.maxX - extents.minX)) : 0.5,
            z: extents.maxZ > extents.minZ ? clamp01((finite(entity.z) - extents.minZ) / (extents.maxZ - extents.minZ)) : 0.5,
        }),
    };
    context.exteriorHints = exteriorHintsFor(context);
    return Object.freeze(context);
}

export function compileDistrictBlockComposition({ chunk, payload = null, entities = null } = {}) {
    if (!chunk) throw new Error('compileDistrictBlockComposition requires chunk');
    const buildings = buildingsFrom(payload, entities);
    const worldId = String(chunk.worldId ?? payload?.worldId ?? 'jweb.dev/world:unknown');
    const districtX = floorDiv(chunk.x, DISTRICT_MACROCELL_SIZE);
    const districtZ = floorDiv(chunk.z, DISTRICT_MACROCELL_SIZE);
    const districtKey = `${districtX},${districtZ}`;
    const blockKey = String(chunk.key ?? `${finite(chunk.x)},${finite(chunk.z)}`);
    const family = familyForDistrict(worldId, districtX, districtZ);
    const profile = profileFor(family);
    const districtSeed = hash32(`${worldId}:district:${districtKey}`);
    const blockSeed = hash32(`${worldId}:district:${districtKey}:block:${blockKey}`);
    const subCharacter = profile.subCharacters[districtSeed % profile.subCharacters.length];
    const rooflineRhythm = profile.rooflineRhythms[blockSeed % profile.rooflineRhythms.length];
    const edges = edgeIntent(worldId, blockKey, family, profile);
    const gradientAxis = (hash32(`${worldId}:${blockKey}:gradient-axis`) & 1) ? 'x' : 'z';
    const gradientSign = (hash32(`${worldId}:${blockKey}:gradient-sign`) & 1) ? 1 : -1;
    const visualIntensityBase = clamp01(0.22 + profile.spectacle * 0.34 + profile.mechanical * 0.18 + profile.commercial * 0.16 - profile.quiet * 0.12);
    const compositionId = `${DISTRICT_BLOCK_COMPOSITION_SCHEMA}:${worldId}:${districtKey}:${blockKey}`;
    const district = Object.freeze({
        id: `district:${worldId}:${districtKey}`,
        key: districtKey,
        macrocellSize: DISTRICT_MACROCELL_SIZE,
        x: districtX,
        z: districtZ,
        family,
        subCharacter,
        seed: districtSeed,
        commercialBias: profile.commercial,
        serviceBias: profile.service,
        quietBias: profile.quiet,
        mechanicalEmphasis: profile.mechanical,
        bridgePressure: profile.bridge,
        spectacleBias: profile.spectacle,
        pedestrianBias: profile.pedestrian,
        courtyardVoidTendency: profile.courtyard,
    });
    const block = {
        id: `block:${worldId}:${blockKey}`,
        compositionId,
        chunkKey: blockKey,
        seed: blockSeed,
        edgeRoles: Object.freeze({
            [edges.commercial]: 'commercial-public',
            [edges.service]: 'service-loading',
            [edges.quiet]: 'quiet',
            [edges.pedestrian]: edges.pedestrian === edges.commercial ? 'commercial-pedestrian' : 'pedestrian-active',
        }),
        commercialEdge: edges.commercial,
        serviceEdge: edges.service,
        quietEdge: edges.quiet,
        pedestrianEdge: edges.pedestrian,
        loadingEdge: edges.loading,
        commercialFrontageRun: Object.freeze({ side: edges.commercial, pressure: profile.commercial }),
        quietStretch: Object.freeze({ side: edges.quiet, pressure: profile.quiet }),
        serviceAlley: Object.freeze({ side: edges.service, loadingSide: edges.loading, pressure: profile.service }),
        mechanicalCluster: Object.freeze({ side: edges.service, pressure: profile.mechanical }),
        pedestrianChannel: Object.freeze({ side: edges.pedestrian, density: profile.pedestrian }),
        bridgeZone: Object.freeze({ side: edges.pedestrian, pressure: profile.bridge }),
        spectacleCorridor: Object.freeze({ sides: edges.spectacleSides, enabled: edges.spectacleSides.length > 0 }),
        visualIntensityGradient: Object.freeze({ axis: gradientAxis, sign: gradientSign, low: Math.max(0, visualIntensityBase - 0.24), high: Math.min(1, visualIntensityBase + 0.24) }),
        visualIntensityBase,
        mechanicalPressure: profile.mechanical,
        bridgePressure: profile.bridge,
        courtyardVoidTendency: profile.courtyard,
        rooflineRhythm,
    };
    const extents = blockExtents(buildings, chunk);
    const connectors = connectorPressureByEntity(payload);
    const ranked = buildings.map(entity => ({
        entity,
        mass: entityMass(entity),
        landmark: entity.kind === 'district-landmark' ? 1 : 0,
        rank: hash32(`${compositionId}:${entity.id}:hierarchy`),
    })).sort((a, b) => b.landmark - a.landmark || b.mass - a.mass || a.rank - b.rank || String(a.entity.id).localeCompare(String(b.entity.id)));
    const anchorId = ranked[0]?.entity?.id != null ? String(ranked[0].entity.id) : null;
    const secondaryCount = ranked.length >= 7 ? 2 : ranked.length >= 3 ? 1 : 0;
    const secondaryIds = new Set(ranked.slice(1, 1 + secondaryCount).map(item => String(item.entity.id)));
    const seedBasis = `${compositionId}:${blockSeed}`;
    let contexts = buildings.map(entity => {
        const edge = primaryEdgeFor(entity, extents);
        const connectorPressure = finite(connectors.get(String(entity.id)));
        const role = contextualRole({ entity, edge, edgeIntent: edges, anchorId, secondaryIds, connectorPressure, profile, seedBasis });
        const gradient = gradientValue(entity, extents, gradientAxis, gradientSign);
        const context = buildBuildingContext({
            entity,
            edge,
            role,
            profile,
            district,
            block,
            edges,
            extents,
            gradient,
            connectorPressure,
            anchorId,
            secondaryIds,
            seedBasis,
        });
        return Object.freeze({ ...context, physicalUseFamily: entity?.physicalUse?.family ?? null });
    });

    // For a populated block, keep distinct service/commercial/quiet readings visible.
    // These are semantic roles only; they do not prescribe prop counts or geometry.
    if (contexts.length >= 4) {
        const protectedIds = new Set([anchorId, ...secondaryIds].filter(Boolean));
        const forceRole = (role, scoreKey) => {
            if (contexts.some(context => context.blockRole === role)) return;
            const selected = contexts
                .filter(context => !protectedIds.has(context.entityId))
                .sort((a, b) => finite(b[scoreKey]) - finite(a[scoreKey]) || a.deterministicRank - b.deterministicRank || a.entityId.localeCompare(b.entityId))[0];
            if (!selected) return;
            contexts = contexts.map(context => {
                if (context.entityId !== selected.entityId) return context;
                const entity = buildings.find(item => String(item.id) === context.entityId);
                const next = {
                    ...context,
                    blockRole: role,
                    buildingProgramHint: roleProgramHint(entity, role) ?? context.buildingProgramHint,
                    semanticFamilyHint: role === 'commercial-frontage' ? 'commercial' : role === 'service-edge' ? 'service' : 'quiet',
                    frontageCharacter: role === 'commercial-frontage' ? 'commercial-public' : role === 'service-edge' ? 'service' : 'quiet',
                };
                next.exteriorHints = exteriorHintsFor(next);
                return Object.freeze(next);
            });
            protectedIds.add(selected.entityId);
        };
        forceRole('commercial-frontage', 'commercialPressure');
        forceRole('service-edge', 'servicePressure');
        forceRole('quiet-edge', 'quietPressure');
    }

    contexts.sort((a, b) => a.entityId.localeCompare(b.entityId));
    const buildingContexts = Object.freeze(Object.fromEntries(contexts.map(context => [context.entityId, context])));
    const hierarchy = Object.freeze({
        anchorBuildingId: anchorId,
        secondaryLandmarkIds: Object.freeze([...secondaryIds].sort()),
        spectacleBuildingIds: Object.freeze(contexts.filter(context => context.spectaclePriority >= 0.62 || context.anchor).sort((a, b) => b.spectaclePriority - a.spectaclePriority || a.entityId.localeCompare(b.entityId)).map(context => context.entityId)),
        commercialBuildingIds: Object.freeze(contexts.filter(context => context.blockRole === 'commercial-frontage').map(context => context.entityId)),
        serviceBuildingIds: Object.freeze(contexts.filter(context => context.blockRole === 'service-edge' || context.blockRole === 'connector-node').map(context => context.entityId)),
        quietBuildingIds: Object.freeze(contexts.filter(context => context.blockRole === 'quiet-edge').map(context => context.entityId)),
    });
    const result = {
        schema: DISTRICT_BLOCK_COMPOSITION_SCHEMA,
        id: compositionId,
        worldId,
        seed: blockSeed,
        district,
        block: Object.freeze(block),
        hierarchy,
        buildings: buildingContexts,
        stats: Object.freeze({
            buildings: contexts.length,
            anchorBuildings: anchorId ? 1 : 0,
            secondaryLandmarks: secondaryIds.size,
            spectacleCandidates: hierarchy.spectacleBuildingIds.length,
            commercialFrontages: hierarchy.commercialBuildingIds.length,
            serviceEdges: hierarchy.serviceBuildingIds.length,
            quietEdges: hierarchy.quietBuildingIds.length,
            queueOrderIndependent: true,
            ownsGeometry: false,
            ownsPropCounts: false,
            ownsPublication: false,
        }),
    };
    return Object.freeze(result);
}

export function districtContextForEntity(composition, entityId) {
    if (!composition || entityId == null) return null;
    return composition.buildings?.[String(entityId)] ?? null;
}

export function attachDistrictBlockComposition(payload, composition) {
    if (!payload || !composition) return composition;
    payload.districtBlockComposition = composition;
    for (const entity of payload.entities ?? []) {
        const context = districtContextForEntity(composition, entity.id);
        if (!context) continue;
        entity.districtCompositionId = composition.id;
        entity.districtComposition = context;
    }
    return composition;
}

export function districtBuildingPolicyForEntity(entity) {
    const context = entity?.districtComposition ?? null;
    if (!context) return Object.freeze({ programHint: null, blockRole: null, frontageCharacter: null, courtyardBias: null, bridgePressure: null });
    return Object.freeze({
        compositionId: context.compositionId ?? null,
        programHint: context.buildingProgramHint ?? roleProgramHint(entity, context.blockRole) ?? null,
        blockRole: context.blockRole ?? null,
        frontageCharacter: context.frontageCharacter ?? null,
        courtyardBias: context.courtyardVoidTendency ?? null,
        bridgePressure: context.bridgePressure ?? null,
        rooflineTarget: context.rooflineTarget ?? null,
        semanticFamilyHint: context.semanticFamilyHint ?? null,
    });
}

export function districtExteriorPolicyForEntity(entity) {
    const context = entity?.districtComposition ?? null;
    const hints = context?.exteriorHints ?? null;
    if (!context) return Object.freeze({
        compositionId: null,
        styleBiases: Object.freeze([]),
        spectaclePriority: 0,
        spectacleCorridor: false,
        facadeSemanticFamily: null,
        roofSemanticFamily: null,
        servicePressure: 0,
        commercialPressure: 0,
        quietPressure: 0,
        mechanicalPressure: 0,
    });
    return Object.freeze({
        compositionId: context.compositionId ?? null,
        blockRole: context.blockRole ?? null,
        styleBiases: hints?.styleBiases ?? Object.freeze([]),
        spectaclePriority: finite(context.spectaclePriority),
        spectacleCorridor: !!context.spectacleCorridor,
        anchor: !!context.anchor,
        secondaryLandmark: !!context.secondaryLandmark,
        facadeSemanticFamily: hints?.facadeSemanticFamily ?? null,
        roofSemanticFamily: hints?.roofSemanticFamily ?? null,
        servicePressure: finite(context.servicePressure),
        commercialPressure: finite(context.commercialPressure),
        quietPressure: finite(context.quietPressure),
        mechanicalPressure: finite(context.mechanicalPressure),
        bridgePressure: finite(context.bridgePressure),
        frontageCharacter: context.frontageCharacter ?? null,
        rooflineTarget: context.rooflineTarget ?? null,
    });
}
