// A broad, real corpus for tools/target-report/sweep.mjs. Every entry is
// either a `kind` value pulled straight from vendor/city-pack/asset-catalog.js
// (see the comment block below for how to regenerate) or a circulation/media
// label actually observed in real JWEB output (exterior-debug-snapshot
// surfaceKinds, spawn-proof hangout labels, GPT-ENTRYPOINT.md examples) - not
// guessed. Sweeping this against a real running city over time answers "what
// does this label actually find, and when" empirically, which is the point.
//
// Regenerate the asset-catalog slice with:
//   node -e "import('./vendor/city-pack/asset-catalog.js').then(m => console.log(JSON.stringify([...new Set(m.CLAUDE_CITY_ASSETS.map(a=>a.kind))].sort())))"

export const CORPUS = [
    // circulation / structural - observed in exterior-debug-snapshot and GPT-ENTRYPOINT.md
    'stair', 'compound-stair', 'catwalk', 'guarded-catwalk', 'hanging-bridge',
    'transport-junction', 'clear-roof-street-layer',
    // asset-catalog kinds: circulation/access hardware
    'fire_escape', 'ladder', 'landing', 'railing', 'parapet', 'window_bay', 'doorway_module',
    // spawn-proof hangout label observed in a real boot log ("hangout=super-big-shelter:television")
    'television', 'crt_terminal', 'operator_console',
    // asset-catalog kinds: street / exterior props
    'trash_can', 'trash_bag_pile', 'bollard', 'bench', 'bus_stop', 'bike_rack',
    'street_lamp', 'hydrant', 'parking_meter', 'traffic_cone', 'street_tree',
    // asset-catalog kinds: industrial / utility (roof + mechanical)
    'hvac', 'generator', 'pump', 'compressor', 'duct_cluster', 'antenna',
    'satellite_dish', 'water_tank', 'vent_turbine', 'exhaust_stack',
    // asset-catalog kinds: interior furniture
    'desk', 'workbench', 'server_bench', 'shelf', 'locker_bank', 'crate_stack', 'workstation',
];
