#!/usr/bin/env python3
import json, sys
from collections import Counter
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
PACK = ROOT / 'vendor/city-pack/semantic-megapack'
MANIFEST = PACK / 'manifest.json'
TOPOLOGY = PACK / 'smart-topology-v5.json'
VOCAB = PACK / 'tag-vocabulary.json'
PLANNER = PACK / 'planner-contract-v5.json'
TERMS = PACK / 'semantic-term-classification-v5.json'
SEMANTICS = PACK / 'planner-semantics-v5.json'
ROOM_RECIPES = PACK / 'room-recipes.json'
ROOM_RECIPES_JS = PACK / 'room-recipes.js'
DENSITY = PACK / 'prop-density-policy-v5.json'

manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
topology = json.loads(TOPOLOGY.read_text(encoding='utf-8'))
vocab = json.loads(VOCAB.read_text(encoding='utf-8'))
assets = manifest['assets']
room_recipe_doc = json.loads(ROOM_RECIPES.read_text(encoding='utf-8'))
room_recipes = room_recipe_doc.get('recipes', [])
traversal_recipes = room_recipe_doc.get('traversalRecipes', [])

IMPLEMENTED = {
    'roles': set(),
    'capabilities': {'support-surface-provider'},
    'requirements': {'support-surface'},
    'relationships': {
        'faces-work-or-social-surface', 'row-alignable', 'sits-on-work-surface',
        'utility-zone-compatible', 'wall-anchored',
    },
    'reservedVolumeTypes': set(),
    'supportModes': {'wall'},
    'landingRoles': set(),
}

HARD_ROLES = {
    'adapter','balcony','catwalk','circulation','circulation-adjacent','edge-guard','escalator',
    'facade-circulation','fire-escape','fire-escape-component','grade-transition','junction','ladder',
    'landing','landing-or-platform','negative-space','portal','portal-adjacent','service-opening',
    'shaft-opening','stair','stair-tower','support-structure','vertical-opening','vertical_transport',
}
HARD_CAPS = {
    'climb','climb-through','connection-break','edge-interruption-provider','edge-opening','guard-edge',
    'height-mismatch-resolver','landing-connector','landing-provider','multi-connection-node','pass-through',
    'portal-consumer','portal-provider','slab-void-provider','story-connector','support-provider',
    'traversal-provider','vertical-portal','walk','walk-through','wall-anchor','wall-void-provider',
}
HARD_REQS = {
    'access-portal-required','access-portals-by-floor-policy','attach-to-exposed-edge','both-ends-connect',
    'both-ends-must-connect','circulation-clear','climb-sweep-clear','connect-to-compatible-shaft-or-circulation',
    'connected-arms-required','customer-side-clear','cut-slab-or-roof-before-collision',
    'cut-structural-void-before-collision','cut-wall-void-before-collision','do-not-use-as-structural-opening',
    'exposed-edges-guarded-unless-connected','facade-support','floor-access-at-top',
    'floor-landings-access-portals','front-circulation','grade-transition',
    'guard-exposed-edges-unless-connected','guard-opening-unless-connected','headroom-clear',
    'host-surface-compatible','landing-circulation-clear','operator-side-clear','service-clearance',
    'side-circulation','slab-void-required','structural-wall-void-before-collision','top-transition-clear',
    'wall-anchor-surface',
}
HARD_RELS = {
    'aligns-story-datum','aligns-story-datums','anchors-load-to-wall','anchors-to-facade',
    'connects-fire-escape-landings','connects-floor-to-dock-or-threshold','connects-floor-to-floor',
    'connects-public-levels','connects-service-and-customer-zones','connects-spaces','connects-to-atrium-edge',
    'connects-to-elevator-shaft','connects-to-freight-shaft','connects-to-stair-shaft',
    'connects-traversal-elements','connects-vertical-spaces','continuous-guard',
    'defines-vehicle-pedestrian-boundary','expects-facade-opening','guards-platform-edge',
    'inherits-portal-story-and-program','interruptible-by-connection','joins-catwalks-or-bridges',
    'ladder_break','marks-service-penetration','mounts-in-wall','portal_break','resolves-edge-interruption',
    'resolves-small-elevation-mismatch','supports-balcony-or-platform','visual-door-noun-only',
}
HARD_SUPPORT = {
    'facade-brackets','facade-brackets-or-slab','landing-both-ends','platform-edge','roof','slab-or-roof',
    'structural-support','structural-surface','structural-surface-or-anchors','wall-surround',
}

CATEGORY_HARD = {
    'roles': HARD_ROLES,
    'capabilities': HARD_CAPS,
    'requirements': HARD_REQS,
    'relationships': HARD_RELS,
    'reservedVolumeTypes': set(vocab.get('reservedVolumeTypes', [])),
    'supportModes': HARD_SUPPORT,
    'landingRoles': set(vocab.get('landingRoles', [])),
}

EXPLANATIONS = {
    'implemented': 'The current live semantic-placement runtime explicitly interprets this token or mode.',
    'advisory': 'The current live runtime may retain this metadata, but does not enforce it as a hard topology/collision obligation.',
    'unsupported-hard-error': 'Ignoring this token can invalidate topology, collision, traversal, structural support, or required clearance. Bulk integration must fail closed until the planner implements it.',
}


def classify(category, token):
    if token in IMPLEMENTED.get(category, set()):
        return 'implemented'
    if token in CATEGORY_HARD.get(category, set()):
        return 'unsupported-hard-error'
    return 'advisory'

term_counts = {k: Counter() for k in ('roles','capabilities','requirements','relationships','reservedVolumeTypes','supportModes','landingRoles')}
for a in assets:
    g = a.get('semanticGraph') or {}
    for k in ('roles','capabilities','requirements','relationships'):
        for t in g.get(k) or []:
            term_counts[k][t] += 1
    for rv in g.get('reservedVolumes') or []:
        if rv.get('type'):
            term_counts['reservedVolumeTypes'][rv['type']] += 1
    sm = (g.get('support') or {}).get('mode')
    if sm: term_counts['supportModes'][sm] += 1
    for lr in (g.get('storySemantics') or {}).get('landingRoles') or []:
        role = lr.get('role')
        if role: term_counts['landingRoles'][role] += 1

classification = {}
summary = Counter()
for category in ('roles','capabilities','requirements','relationships','reservedVolumeTypes','supportModes','landingRoles'):
    tokens = list(vocab.get(category, []))
    # Manifest can contain combined/internal values beyond vocabulary; include every shipped term too.
    tokens = sorted(set(tokens) | set(term_counts[category]))
    entries = {}
    for token in tokens:
        status = classify(category, token)
        summary[status] += 1
        entries[token] = {
            'status': status,
            'assetUseCount': term_counts[category].get(token, 0),
            'reason': EXPLANATIONS[status],
        }
    classification[category] = entries

term_doc = {
    'version': 5,
    'schema': 'jweb.semantic-term-classification.v5',
    'baselineRuntime': {
        'repository': 'JustinBrownDev/justinbrowndev.github.io',
        'branch': 'main',
        'observedCommit': '783b8a04737f4e7b4f00310af828f5ba16f3a354',
        'semanticPlacementBlob': 'c9edd08f9416da46ded1f3085272471469b0e5c4',
        'semanticLinksBlob': 'c1c902fd126c781309e9c2abead4ad4feeee1770',
        'note': 'Classification is deliberately strict: metadata is not considered implemented merely because it survives parsing.',
    },
    'summary': dict(summary),
    'classifications': classification,
    'fieldBehavior': {
        'semanticGraph.circulation.keepClear': {
            'status': 'advisory',
            'note': 'Live runtime reads directional keepClear values but collapses them into the same AABB used for body clearance, so typed-volume semantics are not implemented.',
        },
        'semanticGraph.progressiveInvariant': {
            'status': 'advisory',
            'note': 'Live runtime carries the metadata but does not use it as an atomic-commit gate.',
        },
        'semanticGraph.negativeSpace': {
            'status': 'unsupported-hard-error',
            'note': 'Live semantic placement does not reserve authoritative voids before host collision.',
        },
    },
}

conflict = {
    'physical': {
        'physical': 'polarity-aware-hard', 'circulation': 'solid-hard_void-compatible',
        'service': 'solid-hard_void-compatible', 'interaction': 'solid-hard_void-compatible',
        'socket': 'solid-hard_void-compatible', 'visual': 'soft', 'soft-preference': 'soft',
    },
    'circulation': {
        'physical': 'solid-hard_void-compatible', 'circulation': 'compatible', 'service': 'requires-compatibility',
        'interaction': 'requires-compatibility', 'socket': 'compatible', 'visual': 'compatible', 'soft-preference': 'soft',
    },
    'service': {
        'physical': 'solid-hard_void-compatible', 'circulation': 'requires-compatibility', 'service': 'compatible',
        'interaction': 'requires-compatibility', 'socket': 'compatible', 'visual': 'compatible', 'soft-preference': 'soft',
    },
    'interaction': {
        'physical': 'solid-hard_void-compatible', 'circulation': 'requires-compatibility', 'service': 'requires-compatibility',
        'interaction': 'compatible', 'socket': 'compatible', 'visual': 'compatible', 'soft-preference': 'soft',
    },
    'socket': {
        'physical': 'solid-hard_void-compatible', 'circulation': 'compatible', 'service': 'compatible',
        'interaction': 'compatible', 'socket': 'requires-compatibility', 'visual': 'compatible', 'soft-preference': 'soft',
    },
    'visual': {k: 'compatible' for k in ('circulation','service','interaction','socket','visual')},
    'soft-preference': {k: 'soft' for k in ('physical','circulation','service','interaction','socket','visual','soft-preference')},
}
conflict['visual']['physical'] = 'soft'
conflict['visual']['soft-preference'] = 'compatible'

# Dense semantic population policy. The current live pilot schedules only
# identity=1, functional=1, life=0 (2 semantic props per building plan).
# v5 targets 24 accepted semantic props per eligible structural SpacePlan:
# 6 identity + 10 functional + 8 lived-in props = 12x the live pilot baseline.
# Topology assets are never multiplied by this policy.
PROP_PHASE_TARGETS = {'identity': 6, 'functional': 10, 'life': 8}
PROP_TARGET_PER_SPACE = sum(PROP_PHASE_TARGETS.values())
PROP_MINIMUM_DENSE_TARGET = 20
PROP_ATTEMPT_BUDGET = PROP_TARGET_PER_SPACE * 3

DENSE_PROGRAMS = {
    'diner','laundromat','grocery','convenience','pharmacy','hardware_store','library','archive',
    'school_classroom','server_room','mainframe_room','bar','arcade','auto_shop','print_shop',
    'electronics_repair','laboratory','factory_control','radio_station','boiler_room',
}
COMPACT_PROGRAMS = {'motel_room','dentist','photo_lab','projection_booth'}

for recipe in room_recipes:
    program = recipe.get('id')
    target = PROP_TARGET_PER_SPACE
    if program in DENSE_PROGRAMS:
        target = 30
    elif program in COMPACT_PROGRAMS:
        target = 22
    # Preserve the requested >=10x floor relative to the live 2-prop pilot.
    target = max(PROP_MINIMUM_DENSE_TARGET, target)
    scale = target / PROP_TARGET_PER_SPACE
    phase_targets = {
        phase: max(1, round(count * scale)) for phase, count in PROP_PHASE_TARGETS.items()
    }
    # Adjust rounding to land exactly on the program target, biasing overflow to life clutter.
    delta = target - sum(phase_targets.values())
    phase_targets['life'] += delta
    recipe['population'] = {
        'schema': 'jweb.semantic-population.v5',
        'targetAcceptedPerSpace': target,
        'minimumDenseTargetPerSpace': PROP_MINIMUM_DENSE_TARGET,
        'densityMultiplierVsLivePilot': round(target / 2, 2),
        'phaseTargets': phase_targets,
        'attemptBudget': max(target * 3, 60),
        'topologyAssetsMultiplied': False,
        'variantPolicy': 'expand canonical families before exact-repeat; deterministic by spaceId/task ordinal',
        'overflowPolicy': 'carry unresolved soft prop demand to compatible same-program spaces; never violate hard typed reservations',
    }

prop_density_doc = {
    'version': 5,
    'schema': 'jweb.semantic-population.v5',
    'baselineLiveCommit': '783b8a04737f4e7b4f00310af828f5ba16f3a354',
    'livePilotBaseline': {
        'source': 'world/kowloon-fabric-enrichment.js',
        'phaseSpecs': {'identity': 1, 'functional': 1, 'life': 0},
        'scheduledSemanticPropsPerBuildingPlan': 2,
    },
    'default': {
        'targetAcceptedPerEligibleSpace': PROP_TARGET_PER_SPACE,
        'minimumDenseTargetPerEligibleSpace': PROP_MINIMUM_DENSE_TARGET,
        'densityMultiplierVsLivePilot': PROP_TARGET_PER_SPACE / 2,
        'phaseTargets': PROP_PHASE_TARGETS,
        'attemptBudget': PROP_ATTEMPT_BUDGET,
    },
    'programOverrides': {
        recipe['id']: recipe['population'] for recipe in room_recipes
    },
    'selection': {
        'recipeEntriesAreCanonicalSeeds': True,
        'expandAcrossCanonicalVariants': True,
        'preferUnseenVariantBeforeExactRepeat': True,
        'deterministicSeedInputs': ['worldSeed','chunkId','spaceId','phase','taskOrdinal'],
        'note': 'The corpus normally carries ten visual variants per canonical noun, so high density should diversify before cloning an exact GLB.',
    },
    'safety': {
        'excludeRolesFromMultiplication': sorted(HARD_ROLES),
        'neverMultiplyAuthoritativeTopology': True,
        'hardReservationsWinOverDensity': True,
        'densityShortfallMayNotCauseOverlap': True,
        'postCommitRule': 'Only already-approved non-solid narrative clutter may be added after commit; solid semantic props belong in the precommit space solve.',
    },
    'scheduler': {
        'rule': 'Dense props use the shared bounded prioritized asset scheduler, never a semantic-only FIFO.',
        'priority': ['visible/current player space','adjacent visible space','prefetch ring','loadTier','importance','proxy availability'],
        'realization': 'place approved proxies first; realize GLBs progressively so 10x+ population does not become a boot wall',
    },
}

planner_doc = {
    'version': 5,
    'schema': 'jweb.semantic-planner.v1',
    'baselineLiveCommit': '783b8a04737f4e7b4f00310af828f5ba16f3a354',
    'pipeline': [
        'Kowloon topology', 'structural SpacePlans', 'semantic space graph', 'complete dependency solve',
        'stable PlacementDescriptors + typed reservations/collision', 'atomic chunk commit', 'progressive visual realization',
    ],
    'liveStructuralInputs': {
        'world/kowloon-geometry-contract.js': {
            'blobSha': '913ec1dd03e1930394b366c164a62d7c7a66be2b',
            'authority': 'module/slab/chunk-edge geometry seam contract',
            'requiredExports': [
                'computeKowloonModuleRect','computeKowloonSlabRect','isKowloonSharedRoadCell',
                'kowloonChunkBoundaryEdgeKind','kowloonStreetEncroachmentAllowed',
            ],
            'rule': 'SpacePlan generation consumes these structural decisions; semantic planning must not recompute competing edge or slab offsets.',
        },
    },
    'spacePlan': {
        'requiredFields': ['spaceId','bounds','floor','ceiling','walls','openings','traversableRegions','circulation','obstacles','sockets','exposure','program'],
        'stableIdentity': 'spaceId must be deterministic for the structural space and survive visual refinement.',
        'sourceOfTruth': 'structural generation; never reconstructed from rendered meshes',
    },
    'placementDescriptor': {
        'requiredFields': ['instanceId','assetId','spaceId','transform','relationToInstanceId','typedReservations','collision','resolutionState'],
        'instanceIdRule': 'deterministic chunkId/spaceId/taskKey/ordinal identity; never assetId-only',
        'resolutionStates': ['resolved','blocked','unsatisfied','deferred'],
        'dependencyRule': 'solve the complete space graph before commit; failed ordering is never converted into a permanent no-op',
    },
    'typedVolumes': {
        'types': ['physical','circulation','service','interaction','socket','visual','soft-preference'],
        'physicalPolarity': ['solid','void'],
        'conflictMatrix': conflict,
        'rule': 'Body, passage, service, interaction, sockets, and preferences are not merged into one candidate envelope.',
    },
    'atomicCommit': {
        'mustCommitTogether': ['resolved semantic layout','solid reservations','authoritative voids','collision proxies','traversal walk surfaces','hard circulation reservations'],
        'postCommitAllowed': ['proxy-to-GLB replacement','material refinement','visual LOD/detail','non-solid narrative clutter within already-approved reservations'],
        'postCommitForbidden': ['new solid topology','new structural voids','changing reserved space','discovering a required dependency'],
    },
    'doors': {
        'authority': 'structural negative-space portal',
        'required': ['host wall instance','adjacent space identities','authoritative wall void','two-sided approach/portal sockets','precollision reservation','separate leaf consumer policy'],
        'failClosed': True,
    },
    'stairs': {
        'authority': 'structural traversal topology',
        'required': ['entry/exit endpoints','walk surface','story datum/elevations','landing roles','headroom','player sweep','circulation clearances','guard breaks','support/anchors','slab/shaft void binding where applicable'],
        'failClosed': True,
    },
    'propPopulation': {
        'policyFile': 'prop-density-policy-v5.json',
        'defaultTargetAcceptedPerEligibleSpace': PROP_TARGET_PER_SPACE,
        'minimumDenseTargetPerEligibleSpace': PROP_MINIMUM_DENSE_TARGET,
        'phaseTargets': PROP_PHASE_TARGETS,
        'densityMultiplierVsLivePilot': PROP_TARGET_PER_SPACE / 2,
        'topologyAssetsMultiplied': False,
        'rule': 'Density is solved inside the complete SpacePlan graph before commit; hard reservations always beat density.',
    },
    'resourceScheduling': {
        'rule': 'semantic GLBs use the existing shared bounded prioritized asset scheduler; no private FIFO',
        'priorityInputs': ['player distance','visibility/prefetch ring','loadTier','importance','proxy availability'],
    },
    'unsupportedSemantics': {
        'classificationFile': 'semantic-term-classification-v5.json',
        'rule': 'any asset with an unsupported-hard-error term that is materially required for its planned placement is blocked until an implementing planner path exists',
    },
}

TOPOLOGY_ROLES = HARD_ROLES
SOFT_RELATIONSHIPS = {
    'corner','display-or-storage-provider','endcap','head-against-wall','illuminates-local-semantic-zone',
    'near-elevator-opening','near-loading-bay-opening','near-portal','queue-compatible','restroom-fixture-zone',
}


def bbox(asset):
    mn, mx = asset.get('boundsMin'), asset.get('boundsMax')
    if isinstance(mn, list) and isinstance(mx, list) and len(mn)==3 and len(mx)==3:
        return {'min': mn, 'max': mx, 'size': [mx[i]-mn[i] for i in range(3)]}
    dims = asset.get('dimensionsXYZ')
    if isinstance(dims, list) and len(dims)==3:
        return {'min': [-dims[0]/2, 0, -dims[2]/2], 'max': [dims[0]/2,dims[1],dims[2]/2], 'size': dims}
    return None


def volume_type_for_reserved(rv_type):
    if rv_type in ('wallOpeningVoid','slabVoid','stairShaft'):
        return 'physical', 'void'
    if rv_type in ('circulation','playerSweep'):
        return 'circulation', None
    return 'interaction', None


def token_statuses(asset):
    g=asset.get('semanticGraph') or {}
    found=[]
    for cat in ('roles','capabilities','requirements','relationships'):
        for tok in g.get(cat) or []:
            found.append((cat,tok,classify(cat,tok)))
    for rv in g.get('reservedVolumes') or []:
        if rv.get('type'): found.append(('reservedVolumeTypes',rv['type'],classify('reservedVolumeTypes',rv['type'])))
    sm=(g.get('support') or {}).get('mode')
    if sm: found.append(('supportModes',sm,classify('supportModes',sm)))
    for lr in (g.get('storySemantics') or {}).get('landingRoles') or []:
        if lr.get('role'): found.append(('landingRoles',lr['role'],classify('landingRoles',lr['role'])))
    return found

planner_assets={}
planner_counts=Counter()
for a in assets:
    aid=a['id']; g=a.get('semanticGraph') or {}; r=set(g.get('roles') or [])
    topo = topology.get('assets',{}).get(aid,{}).get('contracts',{})
    typed=[]
    b=bbox(a)
    negative=bool(g.get('negativeSpace'))
    collision=str(a.get('collision') or '')
    if b:
        if negative or collision in ('none','void-contract'):
            typed.append({'type':'visual','source':'asset-bounds','bounds':b,'required':False})
        else:
            typed.append({'type':'physical','polarity':'solid','source':'asset-bounds','bounds':b,'required':True,'authority':'planning-proxy'})
    for rv in g.get('reservedVolumes') or []:
        t, polarity = volume_type_for_reserved(rv.get('type'))
        entry={'type':t,'source':'semanticGraph.reservedVolumes','sourceType':rv.get('type'),'shape':rv.get('shape','box'),'required':bool(rv.get('required'))}
        if polarity: entry['polarity']=polarity
        if 'center' in rv: entry['center']=rv['center']
        if 'size' in rv: entry['size']=rv['size']
        if 'note' in rv: entry['purpose']=rv['note']
        if rv.get('type')=='playerSweep': entry['subtype']='player-sweep'
        typed.append(entry)
        if rv.get('type') in ('playerSweep','stairShaft') and 'headroom-clear' in set(g.get('requirements') or []):
            head={'type':'circulation','source':'derived-from-'+rv.get('type'),'sourceType':rv.get('type'),'subtype':'headroom','shape':rv.get('shape','box'),'required':True}
            if 'center' in rv: head['center']=rv['center']
            if 'size' in rv: head['size']=rv['size']
            head['derivation']='same source envelope; semantic purpose split without inventing geometry'
            typed.append(head)
    circulation=(g.get('circulation') or {}).get('keepClear') or []
    for item in circulation:
        typed.append({'type':'circulation','source':'semanticGraph.circulation.keepClear','direction':item.get('side'),'depth':item.get('depth'),'required':True})
    clear=a.get('clearance') or {}
    if any((clear.get(k) or 0) > 0 for k in ('front','rear','sides')):
        req=set(g.get('requirements') or [])
        if 'service-clearance' in req:
            ct='service'
        elif topo.get('portal') or topo.get('stair') or topo.get('landing') or req & {'circulation-clear','front-circulation','side-circulation','customer-side-clear','operator-side-clear','landing-circulation-clear'}:
            ct='circulation'
        else:
            ct='interaction'
        typed.append({'type':ct,'source':'asset.clearance','shape':'directional-clearance','front':clear.get('front',0),'rear':clear.get('rear',0),'sides':clear.get('sides',0),'required':ct!='interaction'})
    cs=a.get('connectionSockets') or {}
    seen_sockets=set()
    for name,s in cs.items():
        typed.append({'type':'socket','source':'connectionSockets','name':name,'position':s.get('position'),'facing':s.get('facing'),'precision':'geometric','required':True})
        seen_sockets.add(name)
    for name,enabled in (a.get('sockets') or {}).items():
        if enabled and name not in seen_sockets:
            typed.append({'type':'socket','source':'asset.sockets','name':name,'precision':'logical','resolvedByRuntime':True,'required':False})
            seen_sockets.add(name)
    for contract_name, field in (('portal','connectionSockets'),('stair','endpoints'),('landing','connectionSockets')):
        contract = topo.get(contract_name) or {}
        for sock in contract.get(field) or []:
            name=sock.get('name')
            if not name or name in seen_sockets: continue
            entry={'type':'socket','source':f'smart-topology-v5.{contract_name}.{field}','name':name,'precision':sock.get('precision','logical'),'required':True}
            for k in ('position','facing','landingRole','access','accepts','resolvedByRuntime'):
                if k in sock: entry[k]=sock[k]
            typed.append(entry); seen_sockets.add(name)
    structural_dependencies=[]
    if topo.get('portal'):
        structural_dependencies.append({'kind':'host-structure','target':topo['portal'].get('hostStructure'),'required':True})
        structural_dependencies.append({'kind':'adjacent-spaces','target':'two-stable-spaceIds','required':True})
    if topo.get('stair'):
        structural_dependencies.append({'kind':'endpoint-resolution','target':'all-stair-endpoints','required':True})
        structural_dependencies.append({'kind':'vertical-opening','target':'compatible-opening-when-crossing-slab','required':True})
    if topo.get('landing') and topo['landing'].get('accessPortalPolicy') == 'required':
        structural_dependencies.append({'kind':'access-portal','target':'compatible-portal-instance','required':True})
    if topo.get('doorAdornment'):
        structural_dependencies.append({'kind':'host-portal','target':'structural-portal-instance','required':True})
    for rel in g.get('relationships') or []:
        if rel in SOFT_RELATIONSHIPS:
            typed.append({'type':'soft-preference','source':'semanticGraph.relationships','relationship':rel,'required':False})
    statuses=token_statuses(a)
    hard=[{'category':c,'token':t} for c,t,s in statuses if s=='unsupported-hard-error']
    physical_solid=any(v.get('type')=='physical' and v.get('polarity')=='solid' and v.get('required') for v in typed)
    topology_sensitive=bool(r & TOPOLOGY_ROLES) or bool(topo) or negative
    precommit='required' if topology_sensitive or physical_solid else 'visual-only-eligible'
    disposition='blocked-on-current-live-runtime' if hard else 'runtime-pilot-compatible'
    planner_counts['blocked' if hard else 'compatible'] += 1
    if topology_sensitive: planner_counts['topologySensitive'] += 1
    if precommit=='required': planner_counts['precommitRequired'] += 1
    planner_assets[aid]={
        'canonicalId':a.get('canonicalId',aid),
        'semanticClass':a.get('semanticClass'),
        'sourceLayer':a.get('sourceLayer'),
        'programs':a.get('programs',[]),
        'roles':sorted(r),
        'requirements':g.get('requirements') or [],
        'relationships':g.get('relationships') or [],
        'typedReservations':typed,
        'topologyContracts':list(topo.keys()),
        'structuralDependencies':structural_dependencies,
        'precommitPlanning':precommit,
        'relationTargetPolicy':'relationToInstanceId',
        'hardUnsupportedTokens':hard,
        'currentLiveDisposition':disposition,
        'progressiveInvariant':g.get('progressiveInvariant') or {},
        'loadPriority':{'loadTier':a.get('loadTier'),'importance':a.get('importance')},
    }

planner_semantics={
    'version':5,
    'schema':'jweb.planner-semantics.v5',
    'assetCount':len(planner_assets),
    'summary':dict(planner_counts),
    'assets':planner_assets,
}

for path,obj in ((PLANNER,planner_doc),(TERMS,term_doc),(SEMANTICS,planner_semantics),(DENSITY,prop_density_doc)):
    path.write_text(json.dumps(obj,indent=2,sort_keys=False)+'\n',encoding='utf-8')

room_recipe_doc['version'] = 5
room_recipe_doc['schema'] = 'jweb.semantic-room-recipes.v5'
room_recipe_doc['populationPolicy'] = 'prop-density-policy-v5.json'
room_recipe_doc['recipes'] = room_recipes
room_recipe_doc['traversalRecipes'] = traversal_recipes
ROOM_RECIPES.write_text(json.dumps(room_recipe_doc,indent=2,sort_keys=False)+'\n',encoding='utf-8')
ROOM_RECIPES_JS.write_text(
    'export const SEMANTIC_ROOM_RECIPES = '+json.dumps(room_recipes,separators=(',',':'))+';\n'
    'export const SEMANTIC_TRAVERSAL_RECIPES = '+json.dumps(traversal_recipes,separators=(',',':'))+';\n'
    'export const SEMANTIC_PROP_DENSITY_POLICY = '+json.dumps(prop_density_doc,separators=(',',':'))+';\n',
    encoding='utf-8'
)

print(json.dumps({
    'plannerAssets':len(planner_assets),
    'classificationSummary':dict(summary),
    'plannerSummary':dict(planner_counts),
    'propDensityTargetPerSpace':PROP_TARGET_PER_SPACE,
    'propDensityMultiplierVsLivePilot':PROP_TARGET_PER_SPACE/2,
},indent=2))
