import {
    EXTERIOR_VISUAL_TIER,
    exteriorTaskVisualImpact,
    exteriorTaskVisualTier,
} from './exterior-spectacle-priority.js';

export const EXTERIOR_COMPOSITION_SCHEMA = 'jweb.exterior-composition-authority.v1';

const MANAGED_BUILDING_EXTERIOR_KINDS = new Set([
    'sign', 'awning', 'graffiti', 'flyer', 'pipe', 'ivy', 'security',
    'elevator-hardware', 'street-fixture', 'roof-clutter', 'roof-topper',
    'spray-cans', 'semantic-context-prop', 'exterior-prop-field',
]);


const MEDIA_CURRENCIES = Object.freeze(['CREDITS', 'TOKENS', 'MARKS', 'DINAR', 'YEN', 'UNITS', 'GUILDERS', 'SCRIP']);

function rngForSeed(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function attachSpectacleMedia({ chunk, tasks = [], pairFor = null } = {}) {
    const chunkKey = String(chunk?.key ?? 'world');
    let surfaces = 0;
    let assemblies = 0;
    for (const task of tasks ?? []) {
        if (task?.kind !== 'exterior-prop-field' || exteriorTaskVisualTier(task) !== 'spectacle') continue;
        const placements = task?.fieldPlan?.placements ?? [];
        const screenPlacements = placements.filter(item => item?.shape === 'box' && /megascreen/i.test(String(item?.assemblyKind ?? '')));
        if (!screenPlacements.length) continue;
        const seed = hash32(`${chunkKey}:${entityIdOf(task)}:${task.seed ?? 0}:megascreen-media`);
        const rng = rngForSeed(seed);
        const requested = typeof pairFor === 'function' ? pairFor({ task, seed, rng }) : null;
        const title = String(requested?.[0] ?? requested?.title ?? 'PUBLIC SIGNAL').trim() || 'PUBLIC SIGNAL';
        const subtitleBase = String(requested?.[1] ?? requested?.subtitle ?? 'INDEX TRANSMISSION').trim() || 'INDEX TRANSMISSION';
        const value = 12 + Math.floor(rng() * 9987);
        const currency = MEDIA_CURRENCIES[Math.floor(rng() * MEDIA_CURRENCIES.length) % MEDIA_CURRENCIES.length];
        const subtitle = `${subtitleBase} · ${value} ${currency}`;
        const assemblyIds = new Set();
        for (let ordinal = 0; ordinal < screenPlacements.length; ordinal++) {
            const placement = screenPlacements[ordinal];
            placement.media = {
                kind: 'advertisement',
                title,
                subtitle,
                seed: (seed + ordinal) >>> 0,
                entityId: entityIdOf(task),
                assemblyId: placement.assemblyId ?? null,
            };
            if (placement.assemblyId) assemblyIds.add(placement.assemblyId);
            surfaces++;
        }
        assemblies += Math.max(1, assemblyIds.size);
        task.mediaSurfaceCount = screenPlacements.length;
        task.mediaAssemblyCount = Math.max(1, assemblyIds.size);
    }
    return { assemblies, surfaces };
}

const NORMAL_TIER_CAPS = Object.freeze({ spectacle: 0, identity: 2, macro: 2, medium: 2, micro: 1 });
const SPECTACLE_TIER_CAPS = Object.freeze({ spectacle: 1, identity: 1, macro: 1, medium: 1, micro: 0 });

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

function entityIdOf(task) {
    const value = task?.entityId;
    return value == null ? '' : String(value);
}

function buildingEntityMap(payload) {
    const map = new Map();
    for (const entity of payload?.entities ?? []) {
        if (entity?.kind !== 'building' && entity?.kind !== 'district-landmark') continue;
        map.set(String(entity.id), entity);
    }
    return map;
}

function managedBuildingExterior(task, buildings) {
    const entityId = entityIdOf(task);
    return buildings.has(entityId) && MANAGED_BUILDING_EXTERIOR_KINDS.has(String(task?.kind ?? ''));
}

function taskSurfaceKeys(task) {
    const keys = new Set();
    if (task?.semanticHostId) keys.add(String(task.semanticHostId));
    if (task?.surfaceId) keys.add(String(task.surfaceId));
    if (task?.semanticPlacement?.surfaceId) keys.add(String(task.semanticPlacement.surfaceId));
    for (const placement of task?.fieldPlan?.placements ?? []) {
        if (placement?.surfaceId) keys.add(String(placement.surfaceId));
        for (const id of placement?.spectacleSurfaceIds ?? []) if (id) keys.add(String(id));
    }
    return keys;
}

function intersectsClaimedSurface(task, claimedSurfaceIds) {
    if (!claimedSurfaceIds?.size) return false;
    for (const key of taskSurfaceKeys(task)) if (claimedSurfaceIds.has(key)) return true;
    return false;
}

function candidateScore(entry) {
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const impact = Math.max(0, exteriorTaskVisualImpact(task));
    let score = impact * 10;
    if (entry.wasFirstPass) score += 8;
    if (entry.source === 'field') score += tier === 'macro' ? 14 : 8;
    else if (entry.source === 'authored') score += 7;
    else score += 2;
    if (task.kind === 'sign') score += 30;
    if (task.semanticOpportunityRole === 'facade-sign-zone') score += 10;
    if (task.kind === 'roof-topper') score += 4;
    return score;
}

function anchorScore(entry) {
    const task = entry.task;
    const tier = exteriorTaskVisualTier(task);
    const tierRank = EXTERIOR_VISUAL_TIER[tier] ?? EXTERIOR_VISUAL_TIER.medium;
    let score = 100 - tierRank * 18 + Math.min(25, exteriorTaskVisualImpact(task));
    if (task.kind === 'sign') score += 30;
    if (task.kind === 'exterior-prop-field' && tier === 'spectacle') score += 80;
    if (task.semanticOpportunityRole === 'facade-sign-zone') score += 10;
    return score;
}

function stableEntryCompare(chunkKey, a, b) {
    const scoreDiff = candidateScore(b) - candidateScore(a);
    if (scoreDiff) return scoreDiff;
    const hashA = hash32(`${chunkKey}:${a.source}:${entityIdOf(a.task)}:${a.task.kind}:${a.task.seed ?? 0}:${a.task.semanticOpportunityId ?? ''}`);
    const hashB = hash32(`${chunkKey}:${b.source}:${entityIdOf(b.task)}:${b.task.kind}:${b.task.seed ?? 0}:${b.task.semanticOpportunityId ?? ''}`);
    return hashA - hashB || String(a.task.kind).localeCompare(String(b.task.kind));
}

function bestSpectaclePerEntity(chunkKey, groups, buildings) {
    const best = [];
    for (const [entityId, entries] of groups) {
        const spectacles = entries
            .filter(entry => exteriorTaskVisualTier(entry.task) === 'spectacle')
            .sort((a, b) => stableEntryCompare(chunkKey, a, b));
        if (!spectacles.length) continue;
        const entity = buildings.get(entityId);
        best.push({
            entityId,
            entry: spectacles[0],
            landmark: entity?.kind === 'district-landmark' ? 1 : 0,
            impact: exteriorTaskVisualImpact(spectacles[0].task),
            rank: hash32(`${chunkKey}:${entityId}:spectacle-choice`),
        });
    }
    best.sort((a, b) => b.landmark - a.landmark || b.impact - a.impact || a.rank - b.rank || a.entityId.localeCompare(b.entityId));
    return best;
}

function chooseSpectacleEntities(chunkKey, groups, buildings) {
    const eligible = bestSpectaclePerEntity(chunkKey, groups, buildings);
    if (!eligible.length) return { eligible, selected: new Map(), quota: 0 };
    const quota = Math.min(eligible.length, Math.min(4, Math.max(2, Math.ceil(eligible.length * 0.22))));
    const selected = new Map(eligible.slice(0, quota).map(item => [item.entityId, item.entry]));
    return { eligible, selected, quota };
}

function selectEntityEntries(chunkKey, entityId, entries, selectedSpectacleEntry) {
    const selected = [];
    const selectedSet = new Set();
    const claimedSurfaceIds = new Set();
    const isSpectacleEntity = !!selectedSpectacleEntry;
    const caps = isSpectacleEntity ? SPECTACLE_TIER_CAPS : NORMAL_TIER_CAPS;

    if (selectedSpectacleEntry) {
        selected.push(selectedSpectacleEntry);
        selectedSet.add(selectedSpectacleEntry);
        for (const key of taskSurfaceKeys(selectedSpectacleEntry.task)) claimedSurfaceIds.add(key);
    }

    for (const tier of ['identity', 'macro', 'medium', 'micro']) {
        const cap = caps[tier] ?? 0;
        if (!(cap > 0)) continue;
        const pool = entries
            .filter(entry => !selectedSet.has(entry) && exteriorTaskVisualTier(entry.task) === tier)
            .filter(entry => !intersectsClaimedSurface(entry.task, claimedSurfaceIds))
            .sort((a, b) => stableEntryCompare(`${chunkKey}:${entityId}:${tier}`, a, b));
        for (const entry of pool.slice(0, cap)) {
            selected.push(entry);
            selectedSet.add(entry);
        }
    }

    // If the building somehow has no identity/macro candidate, preserve one real
    // medium object rather than letting a planning gap produce a completely blank shell.
    if (!selected.length && entries.length) {
        selected.push([...entries].sort((a, b) => stableEntryCompare(`${chunkKey}:${entityId}:fallback`, a, b))[0]);
    }

    return selected;
}

function assignSingleCoverageAnchor(entries, selectedSpectacleEntry) {
    for (const entry of entries) {
        entry.task.firstPassBundle = false;
        if (entry.task.firstPassClass && entry.task.firstPassClass !== 'hidden') entry.task.firstPassClass = 'composition-deep';
    }
    if (!entries.length) return null;
    let anchor = selectedSpectacleEntry && entries.includes(selectedSpectacleEntry) ? selectedSpectacleEntry : null;
    if (!anchor) {
        anchor = [...entries].sort((a, b) => {
            const score = anchorScore(b) - anchorScore(a);
            return score || stableEntryCompare('coverage-anchor', a, b);
        })[0];
    }
    anchor.task.firstPassBundle = true;
    anchor.task.firstPassClass = exteriorTaskVisualTier(anchor.task) === 'spectacle' ? 'spectacle' : 'exterior-composition-anchor';
    return anchor;
}

export function compileExteriorCompositionAuthority({
    chunk,
    payload,
    authoredTasks = [],
    contextualTasks = [],
    fieldTasks = [],
} = {}) {
    if (!chunk || !payload) throw new Error('compileExteriorCompositionAuthority requires chunk and payload');
    const buildings = buildingEntityMap(payload);
    const groups = new Map();
    const untouched = [];
    const add = (task, source) => {
        if (!managedBuildingExterior(task, buildings)) {
            untouched.push(task);
            return;
        }
        const entityId = entityIdOf(task);
        const entry = { task, source, wasFirstPass: !!task.firstPassBundle };
        const group = groups.get(entityId) ?? [];
        group.push(entry);
        groups.set(entityId, group);
    };
    for (const task of authoredTasks ?? []) add(task, 'authored');
    for (const task of contextualTasks ?? []) add(task, 'context');
    for (const task of fieldTasks ?? []) add(task, 'field');

    const spectacle = chooseSpectacleEntities(String(chunk.key ?? 'world'), groups, buildings);
    const accepted = [];
    const acceptedEntries = [];
    const perEntity = {};

    for (const [entityId, entries] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const selectedSpectacleEntry = spectacle.selected.get(entityId) ?? null;
        const selected = selectEntityEntries(String(chunk.key ?? 'world'), entityId, entries, selectedSpectacleEntry);
        assignSingleCoverageAnchor(selected, selectedSpectacleEntry);
        for (const entry of selected) {
            accepted.push(entry.task);
            acceptedEntries.push(entry);
        }
        const tierCounts = { spectacle: 0, identity: 0, macro: 0, medium: 0, micro: 0 };
        for (const entry of selected) tierCounts[exteriorTaskVisualTier(entry.task)]++;
        perEntity[entityId] = {
            candidates: entries.length,
            accepted: selected.length,
            rejected: Math.max(0, entries.length - selected.length),
            spectacle: !!selectedSpectacleEntry,
            tierCounts,
        };
    }

    const acceptedSet = new Set(acceptedEntries);
    const candidateCount = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
    const contextAccepted = acceptedEntries.filter(entry => entry.source === 'context').length;
    const fieldAccepted = acceptedEntries.filter(entry => entry.source === 'field').length;
    const authoredAccepted = acceptedEntries.filter(entry => entry.source === 'authored').length;
    const anchorCount = acceptedEntries.filter(entry => entry.task.firstPassBundle).length;
    const maxAcceptedPerEntity = Math.max(0, ...Object.values(perEntity).map(item => item.accepted));
    const taskOrder = new Map(acceptedEntries.map((entry, index) => [entry.task, index]));
    accepted.sort((a, b) => {
        const tierA = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(a)] ?? 9;
        const tierB = EXTERIOR_VISUAL_TIER[exteriorTaskVisualTier(b)] ?? 9;
        return tierA - tierB || exteriorTaskVisualImpact(b) - exteriorTaskVisualImpact(a)
            || finite(taskOrder.get(a)) - finite(taskOrder.get(b));
    });

    return {
        schema: EXTERIOR_COMPOSITION_SCHEMA,
        tasks: [...untouched, ...accepted],
        acceptedExteriorTasks: accepted,
        stats: {
            schema: EXTERIOR_COMPOSITION_SCHEMA,
            buildingsManaged: groups.size,
            candidates: candidateCount,
            accepted: accepted.length,
            rejected: Math.max(0, candidateCount - accepted.length),
            coverageAnchors: anchorCount,
            spectacleEligible: spectacle.eligible.length,
            spectacleQuota: spectacle.quota,
            spectacleSelected: spectacle.selected.size,
            contextAccepted,
            fieldAccepted,
            authoredAccepted,
            maxAcceptedPerEntity,
            perEntity,
            singleAuthority: true,
            opportunityGridIsCandidateOnly: true,
        },
    };
}
