// Placement truth is deliberately separate from collision/climbability.
// Default: an asset cannot support procedural props unless explicitly opted in here.

const SUPPORT_FAMILIES = Object.freeze([
    ['interior/table_', 'tabletop'],
    ['interior/desk_', 'desktop'],
    ['systems_workshop/workbench_', 'work-surface'],
    ['systems_workshop/server_bench_', 'work-surface'],
    ['art_gallery/pedestal_', 'display-top'],
]);

const EXPLICIT_NON_SUPPORT_FAMILIES = Object.freeze([
    'street/bench_',
    'art_gallery/gallery_bench_',
    'interior/couch_',
    'interior/shelf_',
    'interior/cabinet_',
    'systems_workshop/tool_chest_',
    'art_gallery/display_case_',
    'street/trash_can_',
    'trash_climbable/',
    'rooftop/hvac_',
    'rooftop/cooling_unit_',
    'rooftop/duct_cluster_',
    'industrial/generator_',
    'industrial/compressor_',
    'industrial/drum_cluster_',
    'industrial/ibc_tank_',
    'industrial/cable_spool_',
    'vegetation/planter_',
    'vegetation/roof_garden_',
    'as400_archive/workstation_',
    'as400_archive/operator_console_',
    'as400_archive/line_printer_',
]);

function startsWithAny(id, prefixes) {
    return prefixes.some(prefix => id.startsWith(prefix));
}

export function cityAssetPlacementMetadata(def) {
    const id = String(def?.id ?? '');
    const result = {
        mount: def?.mount ?? 'ground',
        placementAffinity: [],
        canSupportProps: false,
        supportSurfaces: [],
    };

    for (const [prefix, role] of SUPPORT_FAMILIES) {
        if (!id.startsWith(prefix)) continue;
        result.canSupportProps = true;
        result.supportSurfaces = [{ id: 'top', role }];
        break;
    }

    // These explicit negatives document common false-positive shapes. They are
    // climbable/collidable/displayable as authored, but are not generic tables.
    if (startsWithAny(id, EXPLICIT_NON_SUPPORT_FAMILIES)) {
        result.canSupportProps = false;
        result.supportSurfaces = [];
    }

    if (id.startsWith('industrial/electrical_cabinet_')) {
        result.placementAffinity = ['wall-adjacent'];
    }

    return result;
}
