export const FRONTAGE_BINDING_SCHEMA = 'jweb.frontage-semantic-binding.v1';
export const FRONTAGE_CONTENT_CONTEXT_SCHEMA = 'jweb.frontage-content-context.v1';

const EPS = 1e-6;

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clean(value) {
    return String(value ?? '').trim();
}

function normalizedToken(value, fallback = '') {
    const token = clean(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return token || fallback;
}

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function stableHash(prefix, parts) {
    return `${prefix}:${hash32(parts.map(part => String(part ?? '')).join('|')).toString(16).padStart(8, '0')}`;
}

function entityMap(payload) {
    return new Map((payload?.entities ?? []).map(entity => [String(entity.id), entity]));
}

function semanticSpaceOverlayMap(payload) {
    return new Map((payload?.semanticSpaces ?? []).map(space => [String(space.id), space]));
}

function canonicalSpacesForEntity(entity, overlays) {
    const planned = Array.isArray(entity?.buildingPlan?.topologySpaces)
        ? entity.buildingPlan.topologySpaces
        : [];
    if (planned.length) {
        return planned.map(space => {
            const overlay = overlays.get(String(space.id));
            return overlay ? {
                ...space,
                program: overlay.program ?? space.program ?? space.semanticProgram ?? null,
                requestedProgram: overlay.requestedProgram ?? space.requestedProgram ?? overlay.program ?? space.semanticProgram ?? null,
                connectorIds: [...new Set([...(space.connectorIds ?? []), ...(overlay.connectorIds ?? [])])],
                destinationId: overlay.destinationId ?? space.destinationId ?? null,
            } : space;
        });
    }
    return [...overlays.values()].filter(space => String(space.entityId ?? '') === String(entity?.id ?? ''));
}

function regionBounds(region) {
    if (!region) return null;
    const minX = Number.isFinite(region.minX) ? region.minX : finite(region.cx) - finite(region.halfX);
    const maxX = Number.isFinite(region.maxX) ? region.maxX : finite(region.cx) + finite(region.halfX);
    const minZ = Number.isFinite(region.minZ) ? region.minZ : finite(region.cz) - finite(region.halfZ);
    const maxZ = Number.isFinite(region.maxZ) ? region.maxZ : finite(region.cz) + finite(region.halfZ);
    return { minX, maxX, minZ, maxZ };
}

function spaceRegions(space) {
    const regions = (space?.regions ?? []).map(regionBounds).filter(Boolean);
    if (regions.length) return regions;
    const bounds = space?.bounds;
    return bounds ? [regionBounds(bounds)] : [];
}

function distanceToRect(point, rect) {
    const dx = point.x < rect.minX ? rect.minX - point.x : point.x > rect.maxX ? point.x - rect.maxX : 0;
    const dz = point.z < rect.minZ ? rect.minZ - point.z : point.z > rect.maxZ ? point.z - rect.maxZ : 0;
    return Math.hypot(dx, dz);
}

function distanceToSpace(point, space) {
    let best = Infinity;
    for (const region of spaceRegions(space)) best = Math.min(best, distanceToRect(point, region));
    return best;
}

function verticalDistance(y, space) {
    const bounds = space?.bounds ?? {};
    const yMin = Number.isFinite(bounds.yMin) ? bounds.yMin : finite(space?.yBase);
    const yMax = Number.isFinite(bounds.yMax) ? bounds.yMax : yMin + Math.max(0.1, finite(space?.floorH, 3.15));
    if (y >= yMin - EPS && y <= yMax + EPS) return 0;
    return y < yMin ? yMin - y : y - yMax;
}

function inwardPoint(surface, point = null) {
    const source = point ?? surface ?? {};
    const outward = 0.22;
    return {
        x: finite(source.x, finite(surface?.x)) - finite(surface?.normalX) * outward,
        z: finite(source.z, finite(surface?.z)) - finite(surface?.normalZ) * outward,
        y: finite(source.y, finite(surface?.yMin) + 1.6),
    };
}

function modulePenalty(surface, space) {
    const key = surface?.moduleKey;
    if (!key) return 0;
    if (space?.moduleKey === key || space?.moduleKeys?.includes?.(key)) return 0;
    return 3;
}

function spaceScore(surface, point, space) {
    const vertical = verticalDistance(point.y, space);
    const distance = distanceToSpace(point, space);
    return vertical * 1000 + distance * 100 + modulePenalty(surface, space);
}

function selectSpaceForSurface(surface, point, spaces) {
    if (!surface || !spaces?.length) return null;
    const inward = inwardPoint(surface, point);
    return [...spaces]
        .map(space => ({ space, score: spaceScore(surface, inward, space) }))
        .sort((a, b) => a.score - b.score || String(a.space.id).localeCompare(String(b.space.id)))[0]?.space ?? null;
}

function spaceProgram(space, entity) {
    return space?.program
        ?? space?.semanticProgram
        ?? entity?.buildingPlan?.semanticProgram
        ?? entity?.semanticProgram
        ?? entity?.program
        ?? null;
}

function classifyFrontage(space, entity) {
    const role = normalizedToken(space?.role);
    const type = normalizedToken(space?.spaceType);
    const program = normalizedToken(spaceProgram(space, entity));
    const privacy = normalizedToken(space?.privacy);
    const haystack = `${role} ${type} ${program} ${privacy}`;

    if (/mechanic|utility|plant|boiler|service|storage|loading|industrial|workshop/.test(haystack)) {
        return { frontageRole: /mechanic|utility|plant|boiler/.test(haystack) ? 'mechanical-service' : 'service', publicRole: 'service' };
    }
    if (/retail|shop|store|market|mercantile|restaurant|food|bar|cafe/.test(haystack)) {
        return { frontageRole: 'storefront', publicRole: 'public' };
    }
    if (role === 'entry' || /lobby|foyer|reception|entrance/.test(haystack)) {
        return { frontageRole: 'public-entry', publicRole: 'public' };
    }
    if (role === 'public' || /institution|assembly|civic|office|business|public/.test(haystack)) {
        return { frontageRole: 'public-frontage', publicRole: 'public' };
    }
    if (/residential|lodging|apartment|dwelling|bedroom/.test(haystack)) {
        return { frontageRole: 'residential', publicRole: privacy === 'public' ? 'public' : 'residential' };
    }
    if (role === 'private' || role === 'circulation' || privacy === 'private') {
        return { frontageRole: 'private', publicRole: 'private' };
    }
    if (role === 'shared') return { frontageRole: 'shared', publicRole: 'semi-public' };
    return { frontageRole: 'mixed-frontage', publicRole: privacy || 'mixed' };
}

function destinationForSpace(destinations, spaceId) {
    return (destinations ?? []).find(destination => String(destination.spaceId ?? '') === String(spaceId ?? '')) ?? null;
}

function tangentForSurface(surface) {
    return Math.abs(finite(surface?.normalX)) > 0.5 ? { x: 0, z: 1 } : { x: 1, z: 0 };
}

function opportunityU(surface, opportunity) {
    if (Number.isFinite(opportunity?.u)) return opportunity.u;
    const tangent = tangentForSurface(surface);
    return (finite(opportunity?.transform?.x, finite(surface?.x)) - finite(surface?.x)) * tangent.x
        + (finite(opportunity?.transform?.z, finite(surface?.z)) - finite(surface?.z)) * tangent.z;
}

function entranceRelationship(surface, opportunity, apertures) {
    const candidates = (apertures ?? []).filter(aperture => aperture?.traversable && String(aperture.surfaceId ?? '') === String(surface?.id ?? ''));
    if (!candidates.length) return { relation: 'none', apertureId: null, connectorId: null, distance: null };
    const u = opportunityU(surface, opportunity);
    const nearest = candidates.map(aperture => {
        const center = (finite(aperture.uMin) + finite(aperture.uMax)) * 0.5;
        return { aperture, distance: Math.abs(u - center) };
    }).sort((a, b) => a.distance - b.distance || String(a.aperture.id).localeCompare(String(b.aperture.id)))[0];
    return {
        relation: nearest.distance <= 2.2 ? 'adjacent' : 'same-surface',
        apertureId: nearest.aperture.id ?? null,
        connectorId: nearest.aperture.connectorId ?? null,
        distance: Math.round(nearest.distance * 1000) / 1000,
    };
}

function buildingIdentity(entity) {
    return {
        buildingId: entity?.id ?? null,
        buildingPlanId: entity?.buildingPlan?.deterministicKey ?? entity?.buildingPlan?.id ?? null,
        buildingPlanFingerprint: entity?.buildingPlan?.fingerprint ?? null,
        physicalUseFamily: entity?.physicalUse?.family ?? null,
        archetype: entity?.archetype ?? null,
        landmark: entity?.kind === 'district-landmark',
    };
}

function buildingCampaignKey(entity, district) {
    const identity = buildingIdentity(entity);
    return stableHash('frontage-campaign', [
        district?.id ?? district?.chunkKey ?? '',
        identity.buildingId ?? '',
        identity.buildingPlanId ?? identity.buildingPlanFingerprint ?? '',
        identity.physicalUseFamily ?? '',
        identity.archetype ?? '',
        identity.landmark ? 'landmark' : 'building',
    ]);
}

function compactSpaceDescriptor(space, entity, destination) {
    if (!space) return null;
    const program = spaceProgram(space, entity);
    return {
        id: space.id ?? null,
        role: space.role ?? null,
        spaceType: space.spaceType ?? null,
        program,
        requestedProgram: space.requestedProgram ?? program,
        privacy: space.privacy ?? null,
        floor: Number.isFinite(space.floor) ? space.floor : null,
        destinationId: destination?.id ?? space.destinationId ?? null,
        connectorIds: [...(space.connectorIds ?? [])],
    };
}

function bindingForSurface({ surface, opportunity = null, entity, spaces, apertures, destinations, district, point = null }) {
    const sourcePoint = point ?? opportunity?.transform ?? surface;
    const space = selectSpaceForSurface(surface, sourcePoint, spaces);
    const destination = destinationForSpace(destinations, space?.id);
    const role = classifyFrontage(space, entity);
    const identity = buildingIdentity(entity);
    const compactSpace = compactSpaceDescriptor(space, entity, destination);
    const campaignKey = buildingCampaignKey(entity, district);
    const entrance = entranceRelationship(surface, opportunity ?? sourcePoint, apertures);
    const bindingKey = stableHash('frontage-binding', [
        identity.buildingId,
        surface?.id,
        opportunity?.id,
        compactSpace?.id,
        role.frontageRole,
        campaignKey,
    ]);
    return {
        schema: FRONTAGE_BINDING_SCHEMA,
        bindingKey,
        campaignKey,
        opportunityId: opportunity?.id ?? null,
        surfaceId: surface?.id ?? null,
        side: surface?.side ?? null,
        exposure: surface?.exposure ?? null,
        building: identity,
        district: {
            id: district?.id ?? null,
            family: district?.family ?? district?.districtFamily ?? null,
            chunkKey: district?.chunkKey ?? null,
        },
        space: compactSpace,
        frontageRole: role.frontageRole,
        publicRole: role.publicRole,
        entrance,
        source: 'planned-interior-adjacency',
    };
}

function surfaceForSegment(segment, surfaceById) {
    return surfaceById.get(String(segment?.surfaceId ?? '')) ?? null;
}

function aggregateOpportunityBinding({ opportunity, entity, spaces, surfaces, apertures, destinations, district }) {
    const surfaceById = new Map((surfaces ?? []).map(surface => [String(surface.id), surface]));
    const segmentBindings = [];
    for (const segment of opportunity?.segments ?? []) {
        const surface = surfaceForSegment(segment, surfaceById);
        if (!surface) continue;
        segmentBindings.push(bindingForSurface({
            surface,
            opportunity,
            entity,
            spaces,
            apertures,
            destinations,
            district,
            point: segment.transform ?? opportunity.transform,
        }));
    }

    const primarySurface = surfaceById.get(String(opportunity?.surfaceId ?? ''))
        ?? segmentBindings.map(binding => surfaceById.get(String(binding.surfaceId))).find(Boolean)
        ?? null;
    if (!segmentBindings.length && primarySurface) {
        segmentBindings.push(bindingForSurface({ surface: primarySurface, opportunity, entity, spaces, apertures, destinations, district }));
    }
    if (!segmentBindings.length) {
        // Roof/ground opportunities may intentionally have no facade surface. They
        // still inherit existing building/room truth for media/content context.
        const point = opportunity?.transform ?? opportunity?.bounds ?? { x: 0, y: 0, z: 0 };
        const space = [...spaces]
            .map(candidate => ({
                space: candidate,
                score: verticalDistance(finite(point.y), candidate) * 1000
                    + distanceToSpace({ x: finite(point.x), z: finite(point.z) }, candidate) * 100,
            }))
            .sort((a, b) => a.score - b.score || String(a.space.id).localeCompare(String(b.space.id)))[0]?.space ?? null;
        if (!space) return null;
        const destination = destinationForSpace(destinations, space.id);
        const role = classifyFrontage(space, entity);
        const identity = buildingIdentity(entity);
        const compactSpace = compactSpaceDescriptor(space, entity, destination);
        const campaignKey = buildingCampaignKey(entity, district);
        segmentBindings.push({
            schema: FRONTAGE_BINDING_SCHEMA,
            bindingKey: stableHash('frontage-binding', [identity.buildingId, opportunity?.id, compactSpace?.id, role.frontageRole, campaignKey]),
            campaignKey,
            opportunityId: opportunity?.id ?? null,
            surfaceId: null,
            side: null,
            exposure: null,
            building: identity,
            district: { id: district?.id ?? null, family: district?.family ?? district?.districtFamily ?? null, chunkKey: district?.chunkKey ?? null },
            space: compactSpace,
            frontageRole: role.frontageRole,
            publicRole: role.publicRole,
            entrance: { relation: 'none', apertureId: null, connectorId: null, distance: null },
            source: 'planned-interior-nearest',
        });
    }

    const ordered = [...segmentBindings].sort((a, b) => String(a.surfaceId ?? '').localeCompare(String(b.surfaceId ?? '')));
    const primary = ordered[0];
    const uniqueSpaceIds = [...new Set(ordered.map(binding => binding.space?.id).filter(Boolean))];
    const uniqueRoles = [...new Set(ordered.map(binding => binding.frontageRole).filter(Boolean))];
    const aggregateKey = stableHash('frontage-binding', [
        opportunity?.id,
        primary.campaignKey,
        ...ordered.flatMap(binding => [binding.surfaceId, binding.space?.id, binding.frontageRole]),
    ]);
    return {
        ...primary,
        bindingKey: aggregateKey,
        opportunityId: opportunity?.id ?? null,
        surfaceIds: ordered.map(binding => binding.surfaceId),
        spaceIds: uniqueSpaceIds,
        frontageRoles: uniqueRoles,
        surfaceBindings: ordered,
        multiSurface: ordered.length > 1,
    };
}

export function frontageContentContextFromBinding(binding) {
    if (!binding) return null;
    const space = binding.space ?? null;
    return {
        schema: FRONTAGE_CONTENT_CONTEXT_SCHEMA,
        bindingKey: binding.bindingKey ?? null,
        campaignKey: binding.campaignKey ?? null,
        buildingId: binding.building?.buildingId ?? null,
        buildingPlanId: binding.building?.buildingPlanId ?? null,
        buildingPlanFingerprint: binding.building?.buildingPlanFingerprint ?? null,
        physicalUseFamily: binding.building?.physicalUseFamily ?? null,
        archetype: binding.building?.archetype ?? null,
        landmark: !!binding.building?.landmark,
        districtId: binding.district?.id ?? null,
        districtFamily: binding.district?.family ?? null,
        spaceId: space?.id ?? null,
        spaceIds: [...(binding.spaceIds ?? (space?.id ? [space.id] : []))],
        destinationId: space?.destinationId ?? null,
        program: space?.program ?? null,
        programs: [...new Set((binding.surfaceBindings ?? [binding]).map(item => item.space?.program).filter(Boolean))],
        requestedProgram: space?.requestedProgram ?? space?.program ?? null,
        spaceRole: space?.role ?? null,
        spaceType: space?.spaceType ?? null,
        privacy: space?.privacy ?? null,
        frontageRole: binding.frontageRole ?? null,
        frontageRoles: [...(binding.frontageRoles ?? (binding.frontageRole ? [binding.frontageRole] : []))],
        publicRole: binding.publicRole ?? null,
        entranceRelationship: binding.entrance?.relation ?? 'none',
        entranceApertureId: binding.entrance?.apertureId ?? null,
        multiSurface: !!binding.multiSurface,
    };
}

export function bindFrontageSemanticTruth({
    payload,
    district,
    surfaces = [],
    apertures = [],
    opportunities = [],
    destinations = [],
} = {}) {
    const entities = entityMap(payload);
    const overlays = semanticSpaceOverlayMap(payload);
    const spacesByEntity = new Map();
    const getSpaces = entity => {
        const key = String(entity?.id ?? '');
        if (!spacesByEntity.has(key)) spacesByEntity.set(key, canonicalSpacesForEntity(entity, overlays));
        return spacesByEntity.get(key);
    };

    const bindings = [];
    let boundSurfaces = 0;
    let boundOpportunities = 0;
    let multiSurfaceOpportunities = 0;

    for (const surface of surfaces ?? []) {
        const entity = entities.get(String(surface?.entityId ?? ''));
        if (!entity) continue;
        const spaces = getSpaces(entity);
        if (!spaces.length) continue;
        const binding = bindingForSurface({ surface, entity, spaces, apertures, destinations, district });
        surface.frontageBinding = binding;
        surface.frontageContentContext = frontageContentContextFromBinding(binding);
        bindings.push(binding);
        boundSurfaces++;
    }

    for (const opportunity of opportunities ?? []) {
        const entityId = String(opportunity?.entityId ?? opportunity?.hostId ?? '');
        const entity = entities.get(entityId);
        if (!entity) continue;
        const spaces = getSpaces(entity);
        if (!spaces.length) continue;
        const binding = aggregateOpportunityBinding({ opportunity, entity, spaces, surfaces, apertures, destinations, district });
        if (!binding) continue;
        opportunity.frontageBinding = binding;
        opportunity.frontageContentContext = frontageContentContextFromBinding(binding);
        bindings.push(binding);
        boundOpportunities++;
        if (binding.multiSurface) multiSurfaceOpportunities++;
    }

    return {
        schema: FRONTAGE_BINDING_SCHEMA,
        bindings,
        stats: {
            bindings: bindings.length,
            boundSurfaces,
            boundOpportunities,
            multiSurfaceOpportunities,
            ownsQuantity: false,
            ownsReservations: false,
            ownsTopology: false,
        },
    };
}
