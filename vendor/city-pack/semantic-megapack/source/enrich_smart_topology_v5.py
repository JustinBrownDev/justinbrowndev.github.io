#!/usr/bin/env python3
import json, re, sys, hashlib
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
PACK = ROOT / 'vendor/city-pack/semantic-megapack'
MANIFEST = PACK / 'manifest.json'
OUT = PACK / 'smart-topology-v5.json'
INDEX = PACK / 'smart-corpus-index-v5.json'
AUDIT = PACK / 'smart-topology-audit-v5.json'

with MANIFEST.open('r', encoding='utf-8') as f:
    manifest = json.load(f)
assets = manifest['assets']


def roles(a): return set((a.get('semanticGraph') or {}).get('roles') or [])
def caps(a): return set((a.get('semanticGraph') or {}).get('capabilities') or [])
def reqs(a): return set((a.get('semanticGraph') or {}).get('requirements') or [])
def rels(a): return set((a.get('semanticGraph') or {}).get('relationships') or [])
def stable(a):
    p = (a.get('semanticGraph') or {}).get('progressiveInvariant') or {}
    return p.get('topologyMayChange') is False and p.get('reservedSpaceMayChange') is False

def first_reserved(a, types=()):
    rv = (a.get('semanticGraph') or {}).get('reservedVolumes') or []
    if types:
        for x in rv:
            if x.get('type') in types: return x
    return rv[0] if rv else None

def logical_landing_roles(a):
    return ((a.get('semanticGraph') or {}).get('storySemantics') or {}).get('landingRoles') or []

def infer_portal_axis(a, void):
    axis = (a.get('voidContract') or {}).get('axis')
    if axis: return axis
    if 'vertical-opening' in roles(a): return 'y'
    return 'z'

def portal_contract(a):
    r = roles(a)
    if 'portal' not in r and 'negative-space' not in r:
        return None
    void = a.get('voidContract') or first_reserved(a, ('wallOpeningVoid','slabVoid','shaftVoid','serviceOpeningVoid')) or first_reserved(a)
    vc = a.get('voidContract') or {}
    axis = infer_portal_axis(a, void or {})
    is_vertical = 'vertical-opening' in r or axis == 'y'
    host = 'slab-or-roof' if is_vertical else ('wall' if a.get('mount') == 'wall-opening' or 'wall-void-provider' in caps(a) else (a.get('semanticGraph') or {}).get('support',{}).get('mode','structure'))
    existing = a.get('connectionSockets') or {}
    logical = []
    if existing:
        logical = [{'name': k, **v, 'precision': 'geometric'} for k,v in existing.items()]
    elif is_vertical:
        logical = [
            {'name':'below','facing':'+y','precision':'logical','resolvedByRuntime':True},
            {'name':'above','facing':'-y','precision':'logical','resolvedByRuntime':True},
        ]
    else:
        logical = [
            {'name':'approachFront','facing':'+z','precision':'logical','resolvedByRuntime':True},
            {'name':'portal','facing':'+z','precision':'logical','resolvedByRuntime':True},
            {'name':'approachBack','facing':'-z','precision':'logical','resolvedByRuntime':True},
        ]
    doorish = '/doorway_' in a.get('id','') or '.doorway.' in a.get('semanticClass','')
    return {
        'schema':'jweb.smart-topology.v5',
        'kind':'doorway' if doorish else ('vertical-opening' if is_vertical else 'portal-opening'),
        'authority':'negative-space',
        'hostStructure':host,
        'bidirectional':True,
        'walkable':bool(a.get('walkable') or 'walk-through' in caps(a) or 'walk-through' in (a.get('accessCapabilities') or [])),
        'negativeSpaceRequired':True,
        'void':void,
        'clearWidth':vc.get('clearWidth'),
        'clearHeight':vc.get('clearHeight'),
        'clearLength':vc.get('clearLength'),
        'sillHeight':vc.get('sillHeight', 0.0 if doorish else None),
        'axis':axis,
        'connectionSockets':logical,
        'structuralCommit':{
            'reserveVoidBeforeCollision':True,
            'hostCollisionMustExcludeVoid':True,
            'failPlacementIfVoidCannotBeGuaranteed':True,
            'publishRenderAndCollisionTogether':True,
        },
        'doorLeaf': ({
            'presentInThisAsset':bool(a.get('doorLeafPresent', False)),
            'policy':'separate-semantic-consumer',
            'leafMayNeverAuthorizeOrShrinkPortalVoid':True,
            'openStateMustPreserveClearPassage':True,
            'closedStateMayBlockDynamicallyButMustNotRewriteStructuralVoid':True,
            'swingOrSlideEnvelopeMustBeReservedByLeafAsset':True,
        } if doorish else None),
        'compatibleConsumers': (
            ['stair','stair-tower','ladder','escalator','vertical-circulation'] if is_vertical
            else ['corridor','room','landing','fire-escape-landing','catwalk','exterior-approach']
        ),
        'progressiveInvariant':{
            'topologyMayChange':False,
            'reservedSpaceMayChange':False,
            'cosmeticRefinementMayIntrudeIntoVoid':False,
        },
    }

def door_adornment_contract(a):
    if 'visual-door-noun-only' not in rels(a): return None
    return {
        'schema':'jweb.smart-topology.v5',
        'kind':'door-leaf-or-door-adornment',
        'authority':'visual-dynamic-consumer',
        'requiresHostPortal':True,
        'hostPortalMustOwnVoid':True,
        'thisAssetMayNotCreateStructuralOpening':True,
        'thisAssetMayNotShrinkHostVoidContract':True,
        'acceptedHostPortalFamilies':['doorway.walk','serviceDoor.walk','portal.walk'],
        'swingOrSlideEnvelopeRequiredIfAnimated':True,
        'dynamicCollisionMustFollowLeafState':True,
        'progressiveInvariant':{'hostTopologyMayChange':False},
    }

def stair_contract(a):
    r = roles(a)
    if 'stair' not in r: return None
    cr = a.get('collisionRecipe') or {}
    step_rise = a.get('stepRise', cr.get('stepRise'))
    step_depth = a.get('stepDepth', cr.get('stepDepth'))
    step_count = a.get('stepCount', cr.get('stepCount'))
    total_rise = a.get('totalRise', cr.get('totalRise'))
    total_run = a.get('totalRun', cr.get('totalRun'))
    width = a.get('width', cr.get('width'))
    base_landing_roles = logical_landing_roles(a)
    if not base_landing_roles:
        aid = a.get('id','')
        if 'fire_escape/flight_' in aid:
            base_landing_roles = [
                {'socket':'bottom','role':'fire-escape-landing','access':'required'},
                {'socket':'top','role':'fire-escape-landing','access':'required'},
            ]
        elif 'roof_access_hatch_stair_' in aid:
            base_landing_roles = [
                {'socket':'bottom','role':'floor-or-roof','access':'required'},
                {'socket':'top','role':'roof-hatch-transfer','access':'required'},
            ]
        else:
            base_landing_roles = [
                {'socket':'bottom','role':'floor-compatible','access':'required'},
                {'socket':'top','role':'floor-compatible','access':'required'},
            ]
    endpoints = []
    if a.get('connectionSockets'):
        for k,v in a['connectionSockets'].items():
            endpoints.append({'name':k, **v, 'precision':'geometric'})
    else:
        for lr in base_landing_roles:
            endpoints.append({
                'name':lr.get('socket','endpoint'),
                'landingRole':lr.get('role'),
                'access':lr.get('access'),
                'accepts':lr.get('accepts'),
                'precision':'logical',
                'resolvedByRuntime':True,
            })
        if not endpoints:
            endpoints = [
                {'name':'bottom','landingRole':'floor-compatible','precision':'logical','resolvedByRuntime':True},
                {'name':'top','landingRole':'floor-compatible','precision':'logical','resolvedByRuntime':True},
            ]
    reserved = (a.get('semanticGraph') or {}).get('reservedVolumes') or []
    is_tower = 'stair-tower' in r
    story_count = a.get('storyCount')
    return {
        'schema':'jweb.smart-topology.v5',
        'kind':'stair-tower' if is_tower else 'stair-flight-or-assembly',
        'authority':'traversal-topology',
        'walkable':True,
        'climbable':True,
        'storyAligned':bool(((a.get('semanticGraph') or {}).get('storySemantics') or {}).get('storyAligned')),
        'storyCount':story_count,
        'accessPolicy':a.get('accessPolicy'),
        'steps':{
            'rise':step_rise,
            'depth':step_depth,
            'count':step_count,
            'totalRise':total_rise,
            'totalRun':total_run,
            'width':width,
            'collision':a.get('collision'),
            'walkSurface':cr.get('walkSurface') or 'individual-steps',
        },
        'endpoints':endpoints,
        'landingRoles':base_landing_roles,
        'reservedVolumes':reserved,
        'clearance':{
            'headroomRequired':('headroom-clear' in reqs(a)),
            'circulationRequired':('landing-circulation-clear' in reqs(a) or 'circulation-clear' in reqs(a)),
            'playerSweepAuthoritative':any(v.get('type') in ('playerSweep','stairShaft','circulation') and v.get('required') for v in reserved),
        },
        'slabPenetration':{
            'reserveVerticalVoidWhenCrossingSlab':True,
            'bindToCompatibleOpeningAsset':True,
            'preferredOpeningRoles':['vertical-opening','shaft-opening','slab-void-provider'],
            'towerRequiresContinuousShaft':bool(is_tower),
        },
        'guards':{
            'guardExposedEdges':True,
            'connectionConsumesGuard':True,
            'guardConsumers':['walk','stair','landing','portal','ladder','bridge','catwalk'],
        },
        'support':(a.get('semanticGraph') or {}).get('support') or {'mode':'structural-surface','required':True},
        'structuralCommit':{
            'publishWalkSurfaceAndCollisionTogether':True,
            'publishRequiredVoidsBeforeStairCollision':True,
            'failPlacementIfEndpointCannotResolve':True,
            'failPlacementIfHeadroomCannotBeGuaranteed':True,
        },
        'progressiveInvariant':{
            'topologyMayChange':False,
            'reservedSpaceMayChange':False,
            'endpointRolesMayChange':False,
            'cosmeticRefinementMayIntrudeIntoPlayerSweep':False,
        },
    }

def landing_contract(a):
    r = roles(a)
    if 'landing' not in r and 'landing-or-platform' not in r: return None
    return {
        'schema':'jweb.smart-topology.v5',
        'kind':'landing',
        'authority':'traversal-topology',
        'walkable':True,
        'storyAligned':bool(((a.get('semanticGraph') or {}).get('storySemantics') or {}).get('storyAligned')),
        'landingRoles':logical_landing_roles(a) or [{'socket':'self','role':'platform-transfer','access':'role-dependent'}],
        'connectionSockets':[
            {'name':k, **v, 'precision':'geometric'} for k,v in (a.get('connectionSockets') or {}).items()
        ] or [{'name':'edges','precision':'logical','resolvedByRuntime':True}],
        'reservedVolumes':(a.get('semanticGraph') or {}).get('reservedVolumes') or [],
        'accessPortalPolicy':(
            'required' if 'access-portal-required' in reqs(a)
            else 'preferred' if 'access-portal-preferred' in reqs(a)
            else 'role-dependent'
        ),
        'acceptedPortalFamilies':a.get('acceptedPortalFamilies') or [],
        'guards':{
            'guardExposedEdges':True,
            'connectionConsumesGuard':True,
            'neverTerminateValidTraversalIntoGuard':True,
        },
        'support':(a.get('semanticGraph') or {}).get('support'),
        'structuralCommit':{
            'publishPlatformAndCollisionTogether':True,
            'reserveCirculationBeforeProps':True,
            'failPlacementIfRequiredPortalCannotResolve':True,
        },
        'progressiveInvariant':{
            'topologyMayChange':False,
            'reservedSpaceMayChange':False,
        },
    }

def fire_escape_contract(a):
    if 'fire-escape' not in roles(a) and 'fire-escape-component' not in roles(a): return None
    return {
        'schema':'jweb.smart-topology.v5',
        'kind':'fire-escape-circulation',
        'authority':'traversal-topology',
        'facadeAnchored':True,
        'supportRequired':True,
        'accessPortalRequired':('access-portal-required' in reqs(a)),
        'acceptedPortalFamilies':a.get('acceptedPortalFamilies') or [],
        'storyLandingRoles':logical_landing_roles(a),
        'terminationPolicy':{
            'gradeMustResolve':True,
            'roofMustResolveIfRouteReachesRoof':True,
            'noDeadEndIntoGuardrail':True,
        },
        'progressiveInvariant':{'topologyMayChange':False,'reservedSpaceMayChange':False},
    }

overlay = {}
index_assets = []
for a in assets:
    contracts = {}
    pc = portal_contract(a)
    sc = stair_contract(a)
    lc = landing_contract(a)
    fc = fire_escape_contract(a)
    dc = door_adornment_contract(a)
    if pc: contracts['portal'] = pc
    if sc: contracts['stair'] = sc
    if lc: contracts['landing'] = lc
    if fc: contracts['fireEscape'] = fc
    if dc: contracts['doorAdornment'] = dc
    if contracts:
        overlay[a['id']] = {
            'canonicalId':a.get('canonicalId',a['id']),
            'sourceLayer':a.get('sourceLayer'),
            'semanticClass':a.get('semanticClass'),
            'roles':sorted(roles(a)),
            'contracts':contracts,
        }
    index_assets.append({
        'id':a['id'], 'canonicalId':a.get('canonicalId',a['id']), 'sourceLayer':a.get('sourceLayer'),
        'semanticCategory':a.get('semanticCategory'), 'semanticClass':a.get('semanticClass'),
        'programs':a.get('programs',[]), 'roles':sorted(roles(a)), 'capabilities':sorted(caps(a)),
        'requirements':sorted(reqs(a)), 'relationships':sorted(rels(a)),
        'file':a.get('file'), 'loadTier':a.get('loadTier'), 'importance':a.get('importance'),
    })

# Audits
structural_doorways = [a for a in assets if '/doorway_' in a.get('id','') and 'portal' in roles(a)]
door_adornments = [a for a in assets if 'visual-door-noun-only' in rels(a)]
stairs = [a for a in assets if 'stair' in roles(a)]
landings = [a for a in assets if 'landing' in roles(a) or '.landing' in a.get('semanticClass','') or '/landing_' in a.get('id','')]
stair_openings = [a for a in assets if 'portal' in roles(a) and ('vertical-opening' in roles(a)) and ('stair' in a.get('id','') or 'shaft' in a.get('id',''))]
fire_escapes = [a for a in assets if 'fire-escape' in roles(a) or 'fire-escape-component' in roles(a)]

def missing_door(a):
    errs=[]; o=overlay.get(a['id'],{}).get('contracts',{}).get('portal')
    if not o: errs.append('portal-contract')
    if not (a.get('voidContract') or first_reserved(a)): errs.append('void')
    if not (a.get('connectionSockets') or (o and o.get('connectionSockets'))): errs.append('approach-sockets')
    if not stable(a): errs.append('topology-invariant')
    if not (o and o.get('structuralCommit',{}).get('reserveVoidBeforeCollision')): errs.append('precollision-void-reservation')
    if not (o and o.get('doorLeaf')): errs.append('door-leaf-policy')
    return errs

def missing_stair(a):
    errs=[]; o=overlay.get(a['id'],{}).get('contracts',{}).get('stair')
    if not o: errs.append('stair-contract')
    if not (o and o.get('landingRoles')): errs.append('landing-roles')
    if not ((a.get('semanticGraph') or {}).get('reservedVolumes')): errs.append('reserved-headroom-or-shaft')
    if not stable(a): errs.append('topology-invariant')
    if not o or not o.get('endpoints'): errs.append('endpoints')
    if not o or not o.get('slabPenetration',{}).get('reserveVerticalVoidWhenCrossingSlab'): errs.append('slab-penetration-policy')
    return errs

def missing_landing(a):
    errs=[]; o=overlay.get(a['id'],{}).get('contracts',{}).get('landing')
    if not o: errs.append('landing-contract')
    if not (o and o.get('landingRoles')): errs.append('landing-role')
    if not ((a.get('semanticGraph') or {}).get('edgeBehavior')): errs.append('guard-edge-policy')
    if not stable(a): errs.append('topology-invariant')
    return errs

door_fail={a['id']:missing_door(a) for a in structural_doorways if missing_door(a)}
stair_fail={a['id']:missing_stair(a) for a in stairs if missing_stair(a)}
landing_fail={a['id']:missing_landing(a) for a in landings if missing_landing(a)}
adornment_fail={a['id']:['door-adornment-contract'] for a in door_adornments if 'doorAdornment' not in overlay.get(a['id'],{}).get('contracts',{})}

report = {
    'version':5,
    'baseManifestVersion':manifest.get('version'),
    'assetCount':len(assets),
    'overlayAssetCount':len(overlay),
    'structuralDoorwayCount':len(structural_doorways),
    'doorAdornmentCount':len(door_adornments),
    'stairCount':len(stairs),
    'landingCount':len(landings),
    'stairOrShaftOpeningCount':len(stair_openings),
    'fireEscapeCount':len(fire_escapes),
    'failures':{
        'doors':door_fail,
        'doorAdornments':adornment_fail,
        'stairs':stair_fail,
        'landings':landing_fail,
    },
}
report['pass'] = not any(report['failures'].values())

out = {
    'version':5,
    'schema':'jweb.smart-topology.v5',
    'baseCorpus':'jweb-semantic-megacorpus-v4',
    'baseAssetCount':len(assets),
    'contractAssetCount':len(overlay),
    'principles':{
        'relationshipsBeforeMeshes':True,
        'topologyStableAcrossRefinement':True,
        'negativeSpaceFirstClass':True,
        'renderAndCollisionCommitTogether':True,
        'runtimeMustNotInventAssetSpecificConditionals':True,
    },
    'assets':overlay,
}
idx = {
    'version':5,
    'schema':'jweb.smart-corpus-index.v5',
    'assetCount':len(index_assets),
    'canonicalCount':sum(1 for a in assets if a.get('sourceLayer')=='canonical'),
    'sourceCounts':{},
    'assets':index_assets,
}
for a in assets: idx['sourceCounts'][a.get('sourceLayer','unknown')] = idx['sourceCounts'].get(a.get('sourceLayer','unknown'),0)+1

for path,obj in ((OUT,out),(INDEX,idx),(AUDIT,report)):
    with path.open('w',encoding='utf-8') as f: json.dump(obj,f,indent=2,sort_keys=False); f.write('\n')

# Compact JS module overlay for runtime/sample consumers.
js = PACK/'smart-topology-v5.js'
with js.open('w',encoding='utf-8') as f:
    f.write('// Generated semantic topology overlay. Base geometry/semantic manifest remains authoritative.\n')
    f.write('export const SMART_TOPOLOGY_V5 = Object.freeze(')
    json.dump(out, f, separators=(',',':'))
    f.write(');\n')
    f.write('export function smartTopologyForAsset(def){ return SMART_TOPOLOGY_V5.assets?.[def?.id]?.contracts ?? null; }\n')

print(json.dumps(report, indent=2))
if not report['pass']:
    sys.exit(2)
