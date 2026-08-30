#!/usr/bin/env python3
import json, sys
from pathlib import Path
from collections import Counter

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
PACK=ROOT/'vendor/city-pack/semantic-megapack'
CITY=ROOT/'vendor/city-pack'
load=lambda n: json.loads((PACK/n).read_text(encoding='utf-8'))
manifest=load('manifest.json'); topo=load('smart-topology-v5.json'); topo_audit=load('smart-topology-audit-v5.json')
index=load('smart-corpus-index-v5.json'); planner=load('planner-contract-v5.json'); terms=load('semantic-term-classification-v5.json'); psem=load('planner-semantics-v5.json'); vocab=load('tag-vocabulary.json')
density=load('prop-density-policy-v5.json'); recipes=load('room-recipes.json')
assets=manifest['assets']; byid={a['id']:a for a in assets}
errors=[]; warnings=[]

def check(cond, code, detail=None):
    if not cond: errors.append({'code':code,'detail':detail})

def roles(a): return set((a.get('semanticGraph') or {}).get('roles') or [])
def rels(a): return set((a.get('semanticGraph') or {}).get('relationships') or [])

ids=[a['id'] for a in assets]
check(len(assets)==9714,'asset-count',len(assets)); check(len(set(ids))==len(ids),'duplicate-asset-id')
check(index.get('assetCount')==len(assets) and {x['id'] for x in index['assets']}==set(ids),'index-coverage')
check(psem.get('assetCount')==len(assets) and set(psem['assets'])==set(ids),'planner-coverage')
check(topo.get('contractAssetCount')==len(topo.get('assets',{}))==topo_audit.get('overlayAssetCount'),'topology-overlay-count')

# File and GLB integrity.
glbs=list(CITY.rglob('*.glb'))
check(len(glbs)==9714,'glb-count',len(glbs))
missing=[]; bad_magic=[]
for a in assets:
    f=CITY/a['file']
    if not f.is_file(): missing.append(a['id']); continue
    with f.open('rb') as h: magic=h.read(4)
    if magic!=b'glTF': bad_magic.append(a['id'])
check(not missing,'missing-glb',missing[:20]); check(not bad_magic,'bad-glb-magic',bad_magic[:20])

# Every shipped vocabulary token must be classified.
cat_sources={
 'roles':set(vocab.get('roles',[])), 'capabilities':set(vocab.get('capabilities',[])),
 'requirements':set(vocab.get('requirements',[])), 'relationships':set(vocab.get('relationships',[])),
 'reservedVolumeTypes':set(vocab.get('reservedVolumeTypes',[])), 'supportModes':set(vocab.get('supportModes',[])),
 'landingRoles':set(vocab.get('landingRoles',[])),
}
for a in assets:
    g=a.get('semanticGraph') or {}
    for k in ('roles','capabilities','requirements','relationships'): cat_sources[k].update(g.get(k) or [])
    cat_sources['reservedVolumeTypes'].update(v.get('type') for v in g.get('reservedVolumes') or [] if v.get('type'))
    sm=(g.get('support') or {}).get('mode');
    if sm: cat_sources['supportModes'].add(sm)
    for lr in (g.get('storySemantics') or {}).get('landingRoles') or []:
        if lr.get('role'): cat_sources['landingRoles'].add(lr['role'])
for cat,toks in cat_sources.items():
    classified=set((terms.get('classifications') or {}).get(cat,{}))
    check(toks<=classified,'unclassified-token',{'category':cat,'missing':sorted(toks-classified)})
    extra=classified-toks
    if extra: warnings.append({'code':'classification-extra-token','detail':{'category':cat,'tokens':sorted(extra)}})
check(set(terms.get('summary',{}))=={'implemented','advisory','unsupported-hard-error'},'classification-summary-statuses',terms.get('summary'))

# Planner contract completeness.
types=planner['typedVolumes']['types']; matrix=planner['typedVolumes']['conflictMatrix']
check(types==['physical','circulation','service','interaction','socket','visual','soft-preference'],'typed-volume-types',types)
for a in types:
    check(a in matrix,'matrix-row',a)
    for b in types: check(b in matrix.get(a,{}),'matrix-cell',f'{a}/{b}')
check(planner['spacePlan']['requiredFields']==['spaceId','bounds','floor','ceiling','walls','openings','traversableRegions','circulation','obstacles','sockets','exposure','program'],'spaceplan-fields')
check('relationToInstanceId' in planner['placementDescriptor']['requiredFields'],'stable-relation-field')
check(planner.get('baselineLiveCommit')=='783b8a04737f4e7b4f00310af828f5ba16f3a354','planner-live-baseline')

# Dense prop population: >=10x the current live pilot's 2 scheduled semantic props.
check(density.get('default',{}).get('targetAcceptedPerEligibleSpace')==24,'density-default-target',density.get('default'))
check(density.get('default',{}).get('densityMultiplierVsLivePilot')>=10,'density-multiplier',density.get('default',{}).get('densityMultiplierVsLivePilot'))
check(planner.get('propPopulation',{}).get('defaultTargetAcceptedPerEligibleSpace')==24,'planner-density-target',planner.get('propPopulation'))
check(planner.get('propPopulation',{}).get('topologyAssetsMultiplied') is False,'density-topology-exclusion')
check(recipes.get('version')==5 and recipes.get('populationPolicy')=='prop-density-policy-v5.json','room-recipe-density-schema',{'version':recipes.get('version'),'policy':recipes.get('populationPolicy')})
density_recipe_fail=[]
for recipe in recipes.get('recipes',[]):
    pop=recipe.get('population') or {}
    target=pop.get('targetAcceptedPerSpace',0)
    if target < 20 or pop.get('densityMultiplierVsLivePilot',0) < 10 or pop.get('attemptBudget',0) < target*3 or pop.get('topologyAssetsMultiplied') is not False:
        density_recipe_fail.append({'id':recipe.get('id'),'population':pop})
check(not density_recipe_fail,'room-recipe-density-failures',density_recipe_fail[:20])

# Base progressive invariants are preserved.
unstable=[]
for a in assets:
    p=(a.get('semanticGraph') or {}).get('progressiveInvariant') or {}
    if p.get('topologyMayChange') is not False or p.get('reservedSpaceMayChange') is not False: unstable.append(a['id'])
check(not unstable,'base-progressive-invariants',unstable[:20])

structural_doors=[a for a in assets if '/doorway_' in a['id'] and 'portal' in roles(a)]
door_adorn=[a for a in assets if 'visual-door-noun-only' in rels(a)]
stairs=[a for a in assets if 'stair' in roles(a)]
landings=[a for a in assets if 'landing' in roles(a) or '.landing' in str(a.get('semanticClass','')) or '/landing_' in a['id']]
stair_openings=[a for a in assets if 'portal' in roles(a) and 'vertical-opening' in roles(a) and ('stair' in a['id'] or 'shaft' in a['id'])]
fire=[a for a in assets if roles(a)&{'fire-escape','fire-escape-component'}]
check(len(structural_doors)==816,'door-count',len(structural_doors)); check(len(door_adorn)==10,'door-adornment-count',len(door_adorn)); check(len(stairs)==626,'stair-count',len(stairs)); check(len(landings)==348,'landing-count',len(landings)); check(len(stair_openings)==96,'stair-opening-count',len(stair_openings)); check(len(fire)==288,'fire-escape-count',len(fire))

# Doors: void authority, approaches, stable space relation contract.
door_fail=[]
for a in structural_doors:
    t=topo['assets'].get(a['id'],{}).get('contracts',{}).get('portal') or {}
    ps=psem['assets'][a['id']]; vols=ps['typedReservations']; socks={v.get('name') for v in vols if v.get('type')=='socket'}
    voids=[v for v in vols if v.get('type')=='physical' and v.get('polarity')=='void' and v.get('sourceType')=='wallOpeningVoid']
    deps={(d.get('kind'),d.get('target')) for d in ps.get('structuralDependencies',[])}
    miss=[]
    if t.get('authority')!='negative-space': miss.append('negative-space-authority')
    if not t.get('structuralCommit',{}).get('reserveVoidBeforeCollision'): miss.append('reserve-before-collision')
    if not t.get('structuralCommit',{}).get('hostCollisionMustExcludeVoid'): miss.append('host-collision-excludes-void')
    if not voids: miss.append('typed-wall-void')
    if not {'approachFront','portal','approachBack'}<=socks: miss.append('two-sided-sockets')
    if ('adjacent-spaces','two-stable-spaceIds') not in deps: miss.append('stable-adjacent-spaces')
    if not t.get('doorLeaf',{}).get('leafMayNeverAuthorizeOrShrinkPortalVoid'): miss.append('leaf-separation')
    if miss: door_fail.append({'id':a['id'],'missing':miss})
check(not door_fail,'door-contract-failures',door_fail[:20])

# Door adornments never own structural voids.
ad_fail=[]
for a in door_adorn:
    t=topo['assets'].get(a['id'],{}).get('contracts',{}).get('doorAdornment') or {}
    deps=psem['assets'][a['id']].get('structuralDependencies',[])
    if not t.get('requiresHostPortal') or not t.get('thisAssetMayNotCreateStructuralOpening') or not any(d.get('kind')=='host-portal' for d in deps): ad_fail.append(a['id'])
check(not ad_fail,'door-adornment-failures',ad_fail[:20])

# Stairs: endpoints, landing semantics, sweep/headroom, opening relation, guard/support, atomic commit.
stair_fail=[]
for a in stairs:
    t=topo['assets'].get(a['id'],{}).get('contracts',{}).get('stair') or {}
    ps=psem['assets'][a['id']]; vols=ps['typedReservations']; socks=[v for v in vols if v.get('type')=='socket']
    deps={d.get('kind') for d in ps.get('structuralDependencies',[])}
    source_rv=(a.get('semanticGraph') or {}).get('reservedVolumes') or []
    miss=[]
    if t.get('authority')!='traversal-topology': miss.append('traversal-authority')
    if len(t.get('endpoints') or [])<2 or len(socks)<2: miss.append('two-endpoints')
    if not t.get('landingRoles'): miss.append('landing-roles')
    if 'headroom-clear' in set((a.get('semanticGraph') or {}).get('requirements') or []) and not any(v.get('sourceType') in ('playerSweep','stairShaft') and v.get('type')=='circulation' for v in vols): miss.append('typed-headroom-sweep')
    if not source_rv: miss.append('source-reserved-volume')
    if not t.get('slabPenetration',{}).get('bindToCompatibleOpeningAsset') or 'vertical-opening' not in deps: miss.append('vertical-opening-dependency')
    if not t.get('guards',{}).get('connectionConsumesGuard'): miss.append('guard-break-policy')
    if not t.get('support'): miss.append('support')
    sc=t.get('structuralCommit',{})
    if not sc.get('publishWalkSurfaceAndCollisionTogether') or not sc.get('publishRequiredVoidsBeforeStairCollision'): miss.append('atomic-publication')
    if miss: stair_fail.append({'id':a['id'],'missing':miss})
check(not stair_fail,'stair-contract-failures',stair_fail[:20])

landing_fail=[]
for a in landings:
    t=topo['assets'].get(a['id'],{}).get('contracts',{}).get('landing') or {}
    if not t.get('landingRoles') or not t.get('guards',{}).get('neverTerminateValidTraversalIntoGuard'): landing_fail.append(a['id'])
check(not landing_fail,'landing-contract-failures',landing_fail[:20])

# All planner relations are stable-instance policy and all topology-sensitive assets precommit.
bad_rel=[aid for aid,p in psem['assets'].items() if p.get('relationTargetPolicy')!='relationToInstanceId']
check(not bad_rel,'relation-target-policy',bad_rel[:20])
bad_pre=[]
for aid,p in psem['assets'].items():
    if p.get('topologyContracts') and p.get('precommitPlanning')!='required': bad_pre.append(aid)
check(not bad_pre,'topology-precommit',bad_pre[:20])

report={
 'version':5,'schema':'jweb.full-corpus-audit.v5','pass':not errors,
 'baselineLiveCommit':'783b8a04737f4e7b4f00310af828f5ba16f3a354',
 'counts':{
  'assets':len(assets),'glbs':len(glbs),'topologyOverlayAssets':len(topo['assets']),'plannerAssets':len(psem['assets']),
  'structuralDoorways':len(structural_doors),'doorAdornments':len(door_adorn),'stairs':len(stairs),'landings':len(landings),
  'stairOrShaftOpenings':len(stair_openings),'fireEscapeAssets':len(fire),
  'classification':terms['summary'],'currentRuntimeBlockedAssets':psem['summary'].get('blocked'),
  'roomRecipes':len(recipes.get('recipes',[])),'defaultPropTargetPerSpace':density.get('default',{}).get('targetAcceptedPerEligibleSpace'),
  'minimumRecipePropTargetPerSpace':min((r.get('population') or {}).get('targetAcceptedPerSpace',0) for r in recipes.get('recipes',[])),
  'maximumRecipePropTargetPerSpace':max((r.get('population') or {}).get('targetAcceptedPerSpace',0) for r in recipes.get('recipes',[])),
 },
 'errors':errors,'warnings':warnings,
 'guarantees':{
  'allManifestGLBsPresentAndGlTFMagic':not missing and not bad_magic,
  'allShippedVocabularyClassified':not any(e['code']=='unclassified-token' for e in errors),
  'allAssetsHavePlannerSemantics':len(psem['assets'])==len(assets),
  'doorsFailClosed':not door_fail,
  'stairsFailClosed':not stair_fail,
  'stableInstanceRelationPolicy':not bad_rel,
  'topologyAssetsRequirePrecommitPlanning':not bad_pre,
  'propDensityAtLeast10xLivePilot':not density_recipe_fail and density.get('default',{}).get('densityMultiplierVsLivePilot',0)>=10,
 }
}
(PACK/'full-corpus-audit-v5.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
if errors: sys.exit(2)
