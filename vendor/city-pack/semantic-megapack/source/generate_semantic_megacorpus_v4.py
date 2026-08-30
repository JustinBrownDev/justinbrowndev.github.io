from __future__ import annotations
import json, math, hashlib, shutil, zipfile, os, re, statistics
from pathlib import Path
import numpy as np
import trimesh

WORK=Path('/mnt/data/jweb_semantic_assets_work')
V3PACK=WORK/'out'/'jweb-semantic-megapack-v3'
V3ROOT=V3PACK/'vendor'/'city-pack'/'semantic-megapack'
OUT=WORK/'out'
PACK=OUT/'jweb-semantic-megacorpus-v4'
ROOT=PACK/'vendor'/'city-pack'/'semantic-megapack'
LINK=ROOT/'linked'
SRC=ROOT/'source'
if PACK.exists(): shutil.rmtree(PACK)
shutil.copytree(V3ROOT, ROOT)
for dead in ('runtime-adapter.js',):
    p=ROOT/dead
    if p.exists(): p.unlink()
LINK.mkdir(parents=True, exist_ok=True); SRC.mkdir(parents=True, exist_ok=True)

C={
'dark':[48,50,54,255],'mid':[96,99,102,255],'light':[174,171,160,255],
'wood':[118,83,54,255],'wood2':[156,115,70,255],'metal':[122,129,132,255],
'steel':[158,164,166,255],'cream':[209,199,170,255],'red':[142,51,47,255],
'green':[61,104,78,255],'blue':[58,84,118,255],'yellow':[186,149,55,255],
'glass':[124,168,177,220],'black':[24,25,27,255],'white':[221,220,211,255],
'orange':[176,92,42,255]
}

def colorize(m,c='mid'):
    col=np.array(C[c] if isinstance(c,str) else c,dtype=np.uint8)
    m.visual.vertex_colors=np.tile(col,(len(m.vertices),1)); return m

def box(p,sx,sy,sz,x=0,y=0,z=0,c='mid'):
    m=trimesh.creation.box(extents=(float(sx),float(sy),float(sz))); m.apply_translation((x,y,z)); p.append(colorize(m,c)); return m

def cyl(p,r,h,x=0,y=0,z=0,c='metal',sections=8,axis='y'):
    m=trimesh.creation.cylinder(radius=float(r),height=float(h),sections=max(6,int(sections)))
    if axis=='y': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]))
    elif axis=='x': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[0,1,0]))
    m.apply_translation((x,y,z)); p.append(colorize(m,c)); return m

def wedge(p,width,rise,run,c='steel',x=0,y=0,z=0):
    v=np.array([[-width/2,0,0],[width/2,0,0],[-width/2,0,run],[width/2,0,run],[-width/2,rise,run],[width/2,rise,run]],float)
    f=np.array([[0,1,3],[0,3,2],[2,3,5],[2,5,4],[0,2,4],[0,4,1],[1,4,5],[1,5,3]],int)
    m=colorize(trimesh.Trimesh(vertices=v,faces=f,process=False),c); m.apply_translation((x,y,z)); p.append(m); return m

def merge(p):
    m=trimesh.util.concatenate(p); m.remove_unreferenced_vertices(); return m

def ground(m, center_xz=True):
    b=m.bounds; m.apply_translation((0,-b[0,1],0))
    if center_xz:
        b=m.bounds; m.apply_translation((-(b[0,0]+b[1,0])/2,0,-(b[0,2]+b[1,2])/2))
    return m

def export(mesh,path):
    mesh.remove_unreferenced_vertices(); path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(trimesh.exchange.gltf.export_glb(mesh,include_normals=True))
    b=mesh.bounds.astype(float); d=b[1]-b[0]
    return {'boundsMin':[round(float(x),4) for x in b[0]],'boundsMax':[round(float(x),4) for x in b[1]],'dimensionsXYZ':[round(float(x),4) for x in d], 'geometry':{'vertices':int(len(mesh.vertices)),'triangles':int(len(mesh.faces)),'bytes':path.stat().st_size}}

def slug(s): return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')

def vol(kind,center,size,required=True,note=None):
    x={'type':kind,'center':[round(float(v),4) for v in center],'size':[round(float(v),4) for v in size],'required':required}
    if note: x['note']=note
    return x

# -----------------------------------------------------------------------------
# Universal semantic linkage schema retrofit
# -----------------------------------------------------------------------------
v3=json.load(open(V3ROOT/'manifest.json'))
assets=v3['assets']

SUPPORT_PROVIDERS=('desk','table','counter','bench','shelf','rack','cabinet','stand','cart','plinth','dresser','workstation')
WALLISH=('board','map','clock','mirror','panel','intercom','thermostat','sign','plaque','cabinet','rack','shelf','directory','dispenser')
ROWISH=('chair','locker','washer','dryer','shelf','rack','cabinet','booth','seat','stanchion','gondola','server','machine')
UTILITY=('washer','dryer','sink','boiler','water_heater','pump','compressor','range','grill','fryer','dishwasher','server','network','ups','mainframe','switchgear','panel','meter','lathe','milling','drill','grinder')

def infer_graph(e):
    kind=(e.get('kind') or '').lower(); cat=(e.get('semanticCategory') or '').lower(); source=e.get('sourceLayer','canonical')
    d=e.get('dimensionsXYZ',[1,1,1]); w,h,dep=[float(x) for x in d]
    capabilities=[]; requirements=[]; relationships=[]; reserved=[]; support={'mode':'floor','required':True}; edge=[]; roles=[]
    circulation={'keepClear':[], 'aisleBias':None}
    progressive={'geometryMayRefine':True,'topologyMayChange':False,'reservedSpaceMayChange':False,'collisionAuthority':'world'}

    if source=='opening' or e.get('negativeSpaceIsAsset'):
        capabilities += list(e.get('accessCapabilities',[])) + ['wall-void-provider','portal-provider']
        requirements += ['structural-wall-void-before-collision']
        relationships += ['mounts-in-wall','connects-spaces']
        roles += ['portal','negative-space']
        vc=e.get('voidContract')
        if vc: reserved.append({'type':'wallOpeningVoid','center':vc.get('center',[0,h/2,0]),'size':[vc.get('clearWidth',w),vc.get('clearHeight',h),vc.get('clearDepth',dep)],'required':True})
        support={'mode':'wall-surround','required':True}; progressive['geometryMayRefine']=True
    elif source=='traversal':
        capabilities += ['traversal-provider']
        if e.get('walkable'): capabilities.append('walk')
        if e.get('climbable'): capabilities.append('climb')
        roles += ['circulation']
        cr=e.get('collisionRecipe',{}); typ=cr.get('type','')
        if 'stair' in typ or 'stair' in kind:
            roles += ['stair']; requirements += ['headroom-clear','landing-circulation-clear']
            reserved.append(vol('playerSweep',[0,h/2,0],[max(.65,w*.72),h+1.8,max(.8,dep*.72)],True,'conservative stair headroom/circulation envelope'))
        if typ in ('platform','bridge') or 'landing' in kind or 'catwalk' in kind or 'bridge' in kind:
            roles += ['landing-or-platform']; requirements += ['guard-exposed-edges-unless-connected']; edge.append({'rule':'guardUnlessConnected','consumers':['walk','stair','ladder','portal','bridge','catwalk']})
        if 'ladder' in kind:
            roles += ['ladder']; requirements += ['top-transition-clear','climb-sweep-clear']
        if 'fire_escape' in kind:
            roles += ['fire-escape','facade-circulation']; requirements += ['facade-support','floor-landings-access-portals']; relationships += ['anchors-to-facade','aligns-story-datums']
        if 'loading_dock' in kind:
            roles += ['loading']; requirements += ['grade-transition']
        support={'mode':'structural-surface-or-anchors','required':True}
    else:
        roles += ['semantic-prop']
        if any(x in kind for x in SUPPORT_PROVIDERS): capabilities += ['support-surface-provider']
        if 'chair' in kind or 'stool' in kind or 'seat' in kind or 'booth' in kind:
            relationships += ['faces-work-or-social-surface']; requirements += ['front-circulation']; circulation['keepClear'].append({'side':'front','depth':max(.45,dep*.7)})
        if 'bed' in kind:
            relationships += ['head-against-wall']; requirements += ['side-circulation']; circulation['keepClear'] += [{'side':'left','depth':.45},{'side':'right','depth':.45}]
        if any(x in kind for x in UTILITY):
            requirements += ['service-clearance']; relationships += ['utility-zone-compatible']; circulation['keepClear'].append({'side':'front','depth':max(.6,dep*.65)})
        if any(x in kind for x in WALLISH) or e.get('mount')=='wall':
            support={'mode':'wall','required':True}; relationships += ['wall-anchored']
        if any(x in kind for x in ROWISH) or e.get('repetition')=='row': relationships += ['row-alignable']
        if 'checkout' in kind or 'teller' in kind or 'reception' in kind or 'counter' in kind:
            requirements += ['customer-side-clear','operator-side-clear']; relationships += ['queue-compatible']
        if 'rack' in kind or 'shelf' in kind: relationships += ['display-or-storage-provider']
        if 'monitor' in kind or 'keyboard' in kind or 'phone' in kind or 'register' in kind or 'microscope' in kind:
            requirements += ['support-surface']; relationships += ['sits-on-work-surface']
        if 'light' in kind or 'lamp' in kind: relationships += ['illuminates-local-semantic-zone']
        if 'door' in kind and 'walk_in_cooler_door'==kind:
            # historical canonical visual noun; explicitly not a topology portal.
            relationships += ['visual-door-noun-only']; requirements += ['do-not-use-as-structural-opening']

    # Every asset participates in placement support and progressive invariants, even if empty lists elsewhere.
    return {
      'schema':'jweb.semantic-links.v1',
      'roles':sorted(set(roles)),
      'capabilities':sorted(set(capabilities)),
      'requirements':sorted(set(requirements)),
      'relationships':sorted(set(relationships)),
      'reservedVolumes':reserved,
      'support':support,
      'circulation':circulation,
      'edgeBehavior':edge,
      'storySemantics':{'storyAligned': source=='traversal' and any(x in kind for x in ('stair','fire_escape','landing','roof_access')), 'landingRoles':[]},
      'progressiveInvariant':progressive,
      'negativeSpace': bool(source=='opening' or e.get('negativeSpaceIsAsset')),
    }

def enrich_existing(e):
    e=dict(e); g=infer_graph(e)
    kind=(e.get('kind') or '').lower(); cr=e.get('collisionRecipe',{})
    if e.get('sourceLayer')=='traversal':
        if cr.get('type')=='u-stairwell': g['storySemantics']['landingRoles']=[{'socket':'bottom','role':'floor'},{'socket':'midLanding','role':'intermediate','access':'normally-forbidden'},{'socket':'top','role':'floor','access':'preferred'}]
        elif cr.get('type')=='steps': g['storySemantics']['landingRoles']=[{'socket':'bottom','role':'floor-compatible'},{'socket':'top','role':'floor-compatible'}]
        elif cr.get('type')=='fire-escape':
            g['storySemantics']['landingRoles']=[{'socket':f'accessPortal{i}','role':'floor','access':'required','accepts':['doorway.walk','window.climb','wallOpening.walk']} for i in range(cr.get('floors',0))]
        elif 'landing' in kind: g['storySemantics']['landingRoles']=[{'socket':'self','role':'floor|intermediate|transfer','access':'conditional-on-role'}]
    e['semanticGraph']=g
    e['linkTags']=sorted(set(g['roles']+g['capabilities']+g['requirements']+g['relationships']))
    e['metadataVersion']=4
    return e

assets=[enrich_existing(e) for e in assets]
ids={e['id'] for e in assets}
new=[]

def add_asset(id_,label,mesh,family,programs,graph,collision='none',mount='ground',front='+z',extra=None):
    full='semantic/linked/'+id_
    if full in ids: raise ValueError(full)
    ids.add(full)
    file=f'semantic-megapack/linked/{id_}.glb'
    geom=export(mesh,LINK/(id_+'.glb'))
    e={'id':full,'label':label,'file':file,'category':'linked','semanticCategory':family,'semanticClass':family+'.'+id_.replace('/','.'),'kind':id_.split('/')[-1],
       'programs':list(programs),'mount':mount,'frontAxis':front,'repetition':'module','importance':'structural' if 'circulation' in graph.get('roles',[]) or graph.get('negativeSpace') else 'functional',
       'loadTier':0 if 'circulation' in graph.get('roles',[]) or graph.get('negativeSpace') else 2,'collision':collision,'sourceLayer':'linked-v4','canonicalId':full,'variantKey':'base','metadataVersion':4}
    e.update(geom); e['clearance']={'front':.1,'sides':.05,'rear':.05}; e['semanticGraph']=graph; e['linkTags']=sorted(set(graph.get('roles',[])+graph.get('capabilities',[])+graph.get('requirements',[])+graph.get('relationships',[])))
    if extra: e.update(extra)
    assets.append(e); new.append(e)

def graph(roles=(),caps=(),req=(),rel=(),reserved=(),support='floor',edges=(),landing=(),negative=False,circulation=None):
    return {'schema':'jweb.semantic-links.v1','roles':list(roles),'capabilities':list(caps),'requirements':list(req),'relationships':list(rel),'reservedVolumes':list(reserved),
            'support':{'mode':support,'required':support!='none'},'circulation':circulation or {'keepClear':[],'aisleBias':None},'edgeBehavior':list(edges),
            'storySemantics':{'storyAligned':bool(landing),'landingRoles':list(landing)},'progressiveInvariant':{'geometryMayRefine':True,'topologyMayChange':False,'reservedSpaceMayChange':False,'collisionAuthority':'world'},'negativeSpace':negative}

# -----------------------------------------------------------------------------
# Geometry builders for linkage-aware gap fill
# -----------------------------------------------------------------------------
def rail_segment(length,height,style='steel',gate=False):
    p=[]; col='dark' if style in ('steel','industrial','fire') else ('cream' if style=='civic' else 'metal')
    for x in (-length/2,0,length/2): box(p,.045,height,.045,x,height/2,0,col)
    box(p,length+.04,.055,.045,0,height,0,col)
    if style in ('civic','residential'): box(p,length,.04,.04,0,height*.52,0,col)
    if gate:
        box(p,length*.42,.04,.04,0,height*.5,.04,'yellow'); box(p,.04,height*.78,.04,-length*.20,height*.40,.04,'yellow')
    return ground(merge(p))

def landing_mesh(w,d,railmask='sides',portal_edge=False):
    p=[]; box(p,w,.12,d,0,.06,0,'steel')
    rails=[]
    if railmask in ('sides','three'): rails+=['left','right']
    if railmask=='three': rails+=['front']
    for side in rails:
        if side in ('left','right'):
            x=(-1 if side=='left' else 1)*(w/2-.03); box(p,.04,1.0,d*.96,x,.62,0,'dark')
            for z in (-d*.42,0,d*.42): box(p,.04,1.0,.04,x,.62,z,'dark')
        else:
            z=d/2-.03; box(p,w*.96,1.0,.04,0,.62,z,'dark')
            for x in (-w*.42,0,w*.42): box(p,.04,1.0,.04,x,.62,z,'dark')
    if portal_edge:
        # visual threshold stripe only; no blocker at wall-facing edge
        box(p,w*.58,.025,.10,0,.135,-d/2+.05,'yellow')
    return ground(merge(p))

def quarter_stair(width,floor_h,run,turn='left',rail=True):
    p=[]; half=floor_h/2; n=max(6,math.ceil(half/.19)); rise=half/n; tread=run/n; xoff=(width+.32)/2
    # first flight +z centered at x=-xoff/2
    for i in range(n): box(p,width,rise*(i+1),tread,-xoff/2,rise*(i+1)/2,(i+.5)*tread,'steel')
    # square landing at half level
    sign=-1 if turn=='left' else 1
    box(p,width+run*.35,.12,width+run*.35,sign*(run*.18),half-.06,run+.35,'steel')
    # second flight turns along x, rising from half
    for i in range(n):
        h=rise*(i+1); x=sign*((i+.5)*tread); z=run+.35
        box(p,tread,h,width,x,half+h/2,z,'steel')
    if rail:
        for xx in (-width/2,width/2): box(p,.04,floor_h+.9,.04,xx,(floor_h+.9)/2,run*.45,'dark')
    return ground(merge(p)), rise, tread

def stair_tower(width,floor_h,floors,style='steel'):
    p=[]; lane=(width-.28)/2; run=2.25; n=max(6,math.ceil((floor_h/2)/.19)); rise=(floor_h/2)/n; tread=run/n
    for f in range(floors):
        y0=f*floor_h
        for i in range(n): box(p,lane,rise*(i+1),tread,-(lane+.14)/2,y0+rise*(i+1)/2,(i+.5)*tread,'steel')
        box(p,width,.12,.85,0,y0+floor_h/2-.06,run+.425,'steel')
        for i in range(n):
            h=rise*(i+1); z=run-(i+.5)*tread
            box(p,lane,h,tread,(lane+.14)/2,y0+floor_h/2+h/2,z,'steel')
        box(p,width,.12,.9,0,y0+floor_h-.06,-.45,'steel')
        # outer rails
        for x in (-width/2+.03,width/2-.03): box(p,.04,floor_h+.8,.04,x,y0+(floor_h+.8)/2,run*.5,'dark')
    return ground(merge(p)), rise, tread, run

def escalator_mesh(width,rise,run,rails=True):
    p=[]; n=max(10,math.ceil(rise/.18)); step=run/n; dh=rise/n
    for i in range(n): box(p,width,dh*(i+1),step,0,dh*(i+1)/2,(i+.5)*step,'steel')
    if rails:
        for sx in (-1,1):
            for i in range(n): box(p,.055,.7,step*1.02,sx*(width/2-.05),dh*(i+.5)+.48,(i+.5)*step,'dark')
    return ground(merge(p)),dh,step

def opening_frame(w,h,d,style='plain',sill=0):
    p=[]; t=max(.055,min(.18,w*.08)); c='steel' if style in ('industrial','shaft','fire') else ('cream' if style in ('civic','hotel') else 'mid')
    y0=sill
    box(p,t,h+t,d,-w/2-t/2,y0+(h+t)/2,0,c); box(p,t,h+t,d,w/2+t/2,y0+(h+t)/2,0,c); box(p,w+2*t,t,d,0,y0+h+t/2,0,c)
    if sill>0: box(p,w+2*t,t,d,0,y0-t/2,0,c)
    if style=='shaft':
        box(p,w+2*t+.18,.12,d+.08,0,y0+h+t+.07,0,'dark')
    if style=='civic': box(p,w+2*t+.20,.16,d+.08,0,y0+h+t+.10,0,'light')
    if style=='industrial':
        for sx in (-1,1): box(p,.08,.8,.08,sx*(w/2+t+.08),y0+.4,-d/2-.06,'yellow')
    return merge(p)

def hatch_frame(w,l,thick=.14,style='steel'):
    p=[]; c='dark' if style=='steel' else 'mid'; t=max(.06,min(.14,min(w,l)*.08))
    # Vertical curb surrounds the clear slab/roof hole; no curb geometry enters its x/z footprint.
    box(p,w+2*t,thick,t,0,thick/2,-l/2-t/2,c); box(p,w+2*t,thick,t,0,thick/2,l/2+t/2,c)
    box(p,t,thick,l,-w/2-t/2,thick/2,0,c); box(p,t,thick,l,w/2+t/2,thick/2,0,c)
    return ground(merge(p))

def balcony_mesh(w,d,style='steel',portal=True):
    p=[]; box(p,w,.14,d,0,.07,d/2,'steel')
    # outer and side guards, wall side z=0 left open for portal contract
    for x in np.linspace(-w*.45,w*.45,5): box(p,.04,1.0,.04,float(x),.64,d-.04,'dark')
    box(p,w*.94,.05,.04,0,1.12,d-.04,'dark')
    for x in (-w/2+.03,w/2-.03): box(p,.04,1.0,d*.9,x,.64,d*.52,'dark')
    if portal: box(p,w*.36,.025,.08,0,.155,.04,'yellow')
    if style=='concrete': box(p,w,.12,d,0,.18,d/2,'light')
    return ground(merge(p))

def support_bracket(w,h,d,style='tri'):
    p=[]; box(p,.08,h,.08,-w/2,h/2,0,'dark'); box(p,.08,h,.08,w/2,h/2,0,'dark'); box(p,w,.08,d,0,h-.04,d/2,'steel')
    if style=='tri':
        # stepped diagonal impression
        for i in range(4): box(p,w*.18,.06,d*.18,-w*.32+i*w*.21,h*.18+i*h*.18,d*.12+i*d*.12,'dark')
    else: box(p,w*.82,.06,.06,0,h*.55,d*.18,'dark')
    return ground(merge(p))

def small_prop(kind,variant=0):
    p=[]
    # Purpose-built semantic silhouettes for gap families.
    if kind=='urinal':
        box(p,.42,.62,.28,0,.55,.08,'white'); box(p,.34,.12,.34,0,.28,.14,'white'); cyl(p,.025,.16,.14,.96,.04,'metal',6)
    elif kind=='stall_partition':
        box(p,1.0,1.85,.045,0,.98,0,'mid'); box(p,.045,.14,.045,-.42,.07,0,'metal'); box(p,.045,.14,.045,.42,.07,0,'metal')
    elif kind=='baby_change':
        box(p,.82,.12,.50,0,.82,.15,'cream'); box(p,.82,.58,.08,0,1.12,-.08,'cream')
    elif kind=='grab_bar':
        box(p,.78,.04,.04,0,.78,0,'metal'); box(p,.04,.32,.04,-.37,.64,0,'metal')
    elif kind=='grocery_cart':
        box(p,.72,.55,.42,0,.58,.05,'metal'); box(p,.58,.06,.34,0,.30,.02,'dark');
        for x in (-.28,.28):
            for z in (-.13,.13): cyl(p,.06,.035,x,.10,z,'black',8,axis='x')
        box(p,.78,.04,.04,0,.92,-.18,'dark')
    elif kind=='dock_bumper':
        box(p,.28,.72,.16,0,.42,0,'black'); box(p,.34,.10,.20,0,.10,0,'yellow')
    elif kind=='dock_light':
        box(p,.10,1.4,.10,0,.72,0,'dark'); box(p,.36,.18,.22,0,1.45,.08,'yellow')
    elif kind=='elevator_call':
        box(p,.16,.42,.05,0,.8,0,'dark'); cyl(p,.035,.03,0,.88,.035,'yellow',8,axis='z')
    elif kind=='floor_indicator':
        box(p,.46,.20,.05,0,1.8,0,'dark'); box(p,.12,.08,.02,0,1.8,.035,'yellow')
    elif kind=='hose_reel':
        cyl(p,.28,.12,0,.72,0,'red',10,axis='z'); cyl(p,.08,.16,0,.72,.02,'dark',8,axis='z')
    elif kind=='wheel_stop':
        box(p,1.65,.14,.20,0,.07,0,'dark'); box(p,.20,.04,.22,-.55,.16,0,'yellow'); box(p,.20,.04,.22,.55,.16,0,'yellow')
    elif kind=='bollard':
        cyl(p,.09,.86,0,.43,0,'yellow',8); box(p,.26,.06,.26,0,.03,0,'dark')
    elif kind=='queue_gate':
        box(p,.08,1.0,.08,-.55,.5,0,'dark'); box(p,.08,1.0,.08,.55,.5,0,'dark'); box(p,1.02,.06,.05,0,.82,0,'yellow')
    elif kind=='roof_drain':
        cyl(p,.14,.08,0,.04,0,'dark',10); cyl(p,.045,.45,.16,.28,0,'metal',8)
    elif kind=='pipe_penetration':
        box(p,.54,.54,.08,0,.5,0,'mid');
        for x in (-.14,.14): cyl(p,.055,.42,x,.50,.04,'metal',8,axis='z')
    elif kind=='duct_penetration':
        box(p,.82,.62,.08,0,.62,0,'mid'); box(p,.62,.42,.38,0,.62,.18,'metal')
    else:
        box(p,.5,.8,.4,0,.4,0,'mid')
    m=ground(merge(p));
    # deterministic minor geometry variation, not only scale
    if variant%3==1: boxp=[]; box(boxp,.10,.08,.10,m.bounds[1,0]+.06,.12,0,'yellow'); m=merge([m,*boxp]); m=ground(m)
    elif variant%3==2: boxp=[]; box(boxp,.18,.06,.08,0,m.bounds[1,1]+.04,m.bounds[1,2]-.04,'dark'); m=merge([m,*boxp]); m=ground(m)
    return m

# -----------------------------------------------------------------------------
# New linked corpus generation
# -----------------------------------------------------------------------------

# 1) Floor/intermediate/transfer landings with explicit portal expectations: 216
for role in ('floor','intermediate','transfer'):
  for w in (1.0,1.25,1.5,1.8,2.2,2.6):
    for d in (1.0,1.35,1.7,2.1):
      for rail in ('sides','three','open'):
        m=landing_mesh(w,d,rail,role=='floor')
        rid=f'landing/{role}_w{int(w*100)}_d{int(d*100)}_{rail}'
        req=['circulation-clear','headroom-clear']; rel=['connects-traversal-elements']
        land=[{'socket':'self','role':role,'access':'preferred' if role=='floor' else ('normally-forbidden' if role=='intermediate' else 'conditional')}]
        if role=='floor': req+=['access-portal-preferred']; rel+=['aligns-story-datum']
        g=graph(('circulation','landing'),('walk','landing-provider'),req,rel,[vol('circulation',[0,1.0,d/2],[w,2.0,d],True)],'structural-surface',
                [{'rule':'guardUnlessConnected','consumers':['walk','stair','ladder','portal','bridge','catwalk']}],land)
        add_asset(rid,f'{role.title()} landing {w:.2f} x {d:.2f}m',m,'circulation_landing',('generic','office','residential','industrial','civic'),g,collision='platform')

# 2) Quarter-turn stairs: 144
for width in (.85,1.05,1.25,1.5):
  for fh in (2.7,3.0,3.3):
    for run in (2.1,2.4,2.7):
      for turn in ('left','right'):
        for rail in (True,False):
          m,rise,tread=quarter_stair(width,fh,run,turn,rail)
          rid=f'stairs/quarter_{turn}_w{int(width*100)}_h{int(fh*100)}_r{int(run*100)}_{"rail" if rail else "bare"}'
          g=graph(('circulation','stair'),('walk','climb'),('headroom-clear','landing-circulation-clear','floor-access-at-top'),('aligns-story-datums','connects-floor-to-floor'),[vol('playerSweep',[0,fh/2,run*.65],[width+run*.8,fh+1.9,run+width],True)],'structural-surface',
                  [{'rule':'guardUnlessConnected','consumers':['walk','portal','stair']}],[{'socket':'bottom','role':'floor','access':'preferred'},{'socket':'turn','role':'intermediate','access':'normally-forbidden'},{'socket':'top','role':'floor','access':'preferred'}])
          add_asset(rid,f'{turn.title()} quarter-turn stair {width:.2f}m / {fh:.1f}m story',m,'circulation_stair',('residential','office','civic','industrial','motel'),g,collision='individual-steps',extra={'stepRise':round(rise,4),'stepDepth':round(tread,4)})

# 3) Multi-story enclosed/open stair towers: 144
for width in (1.8,2.2,2.6,3.0):
  for fh in (2.7,3.0,3.3):
    for floors in (2,3,4):
      for style in ('steel','concrete'):
        for access in ('each-floor','alternating'):
          m,rise,tread,run=stair_tower(width,fh,floors,style)
          rid=f'stairs/tower_{style}_w{int(width*100)}_h{int(fh*100)}_f{floors}_{access}'
          land=[]
          for f in range(floors+1): land.append({'socket':f'floor{f}','role':'floor','access':'required' if access=='each-floor' or f%2==0 else 'optional'})
          g=graph(('circulation','stair','stair-tower'),('walk','climb','story-connector'),('headroom-clear','slab-void-required','landing-circulation-clear','access-portals-by-floor-policy'),('aligns-story-datums','connects-floor-to-floor'),[vol('stairShaft',[0,fh*floors/2,run*.55],[width+.3,fh*floors+1.8,run+1.2],True)],'structural-surface',
                  [{'rule':'guardUnlessConnected','consumers':['walk','portal','stair']}],land)
          add_asset(rid,f'{style.title()} {floors}-story stair tower {access}',m,'circulation_stair_tower',('residential','office','civic','industrial','parking'),g,collision='individual-steps+landings',extra={'stepRise':round(rise,4),'stepDepth':round(tread,4),'storyCount':floors,'accessPolicy':access})

# 4) Escalators: 108
for width in (.8,1.0,1.2):
  for rise in (2.7,3.0,3.3):
    for run in (4.8,5.6,6.4):
      for rails in (True,False):
        for mode in ('up','down'):
          m,sr,sd=escalator_mesh(width,rise,run,rails)
          rid=f'escalator/{mode}_w{int(width*100)}_h{int(rise*100)}_r{int(run*100)}_{"rail" if rails else "bare"}'
          g=graph(('circulation','escalator'),('walk','story-connector'),('headroom-clear','landing-circulation-clear'),('aligns-story-datums','connects-public-levels'),[vol('playerSweep',[0,rise/2,run/2],[width+.5,rise+2.0,run+.8],True)],'structural-surface',[],[{'socket':'bottom','role':'floor','access':'open'},{'socket':'top','role':'floor','access':'open'}])
          add_asset(rid,f'{mode.title()} escalator {width:.1f}m rise {rise:.1f}',m,'circulation_escalator',('transit','mall','civic','hospital','office'),g,collision='individual-steps',extra={'stepRise':round(sr,4),'stepDepth':round(sd,4)})

# 5) Balconies as facade circulation with portal requirements: 160
for w in (1.2,1.8,2.4,3.0,3.8):
  for d in (.8,1.1,1.4,1.8):
    for style in ('steel','concrete','motel','industrial'):
      for access in ('door','door-or-window'):
        m=balcony_mesh(w,d,'concrete' if style=='concrete' else 'steel',True)
        rid=f'balcony/{style}_w{int(w*100)}_d{int(d*100)}_{access}'
        accepts=['doorway.walk'] if access=='door' else ['doorway.walk','window.climb']
        g=graph(('circulation','balcony','facade-circulation'),('walk','landing-provider','portal-consumer'),('facade-support','access-portal-required','circulation-clear'),('anchors-to-facade','aligns-story-datum','expects-facade-opening'),[vol('circulation',[0,1.0,d/2],[w,2.0,d],True)],'facade-brackets-or-slab',
                [{'rule':'guardUnlessConnected','consumers':['portal','stair','ladder','bridge']}],[{'socket':'facade','role':'floor','access':'required','accepts':accepts}])
        add_asset(rid,f'{style.title()} balcony {w:.1f} x {d:.1f}m',m,'circulation_balcony',('residential','motel','industrial','office','alley'),g,collision='platform',extra={'acceptedPortalFamilies':accepts})

# 6) Modular fire-escape landing and flight pieces: 192
for w in (1.1,1.4,1.8,2.2):
  for d in (.85,1.05,1.25):
    for style in ('steel','rust','motel','industrial'):
      for access in ('door','window'):
        m=landing_mesh(w,d,'three',True)
        rid=f'fire_escape/landing_{style}_w{int(w*100)}_d{int(d*100)}_{access}'
        accepts=['doorway.walk'] if access=='door' else ['window.climb']
        g=graph(('circulation','landing','fire-escape','facade-circulation'),('walk','portal-consumer'),('facade-support','access-portal-required','circulation-clear'),('anchors-to-facade','expects-facade-opening'),[vol('circulation',[0,1,d/2],[w,2,d],True)],'facade-brackets',
                [{'rule':'guardUnlessConnected','consumers':['stair','ladder','portal']}],[{'socket':'facade','role':'floor','access':'required','accepts':accepts}])
        add_asset(rid,f'Fire escape {style} landing {access}',m,'circulation_fire_escape_component',('residential','motel','industrial','alley'),g,collision='platform',extra={'acceptedPortalFamilies':accepts})
for width in (.8,1.0,1.2,1.4):
  for rise in (2.7,3.0,3.3):
    for run in (4.2,4.8,5.4,6.0):
      for side in ('left','right'):
        p=[]; n=max(10,math.ceil(rise/.19)); sr=rise/n; sd=run/n
        for i in range(n): box(p,sd,sr*(i+1),width,(-run/2)+(i+.5)*sd,sr*(i+1)/2,0,'steel')
        for z in (-width/2+.03,width/2-.03):
          for i in range(0,n+1,max(2,n//5)): box(p,.04,.9,.04,-run/2+i*sd,min(rise,i*sr)+.5,z,'dark')
        m=ground(merge(p)); rid=f'fire_escape/flight_{side}_w{int(width*100)}_h{int(rise*100)}_r{int(run*100)}'
        g=graph(('circulation','stair','fire-escape-component'),('walk','climb','landing-connector'),('both-ends-must-connect','headroom-clear'),('connects-fire-escape-landings',),[vol('playerSweep',[0,rise/2,0],[run+.5,rise+1.8,width+.5],True)],'landing-both-ends')
        add_asset(rid,f'Fire escape flight {side} {width:.1f}m',m,'circulation_fire_escape_component',('residential','motel','industrial','alley'),g,collision='individual-steps',extra={'stepRise':round(sr,4),'stepDepth':round(sd,4)})

# 7) Guardrail pieces, gates, corners, parapet transitions: 240
for length in (.6,.9,1.2,1.8,2.4,3.0):
  for height in (.85,1.0,1.1,1.2):
    for style in ('steel','civic','residential','industrial'):
      for gate in (False,True):
        m=rail_segment(length,height,style,gate); rid=f'rail/{style}_{"gate" if gate else "segment"}_l{int(length*100)}_h{int(height*100)}'
        g=graph(('edge-guard','circulation-adjacent'),('guard-edge','edge-interruption-provider' if gate else 'guard-edge'),('attach-to-exposed-edge',),('guards-platform-edge','interruptible-by-connection' if gate else 'continuous-guard'),[], 'platform-edge')
        add_asset(rid,f'{style.title()} rail {"gate" if gate else "segment"} {length:.1f}m',m,'circulation_guardrail',('generic','industrial','civic','residential','rooftop'),g,collision='barrier')
# corner/end adapters 48
for style in ('steel','civic','residential','industrial'):
  for length in (.6,.9,1.2):
    for form in ('corner','endcap','portal_break','ladder_break'):
      p=[]; a=rail_segment(length,1.0,style,False); p.append(a)
      if form=='corner':
        b=rail_segment(length,1.0,style,False); b.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[0,1,0])); b.apply_translation((length/2,0,-length/2)); p.append(b)
      elif form in ('portal_break','ladder_break'):
        box(p,.12,.05,.12,length*.36,1.05,0,'yellow')
      m=ground(merge(p)); rid=f'rail/{style}_{form}_l{int(length*100)}'
      g=graph(('edge-guard','adapter'),('guard-edge','connection-break'),('attach-to-exposed-edge',),('resolves-edge-interruption',form),[], 'platform-edge')
      add_asset(rid,f'{style.title()} rail {form}',m,'circulation_guardrail',('generic','industrial','civic','residential','rooftop'),g,collision='barrier')

# 8) Structural support brackets / balcony/fire escape supports: 144
for w in (.6,.9,1.2,1.5):
  for h in (.6,.9,1.2):
    for d in (.5,.8,1.1):
      for style in ('tri','frame','civic','industrial'):
        m=support_bracket(w,h,d,'tri' if style in ('tri','civic') else 'frame'); rid=f'support/{style}_w{int(w*100)}_h{int(h*100)}_d{int(d*100)}'
        g=graph(('support-structure',),('support-provider','wall-anchor'),('wall-anchor-surface',),('supports-balcony-or-platform','anchors-load-to-wall'),[], 'wall')
        add_asset(rid,f'{style.title()} support bracket {w:.1f}m',m,'structural_support',('exterior','industrial','alley','rooftop','civic'),g,collision='none',mount='wall')

# 9) Negative-space floor/roof/shaft/hatch contracts: 384
# GLB is ONLY the visible curb/frame around the void; no leaf/grate/panel covers the hole.
for family,styles in [('roof_hatch',('steel','civic')),('floor_hatch',('steel','industrial')),('ladder_well',('steel','industrial')),('service_shaft',('shaft','industrial'))]:
  for w in (.65,.8,1.0,1.2):
    for l in (.75,1.0,1.25,1.5):
      for style in styles:
        for curb in (.10,.18,.26):
          m=hatch_frame(w,l,curb,style); rid=f'opening/{family}_{style}_w{int(w*100)}_l{int(l*100)}_c{int(curb*100)}'
          rv=vol('slabVoid',[0,curb/2,0],[w,max(curb,.08),l],True,'opening must remain empty through slab/roof')
          caps=['vertical-portal','climb-through','slab-void-provider']
          g=graph(('portal','negative-space','vertical-opening'),caps,('cut-slab-or-roof-before-collision','guard-opening-unless-connected'),('connects-vertical-spaces',),[rv],'slab-or-roof',negative=True)
          add_asset(rid,f'{family.replace("_"," ").title()} clear opening {w:.2f} x {l:.2f}m',m,'negative_space_opening',('residential','industrial','office','rooftop','utility'),g,collision='void-contract',extra={'negativeSpaceIsAsset':True,'voidContract':{'shape':'box','clearWidth':w,'clearLength':l,'clearDepth':max(curb,.08),'center':[0,curb/2,0]},'doorLeafPresent':False})

# 10) Stair/elevator/atrium shaft surround openings: 192
for family in ('stair_shaft','elevator_shaft','freight_shaft','atrium_edge'):
  for w in (1.4,1.8,2.2,2.8):
    for h in (2.2,2.6,3.0):
      for d in (.18,.28):
        for style in ('shaft','industrial'):
          m=opening_frame(w,h,d,style,0); rid=f'opening/{family}_{style}_w{int(w*100)}_h{int(h*100)}_d{int(d*100)}'
          rv=vol('wallOpeningVoid',[0,h/2,0],[w,h,d],True)
          caps=['walk-through','wall-void-provider'] if family!='atrium_edge' else ['edge-opening','wall-void-provider']
          g=graph(('portal','negative-space','shaft-opening'),caps,('cut-structural-void-before-collision','connect-to-compatible-shaft-or-circulation'),('connects-to-'+family.replace('_','-'),),[rv],'wall-surround',negative=True)
          add_asset(rid,f'{family.replace("_"," ").title()} opening {w:.1f} x {h:.1f}',m,'negative_space_opening',('civic','industrial','office','hospital','residential'),g,collision='void-contract',extra={'negativeSpaceIsAsset':True,'voidContract':{'shape':'box','clearWidth':w,'clearHeight':h,'clearDepth':d,'center':[0,h/2,0]},'doorLeafPresent':False})

# 11) Pass-through / transaction / kitchen-service wall openings: 288
for family in ('service_pass','ticket_window','transaction_window','kitchen_pass','pharmacy_pass','security_pass'):
  for w in (.7,1.0,1.3,1.6):
    for h in (.55,.75,1.0):
      for sill in (.8,1.0,1.2):
        for style in ('plain','civic'):
          m=opening_frame(w,h,.16,style,sill); rid=f'opening/{family}_{style}_w{int(w*100)}_h{int(h*100)}_s{int(sill*100)}'
          rv=vol('wallOpeningVoid',[0,sill+h/2,0],[w,h,.16],True)
          g=graph(('portal','negative-space','service-opening'),('pass-through','wall-void-provider'),('cut-wall-void-before-collision','counter-or-service-zone-compatible'),('connects-service-and-customer-zones',),[rv],'wall-surround',negative=True)
          add_asset(rid,f'{family.replace("_"," ").title()} clear opening',m,'negative_space_service_opening',('retail','transit','clinic','food_service','civic'),g,collision='void-contract',extra={'negativeSpaceIsAsset':True,'voidContract':{'shape':'box','clearWidth':w,'clearHeight':h,'clearDepth':.16,'center':[0,sill+h/2,0]},'doorLeafPresent':False})

# 12) Catwalk junctions / bridge nodes: 144
for form in ('L','T','X'):
  for w in (.8,1.0,1.2,1.5):
    for arm in (1.2,1.8,2.4,3.0):
      for rail in ('guarded','open','industrial'):
        p=[]; box(p,w,.10,arm*2,0,.05,0,'steel');
        if form in ('L','T','X'): box(p,arm*2,.10,w,0,.05,0,'steel')
        if rail!='open':
          for x,z in ((-w/2,arm*.8),(w/2,arm*.8),(-w/2,-arm*.8),(w/2,-arm*.8)): box(p,.04,.95,.04,x,.55,z,'dark')
        m=ground(merge(p)); rid=f'catwalk/junction_{form.lower()}_w{int(w*100)}_a{int(arm*100)}_{rail}'
        g=graph(('circulation','catwalk','junction'),('walk','multi-connection-node'),('connected-arms-required','exposed-edges-guarded-unless-connected'),('joins-catwalks-or-bridges',),[vol('circulation',[0,1,0],[arm*2,2,arm*2],True)],'structural-support', [{'rule':'guardUnlessConnected','consumers':['catwalk','bridge','stair','ladder']}])
        add_asset(rid,f'{form}-junction catwalk {w:.1f}m',m,'circulation_catwalk',('industrial','warehouse','rooftop','utility'),g,collision='platform')

# 13) Dock transition and grade adapters: 192
for kind in ('dock_plate','threshold_ramp','curb_ramp','step_adapter'):
  for w in (.8,1.0,1.2,1.5):
    for rise in (.08,.15,.24,.36):
      for run in (.35,.6,.9):
        for style in ('steel','concrete','yellow','service'):
          p=[]; wedge(p,w,rise,run,'steel' if style!='concrete' else 'light');
          if style=='yellow': box(p,w,.025,.10,0,rise+.015,run-.05,'yellow')
          m=ground(merge(p)); rid=f'adapter/{kind}_{style}_w{int(w*100)}_h{int(rise*100)}_r{int(run*100)}'
          g=graph(('circulation','adapter','grade-transition'),('walk','height-mismatch-resolver'),('both-ends-connect',),('resolves-small-elevation-mismatch','connects-floor-to-dock-or-threshold'),[vol('circulation',[0,1,run/2],[w,2,run],True)],'structural-surface')
          add_asset(rid,f'{kind.replace("_"," ").title()} {w:.1f}m rise {rise:.2f}',m,'circulation_adapter',('retail','warehouse','industrial','residential','civic'),g,collision='ramp')

# 14) Linked building-service penetrations / edge-adjacent semantic props: 224
prop_specs={
'urinal':('restroom',('public_transit','civic','restaurant','office'),'wall'),
'stall_partition':('restroom',('public_transit','civic','restaurant','office'),'floor'),
'baby_change':('restroom',('public_transit','civic','retail'),'wall'),
'grab_bar':('accessibility',('restroom','clinic','civic'),'wall'),
'grocery_cart':('retail',('grocery','retail'),'floor'),
'dock_bumper':('loading',('warehouse','factory','loading_dock'),'wall'),
'dock_light':('loading',('warehouse','factory','loading_dock'),'wall'),
'elevator_call':('vertical_transport',('office','civic','hospital','motel'),'wall'),
'floor_indicator':('vertical_transport',('office','civic','hospital','motel'),'wall'),
'hose_reel':('emergency',('industrial','civic','parking'),'wall'),
'wheel_stop':('parking',('parking','motel','retail'),'floor'),
'bollard':('parking',('parking','retail','industrial'),'floor'),
'queue_gate':('public_service',('civic','transit','bank','retail'),'floor'),
'roof_drain':('building_service',('rooftop','industrial'),'roof'),
'pipe_penetration':('building_service',('utility','industrial','basement'),'wall'),
'duct_penetration':('building_service',('utility','industrial','basement'),'wall'),
}
for kind,(family,programs,mount) in prop_specs.items():
  for v in range(14):
    m=small_prop(kind,v); # mild scale variants with silhouette add-ons
    sx=0.88+(v%4)*.08; sy=.92+(v%3)*.06; sz=.90+((v//3)%3)*.07; M=np.eye(4); M[0,0]=sx; M[1,1]=sy; M[2,2]=sz; m.apply_transform(M); m=ground(m)
    rid=f'prop/{kind}_{v+1:02d}'
    req=[]; rel=[]; support='wall' if mount=='wall' else ('roof' if mount=='roof' else 'floor')
    if kind in ('pipe_penetration','duct_penetration'): req=['host-surface-compatible']; rel=['marks-service-penetration']
    if kind in ('dock_bumper','dock_light'): rel=['near-loading-bay-opening']
    if kind in ('elevator_call','floor_indicator'): rel=['near-elevator-opening']
    if kind in ('wheel_stop','bollard'): rel=['defines-vehicle-pedestrian-boundary']
    if kind in ('urinal','baby_change','grab_bar'): rel=['restroom-fixture-zone']
    g=graph(('semantic-prop',family),(),req,rel,[],support)
    add_asset(rid,f'{kind.replace("_"," ").title()} variant {v+1}',m,f'semantic_gap_{family}',programs,g,collision='none',mount=mount)

# 15) Portal-adjacent signage/utility microassemblies: 120
micro=('exit_header','room_number_stack','stair_floor_marker','fire_escape_notice','loading_bay_number','roof_access_marker','accessible_entry_marker','service_entry_marker','emergency_light_pair','doorway_call_panel')
for kind in micro:
  for v in range(12):
    p=[]; w=.28+(v%4)*.07; h=.12+(v%3)*.05
    box(p,w,h,.035,0,1.6,0,'red' if 'fire' in kind or 'exit' in kind else 'dark')
    if 'light' in kind: cyl(p,.06,.10,-w*.28,1.63,.04,'yellow',8,axis='z'); cyl(p,.06,.10,w*.28,1.63,.04,'yellow',8,axis='z')
    if 'panel' in kind: box(p,.08,.16,.04,w*.38,1.35,.02,'metal')
    m=ground(merge(p)); rid=f'portal_adjacent/{kind}_{v+1:02d}'
    g=graph(('semantic-prop','portal-adjacent'),(),(),('near-portal','inherits-portal-story-and-program'),[], 'wall')
    add_asset(rid,kind.replace('_',' ').title()+f' {v+1}',m,'portal_adjacent',('generic','civic','industrial','motel','office'),g,collision='none',mount='wall')

# -----------------------------------------------------------------------------
# Catalogs / tag vocabulary / gap report
# -----------------------------------------------------------------------------
# Count all assets by source and family
from collections import Counter
source_counts=Counter(e.get('sourceLayer','unknown') for e in assets)
family_counts=Counter(e.get('semanticCategory','unknown') for e in assets)
role_counts=Counter(r for e in assets for r in e['semanticGraph']['roles'])
req_counts=Counter(r for e in assets for r in e['semanticGraph']['requirements'])

manifest_obj={
 'version':4,'schema':'jweb.semantic-links.v1','assetCount':len(assets),'previousAssetCount':len(v3['assets']),'newAssetCount':len(new),
 'canonicalCount':v3.get('canonicalCount',0),'variantCount':v3.get('variantCount',0),'traversalV3Count':v3.get('traversalCount',0),'openingV3Count':v3.get('openingCount',0),
 'sourceCounts':dict(source_counts),'assets':assets
}
(ROOT/'manifest.json').write_text(json.dumps(manifest_obj,indent=2),encoding='utf-8')
(ROOT/'catalog.js').write_text('export const SEMANTIC_MEGA_ASSETS = '+json.dumps(assets,separators=(',',':'))+';\nexport const SEMANTIC_MEGA_ASSET_BY_ID = new Map(SEMANTIC_MEGA_ASSETS.map(a=>[a.id,a]));\n',encoding='utf-8')
(ROOT/'linked-v4-manifest.json').write_text(json.dumps({'version':4,'assetCount':len(new),'assets':new},indent=2),encoding='utf-8')
(ROOT/'linked-v4-catalog.js').write_text('export const SEMANTIC_LINKED_V4_ASSETS = '+json.dumps(new,separators=(',',':'))+';\n',encoding='utf-8')

vocab={
 'schema':'jweb.semantic-links.v1',
 'principle':'geometry + topology + obligations + negative space; metadata only in this corpus pass',
 'roles':sorted(role_counts),
 'capabilities':sorted({x for e in assets for x in e['semanticGraph']['capabilities']}),
 'requirements':sorted(req_counts),
 'relationships':sorted({x for e in assets for x in e['semanticGraph']['relationships']}),
 'reservedVolumeTypes':sorted({v.get('type') for e in assets for v in e['semanticGraph']['reservedVolumes'] if v.get('type')}),
 'supportModes':sorted({e['semanticGraph']['support'].get('mode') for e in assets}),
 'landingRoles':['grade','floor','intermediate','transfer','roof','balcony','service','dock','floor-compatible'],
 'progressiveInvariants':['topologyMayChange=false','reservedSpaceMayChange=false','world owns collision','visual geometry may refine'],
 'notes':['a door/window/hatch opening is a void contract plus optional surround geometry, never implicitly a blocking leaf','floor-aligned landings may expect access portals; intermediate landings normally do not','guard edges are interruptible only by compatible connections','circulation/player sweep volumes are semantic exclusion zones for later clutter placement']
}
(ROOT/'tag-vocabulary.json').write_text(json.dumps(vocab,indent=2),encoding='utf-8')

gap_report={
 'version':4,'previousAssets':len(v3['assets']),'newAssets':len(new),'totalAssets':len(assets),
 'filledFamilies':dict(Counter(e['semanticCategory'] for e in new)),
 'newRoleCoverage':dict(Counter(r for e in new for r in e['semanticGraph']['roles'])),
 'semanticGapsFilled':[
   'floor/intermediate/transfer landing role distinction','quarter-turn stairs','multi-story stair towers with per-floor access policy','escalators','balconies with facade portal expectations',
   'modular fire-escape landings and flights','guardrail segments/gates/corners/connection breaks','facade/platform support brackets','roof/floor/ladder/service-shaft voids',
   'stair/elevator/freight/atrium openings','service/ticket/transaction/kitchen/pharmacy/security pass-through openings','catwalk junction nodes','dock/threshold/curb/step adapters',
   'restroom/accessibility/loading/elevator/parking/building-service props','portal-adjacent semantic microassemblies'
 ]
}
(ROOT/'semantic-gap-report.json').write_text(json.dumps(gap_report,indent=2),encoding='utf-8')
shutil.copy2(Path(__file__),SRC/'generate_semantic_megacorpus_v4.py')

# Remove v3 preview and stale specialized catalogs whose metadata would no longer match the enriched manifest.
for p in ('preview.html','opening-catalog.js','traversal-catalog.js','opening-manifest.json','traversal-manifest.json'):
    q=ROOT/p
    if q.exists(): q.unlink()

# Corpus-only README; explicitly no wiring/patch.
(PACK/'README.md').write_text(f'''# JWEB Semantic Megacorpus v4 — CORPUS ONLY\n\nThis archive intentionally contains **no JWEB runtime patch and no wiring script**. It is an enlarged asset corpus plus normalized semantic metadata.\n\nInventory:\n- previous v3 assets retained: {len(v3['assets']):,}\n- new linkage-aware gap-fill GLBs: {len(new):,}\n- total GLBs: {len(assets):,}\n\nEvery manifest entry now carries `semanticGraph` using `jweb.semantic-links.v1`, including explicit fields for roles, capabilities, requirements, relationships, reserved volumes, support mode, circulation/exclusion semantics, edge behavior, story/landing semantics, negative-space status, and progressive invariants.\n\nNew geometry focuses on architectural/circulation gaps: landing roles, quarter-turn stairs, multi-story stair towers, escalators, balconies, modular fire-escape pieces, guardrails and connection breaks, supports, slab/roof/shaft openings, pass-through apertures, catwalk junctions, grade/dock adapters, and under-covered building-service / portal-adjacent props.\n\nNegative-space assets contain surround/curb geometry only. Their promised opening is deliberately empty.\n\nSee `vendor/city-pack/semantic-megapack/tag-vocabulary.json` and `semantic-gap-report.json`.\n''',encoding='utf-8')

# Validation: metadata all assets + reload all NEW GLBs + spot/size verify retained GLBs.
errors=[]; tri=[]; sizes=[]
required_graph=('schema','roles','capabilities','requirements','relationships','reservedVolumes','support','circulation','edgeBehavior','storySemantics','progressiveInvariant','negativeSpace')
for e in assets:
    g=e.get('semanticGraph')
    if not g: errors.append('missing semanticGraph '+e['id']); continue
    for k in required_graph:
        if k not in g: errors.append(f'missing graph.{k} '+e['id'])
    if g.get('schema')!='jweb.semantic-links.v1': errors.append('wrong graph schema '+e['id'])
    if g.get('progressiveInvariant',{}).get('topologyMayChange') is not False: errors.append('topology invariant missing '+e['id'])
    if g.get('progressiveInvariant',{}).get('reservedSpaceMayChange') is not False: errors.append('reserved invariant missing '+e['id'])
    fp=ROOT/e['file'].replace('semantic-megapack/','')
    if not fp.exists(): errors.append('missing file '+e['id'])
# reload all new
for e in new:
    fp=ROOT/e['file'].replace('semantic-megapack/','')
    try:
        obj=trimesh.load(fp,force='scene',process=False)
        meshes=[g for g in obj.geometry.values() if isinstance(g,trimesh.Trimesh)] if isinstance(obj,trimesh.Scene) else [obj]
        if not meshes: raise ValueError('no mesh')
        mm=trimesh.util.concatenate(meshes); tri.append(len(mm.faces)); sizes.append(fp.stat().st_size)
        if len(mm.faces)==0: errors.append('empty '+e['id'])
    except Exception as ex: errors.append('reload '+e['id']+': '+str(ex))
# validate negative spaces geometry AABB not overlapping declared box interior for new voids
for e in new:
    vc=e.get('voidContract')
    if not vc: continue
    fp=ROOT/e['file'].replace('semantic-megapack/',''); obj=trimesh.load(fp,force='scene',process=False); meshes=[g for g in obj.geometry.values() if isinstance(g,trimesh.Trimesh)] if isinstance(obj,trimesh.Scene) else [obj]; mm=trimesh.util.concatenate(meshes)
    if 'clearHeight' in vc:
        w=float(vc['clearWidth']); h=float(vc['clearHeight']); d=float(vc['clearDepth']); cx,cy,cz=map(float,vc['center'])
        tris=mm.vertices[mm.faces]; mn=tris.min(axis=1); mx=tris.max(axis=1); tol=1e-4
        overlap=(mx[:,0]>cx-w/2+tol)&(mn[:,0]<cx+w/2-tol)&(mx[:,1]>cy-h/2+tol)&(mn[:,1]<cy+h/2-tol)&(mx[:,2]>cz-d/2+tol)&(mn[:,2]<cz+d/2-tol)
        if bool(np.any(overlap)): errors.append('new wall opening intrudes void '+e['id'])
    elif 'clearLength' in vc:
        # Curbs live around x/z opening; check their footprint doesn't enter promised x/z hole below top curb.
        w=float(vc['clearWidth']); l=float(vc['clearLength']); cx,cy,cz=map(float,vc['center']); d=float(vc['clearDepth']); tris=mm.vertices[mm.faces]; mn=tris.min(axis=1); mx=tris.max(axis=1); tol=1e-4
        overlap=(mx[:,0]>cx-w/2+tol)&(mn[:,0]<cx+w/2-tol)&(mx[:,2]>cz-l/2+tol)&(mn[:,2]<cz+l/2-tol)&(mn[:,1]<cy+d/2-tol)
        if bool(np.any(overlap)): errors.append('new slab opening intrudes void '+e['id'])
# traversal safety tags for new stairs
for e in new:
    if 'stair' in e['semanticGraph']['roles']:
        if e.get('stepRise',0) and e['stepRise']>.20: errors.append('step rise too high '+e['id'])
        if e.get('stepDepth',1) and e['stepDepth']<.22: errors.append('step depth too short '+e['id'])

report={'version':4,'assetCount':len(assets),'previousAssetCount':len(v3['assets']),'newAssetCount':len(new),'newReloadSuccess':len(new)-sum(1 for x in errors if x.startswith('reload ')),
        'newTrianglesTotal':sum(tri),'newTrianglesMedian':int(np.median(tri)) if tri else 0,'newTrianglesMax':max(tri) if tri else 0,'newGlbBytes':sum(sizes),
        'allAssetsSemanticGraphTagged':len(assets)-sum(1 for e in assets if not e.get('semanticGraph')),'sourceCounts':dict(source_counts),'newFamilyCounts':dict(Counter(e['semanticCategory'] for e in new)),'errors':errors}
(ROOT/'validation-report-v4.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
if errors: raise SystemExit('VALIDATION FAILED\n'+json.dumps(errors[:50],indent=2))
(PACK/'VALIDATION.txt').write_text('\n'.join([
 'JWEB SEMANTIC MEGACORPUS V4 — CORPUS ONLY','',f'total assets: {len(assets):,}',f'previous assets retained: {len(v3["assets"]):,}',f'new assets: {len(new):,}',
 f'all assets rich semanticGraph tagged: {len(assets):,}/{len(assets):,}',f'new GLB reload: {len(new):,}/{len(new):,}',f'new triangles total: {sum(tri):,}',f'new median tris: {int(np.median(tri)):,}',f'new max tris: {max(tri):,}',
 'negative-space new openings clear-volume check: PASS','new stair rise/depth policy: PASS','topology/refinement invariants present on every asset: PASS','runtime wiring included: NO','errors: 0',''
]),encoding='utf-8')

# zip corpus only, root-shaped overlay (README + vendor)
zip_path=OUT/'jweb-semantic-megacorpus-v4.zip'
if zip_path.exists(): zip_path.unlink()
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for fp in sorted(PACK.rglob('*')):
        if fp.is_file(): z.write(fp,fp.relative_to(PACK))
sha=hashlib.sha256(zip_path.read_bytes()).hexdigest()
summary={'zip':str(zip_path),'sha256':sha,'zipBytes':zip_path.stat().st_size,**report}
(WORK/'v4-build-output.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
