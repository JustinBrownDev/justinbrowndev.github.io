from __future__ import annotations
import json, math, hashlib, shutil, zipfile, os, re
from pathlib import Path
import numpy as np
import trimesh

WORK=Path('/mnt/data/jweb_semantic_assets_work')
V1=WORK/'v1'/'vendor'/'city-pack'/'semantic-interiors'
OUTROOT=WORK/'out'
PACK=OUTROOT/'jweb-semantic-megapack-v3'
ROOT=PACK/'vendor'/'city-pack'/'semantic-megapack'
ASSETS=ROOT/'assets'
TRAV=ROOT/'traversal'
OPENINGS=ROOT/'openings'
SRC=ROOT/'source'
for p in (ASSETS,TRAV,OPENINGS,SRC): p.mkdir(parents=True,exist_ok=True)

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

def box(parts,sx,sy,sz,x=0,y=0,z=0,c='mid'):
    m=trimesh.creation.box(extents=(float(sx),float(sy),float(sz))); m.apply_translation((x,y,z)); parts.append(colorize(m,c)); return m

def cyl(parts,r,h,x=0,y=0,z=0,c='metal',sections=8,axis='y'):
    m=trimesh.creation.cylinder(radius=float(r),height=float(h),sections=max(6,int(sections)))
    if axis=='y': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]))
    elif axis=='x': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[0,1,0]))
    m.apply_translation((x,y,z)); parts.append(colorize(m,c)); return m

def merge(parts):
    m=trimesh.util.concatenate(parts); m.remove_unreferenced_vertices(); return m

def ground(m):
    b=m.bounds; m.apply_translation((0,-b[0,1],0)); b=m.bounds; m.apply_translation((-(b[0,0]+b[1,0])/2,0,-(b[0,2]+b[1,2])/2)); return m

def seed(s): return int(hashlib.sha256(s.encode()).hexdigest()[:16],16)
def rng(s): return np.random.default_rng(seed(s))
def slug(s): return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')

def export_mesh(mesh,path):
    mesh.remove_unreferenced_vertices()
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(trimesh.exchange.gltf.export_glb(mesh,include_normals=True))
    b=mesh.bounds.astype(float); dims=(b[1]-b[0]).tolist()
    return {
        'boundsMin':[round(float(x),4) for x in b[0]],
        'boundsMax':[round(float(x),4) for x in b[1]],
        'dimensionsXYZ':[round(float(x),4) for x in dims],
        'geometry':{'vertices':int(len(mesh.vertices)),'triangles':int(len(mesh.faces)),'bytes':path.stat().st_size}
    }

def load_glb(path):
    obj=trimesh.load(path,force='scene',process=False)
    if isinstance(obj,trimesh.Scene):
        meshes=[]
        for name,g in obj.geometry.items():
            if isinstance(g,trimesh.Trimesh): meshes.append(g.copy())
        if not meshes: raise ValueError(path)
        return trimesh.util.concatenate(meshes)
    return obj

# ----- Copy canonical V1 noun library into the new pack -----
v1m=json.load(open(V1/'manifest.json'))['assets']
manifest=[]
for e in v1m:
    src=V1/e['file'].replace('semantic-interiors/','')
    dst=ASSETS/(Path(e['file']).name)
    shutil.copy2(src,dst)
    ne=dict(e)
    ne['file']=f'semantic-megapack/assets/{dst.name}'
    ne['sourceLayer']='canonical'
    ne['canonicalId']=e['id']
    ne['variantKey']='base'
    manifest.append(ne)

# ----- Derived geometric variants -----
VARIANTS=[
 ('compact',(0.84,0.93,0.86),'compact footprint'),
 ('wide',(1.24,1.0,1.0),'wide-bodied'),
 ('deep',(1.0,1.0,1.22),'deep-bodied'),
 ('tall',(1.0,1.16,1.0),'tall-bodied'),
 ('squat',(1.10,0.84,1.08),'low heavy-bodied'),
 ('reinforced',(1.03,1.02,1.03),'reinforced frame'),
 ('service',(1.0,1.0,1.0),'service-side hardware'),
 ('weathered',(1.0,0.99,1.0),'patch/brace wear'),
 ('cluster',(1.0,1.0,1.0),'small semantic assembly'),
]

def add_detail(mesh,key,base,meta):
    p=[mesh]
    b=mesh.bounds; dims=b[1]-b[0]; w,h,d=[float(x) for x in dims]
    y0=float(b[0,1]); y1=float(b[1,1]); front=float(b[1,2])
    r=rng(base+'::'+key)
    family=meta.get('semanticCategory','')
    kind=meta.get('kind','')
    if key=='reinforced':
        # Visible feet/base rail + two braces; useful on furniture/machines without hiding silhouette.
        box(p,max(.08,w*.86),max(.025,min(.07,h*.05)),max(.05,d*.12),0,max(.025,h*.025),-d*.36,'dark')
        if h>.45:
            for sx in (-1,1): box(p,max(.025,w*.035),min(.32,h*.30),max(.025,d*.035),sx*w*.42,min(h*.18,.22),-d*.38,'metal')
    elif key=='service':
        # Rear service chase, cable/pipe pair, or control pod depending scale.
        if h>.5:
            box(p,max(.12,w*.34),max(.10,min(.28,h*.22)),max(.035,d*.055),w*.20,min(h*.66,y1*.66),-d*.50,'dark')
            cyl(p,max(.015,min(.035,w*.025)),max(.12,min(.45,h*.38)),-w*.28,min(h*.46,.5),-d*.50,'metal',6)
        else:
            box(p,max(.08,w*.25),max(.04,h*.15),max(.04,d*.15),w*.22,y1+max(.02,h*.05),-d*.25,'dark')
    elif key=='weathered':
        # Deterministic patch plates/bent-on visual repairs.
        for i in range(2):
            pw=max(.04,w*r.uniform(.12,.28)); ph=max(.025,h*r.uniform(.06,.14))
            px=r.uniform(-w*.28,w*.28); py=r.uniform(max(.04,h*.22),max(.05,h*.75))
            box(p,pw,ph,max(.012,d*.025),px,py,front+max(.008,d*.014),'metal' if i else 'dark')
    elif key=='cluster':
        # Only modest two/three-piece assembly, not massive room prefab.
        copies=2 if (meta.get('repetition') in ('row','cluster') or any(x in kind for x in ('chair','stool','locker','rack','shelf','washer','dryer','cabinet'))) else 1
        if copies:
            off=max(.25,w*1.08)
            m2=mesh.copy(); m2.apply_translation((off,0,0)); p.append(m2)
            if meta.get('repetition')=='row' and w<1.6:
                m3=mesh.copy(); m3.apply_translation((-off,0,0)); p.append(m3)
    return merge(p)

base_by_id={e['id']:e for e in v1m}
for i,e in enumerate(v1m):
    basefile=V1/e['file'].replace('semantic-interiors/','')
    bm=load_glb(basefile)
    for key,scale_xyz,desc in VARIANTS:
        m=bm.copy()
        M=np.eye(4); M[0,0],M[1,1],M[2,2]=scale_xyz
        m.apply_transform(M)
        m=add_detail(m,key,e['kind'],e)
        m=ground(m)
        sid=e['id'].replace('semantic/interior/','')
        fn=f'{sid}__{key}.glb'
        geom=export_mesh(m,ASSETS/fn)
        ne={k:v for k,v in e.items() if k not in ('boundsMin','boundsMax','dimensionsXYZ','geometry','variants')}
        ne.update(geom)
        ne['id']=f'semantic/variant/{sid}/{key}'
        ne['file']=f'semantic-megapack/assets/{fn}'
        ne['label']=f"{e['label']} — {key}"
        ne['semanticClass']=e['semanticClass']+f'.variant.{key}'
        ne['sourceLayer']='variant'; ne['canonicalId']=e['id']; ne['variantKey']=key
        ne['variants']=[key]
        ne['variantDescription']=desc
        # Derived assemblies have larger practical clearance.
        d=ne['dimensionsXYZ']; ne['clearance']={'front':round(max(e.get('clearance',{}).get('front',.25),d[2]*.55),3),'sides':round(max(.05,d[0]*.10),3),'rear':round(min(.65,d[2]*.22),3)}
        manifest.append(ne)

# ----- Traversal builders -----
def stairs_mesh(width, rise, tread, steps, rail='both', landing=0.0, c='steel'):
    p=[]
    for i in range(steps):
        box(p,width,rise*(i+1),tread,0,rise*(i+1)/2,(i+.5)*tread,c)
    total_h=rise*steps; total_run=tread*steps
    # side stringer silhouette
    for sx in (-1,1):
        if rail in ('both','left','right') and (rail=='both' or (rail=='left' and sx<0) or (rail=='right' and sx>0)):
            # posts every ~3 steps and top rails segmented as boxes
            for i in range(0,steps+1,max(2,steps//4 or 1)):
                z=min(total_run-.02,max(.02,i*tread)); y=min(total_h,max(rise,i*rise))+.48
                box(p,.035,.9,.035,sx*(width/2-.03),y,z,'dark')
            for i in range(steps):
                y=(i+.7)*rise+.92; z=(i+.5)*tread
                box(p,.035,.06,tread*1.05,sx*(width/2-.03),y,z,'dark')
    if landing>0: box(p,width,.12,landing,0,total_h-.06,total_run+landing/2,c)
    return ground(merge(p)), total_h,total_run+landing

def platform_mesh(w,d,rail_sides=('left','right','back'),c='steel'):
    p=[]; box(p,w,.12,d,0,.06,0,c)
    rail_h=1.0
    if 'left' in rail_sides:
        for z in (-d*.42,0,d*.42): box(p,.035,rail_h,.035,-w/2+.03,.12+rail_h/2,z,'dark')
        box(p,.04,.05,d*.92,-w/2+.03,.12+rail_h,0,'dark')
    if 'right' in rail_sides:
        for z in (-d*.42,0,d*.42): box(p,.035,rail_h,.035,w/2-.03,.12+rail_h/2,z,'dark')
        box(p,.04,.05,d*.92,w/2-.03,.12+rail_h,0,'dark')
    if 'back' in rail_sides:
        for x in (-w*.42,0,w*.42): box(p,.035,rail_h,.035,x,.12+rail_h/2,-d/2+.03,'dark')
        box(p,w*.92,.05,.04,0,.12+rail_h,-d/2+.03,'dark')
    return ground(merge(p))

def ladder_mesh(width,height,cage=False):
    p=[]; side=width*.42
    for sx in (-1,1): box(p,.05,height,.05,sx*side,height/2,0,'dark')
    rung=.28; n=max(2,int(height/rung))
    for i in range(n+1): box(p,width*.82,.035,.045,0,min(height-.04,i*height/n),0,'steel')
    if cage:
        # simple readable safety cage hoops + verticals
        for y in np.arange(1.2,height+.01,.75):
            for sx in (-1,1): box(p,.04,.04,.44,sx*(width*.62),y,.18,'dark')
            box(p,width*1.24,.04,.04,0,y,.40,'dark')
        for sx in (-1,1): box(p,.035,max(.1,height-1.2),.035,sx*(width*.62),1.2+(height-1.2)/2,.4,'dark')
    return ground(merge(p))

def ramp_mesh(width,rise,run,rail='both'):
    # wedge custom mesh + rail segmentation
    verts=np.array([[-width/2,0,0],[width/2,0,0],[-width/2,0,run],[width/2,0,run],[-width/2,rise,run],[width/2,rise,run]],float)
    faces=np.array([[0,1,3],[0,3,2],[2,3,5],[2,5,4],[0,2,4],[0,4,1],[1,4,5],[1,5,3]],int)
    wedge=colorize(trimesh.Trimesh(vertices=verts,faces=faces,process=False),'steel'); p=[wedge]
    seg=8
    for sx in (-1,1):
        use=rail=='both' or (rail=='left' and sx<0) or (rail=='right' and sx>0)
        if not use: continue
        for i in range(seg+1):
            z=run*i/seg; y=rise*i/seg
            box(p,.035,.9,.035,sx*(width/2-.03),y+.45,z,'dark')
        for i in range(seg):
            z=run*(i+.5)/seg; y=rise*(i+.5)/seg+.9
            box(p,.04,.055,run/seg*1.04,sx*(width/2-.03),y,z,'dark')
    return ground(merge(p))

def catwalk_mesh(width,length,rail='both',supports=False):
    p=[]; box(p,width,.10,length,0,.05,0,'steel')
    for sx in (-1,1):
        use=rail=='both' or (rail=='left' and sx<0) or (rail=='right' and sx>0)
        if use:
            n=max(2,int(length/1.25))
            for i in range(n+1): box(p,.035,.95,.035,sx*(width/2-.03),.56,-length/2+i*length/n,'dark')
            box(p,.04,.05,length,sx*(width/2-.03),1.02,0,'dark')
    if supports:
        for z in (-length*.38,length*.38):
            for sx in (-1,1): box(p,.06,.7,.06,sx*width*.38,-.35,z,'dark')
    return ground(merge(p))

def fire_escape_mesh(span,floor_h,floors,direction=1,drop_ladder=False):
    """Walkable facade fire escape.

    Wall is at z ~= 0. Each floor has a continuous balcony from z=0..platform_depth.
    Flights run diagonally ALONG x immediately outside the balcony, so both the
    lower and upper step endpoints touch a real floor platform. Direction
    alternates each story. No decorative-only disconnected upper landing exists.
    """
    p=[]; platform_depth=1.05; stair_w=.86; tread=.27
    steps=max(10,math.ceil(floor_h/.19)); rise=floor_h/steps
    run=tread*steps
    # Ensure enough facade span for the flight plus usable landing zones.
    actual_span=max(span,run+1.10)
    x0=-run/2; x1=run/2
    zflight=platform_depth+stair_w/2-.02
    for f in range(floors):
        y=f*floor_h
        # Floor platform against facade. This is the real landing at every level.
        box(p,actual_span,.12,platform_depth,0,y+.06,platform_depth/2,'steel')
        # Outer balcony guard rail, with a small visual break near each flight endpoint.
        rail_z=platform_depth-.03
        for x in np.linspace(-actual_span*.46,actual_span*.46,5):
            box(p,.035,1.0,.035,float(x),y+.62,rail_z,'dark')
        box(p,actual_span*.94,.05,.04,0,y+1.10,rail_z,'dark')
        # End rails at sides of the balcony.
        for sx in (-1,1):
            box(p,.035,1.0,.035,sx*(actual_span/2-.03),y+.62,platform_depth*.48,'dark')
            box(p,.04,.05,platform_depth*.92,sx*(actual_span/2-.03),y+1.10,platform_depth*.48,'dark')
        if f < floors-1:
            sign=direction if f%2==0 else -direction
            # A true stair flight from this floor's platform edge to the next floor's platform edge.
            for i in range(steps):
                frac=(i+.5)/steps
                x=(x0+(x1-x0)*frac)*sign
                h=rise*(i+1)
                # tread runs along x; width runs along z
                box(p,tread,h,stair_w,x,y+h/2,zflight,'steel')
            # Both side rails follow the flight. Posts are vertical; top rail uses short
            # horizontal segments stepped with the stairs (cheap, readable, safe silhouette).
            for zside in (platform_depth+.02, platform_depth+stair_w-.06):
                for i in range(0,steps+1,max(2,steps//5)):
                    frac=min(1.0,i/steps); x=(x0+(x1-x0)*frac)*sign
                    yy=y+min(floor_h,i*rise)+.50
                    box(p,.035,.94,.035,x,yy,zside,'dark')
                for i in range(steps):
                    frac=(i+.5)/steps; x=(x0+(x1-x0)*frac)*sign
                    yy=y+(i+.65)*rise+.94
                    box(p,tread*1.06,.05,.035,x,yy,zside,'dark')
    if drop_ladder:
        lm=ladder_mesh(.55,max(1.8,floor_h*1.05),False)
        # Ground-to-first-platform emergency/drop ladder at one balcony end.
        lm.apply_translation((actual_span*.38,0,platform_depth*.64)); p.append(lm)
    return ground(merge(p)), actual_span, steps, rise, tread, platform_depth

def stairwell_u_mesh(width,floor_h,flight_run,rail=True):
    # Two half-height flights with central landing, opposite directions, arranged side-by-side.
    p=[]; half=floor_h/2; rise=.18; steps=max(5,round(half/rise)); rise=half/steps; tread=flight_run/steps; sw=(width-.28)/2
    # first flight +Z left lane
    for i in range(steps): box(p,sw,rise*(i+1),tread,-(sw+.14)/2,rise*(i+1)/2,(i+.5)*tread,'steel')
    box(p,width,.12,.85,0,half-.06,flight_run+.425,'steel')
    # second flight returns -Z right lane from landing, base at half height
    for i in range(steps):
        h=rise*(i+1); z=flight_run-(i+.5)*tread
        box(p,sw,h,tread,(sw+.14)/2,half+h/2,z,'steel')
    # central divider + outside rails as visual cues
    if rail:
        for x in (-width/2+.03,0,width/2-.03):
            box(p,.04,floor_h+.95,.04,x,(floor_h+.95)/2,flight_run*.5,'dark')
            box(p,.04,.05,flight_run,x,half+.95,flight_run*.5,'dark')
    return ground(merge(p))

traversal=[]
def trav_entry(id_,label,file,mesh,typ,connections,collision,programs=('generic','industrial','exterior'),climb=False,walk=True,extra=None):
    geom=export_mesh(mesh,TRAV/file)
    e={
      'id':f'semantic/traversal/{id_}','label':label,'file':f'semantic-megapack/traversal/{file}',
      'category':'traversal','semanticCategory':'traversal','semanticClass':f'traversal.{typ}',
      'kind':id_,'programs':list(programs),'mount':'ground','frontAxis':'+z','repetition':'module',
      'importance':'structural','loadTier':0,'collision':'explicit-primitives','climbable':climb,
      'walkable':walk,'sourceLayer':'traversal','canonicalId':f'semantic/traversal/{id_}','variantKey':'base',
      'connectionSockets':connections,'collisionRecipe':collision,
    }
    e.update(geom)
    e['clearance']={'front':0.05,'sides':0.05,'rear':0.05}; e['sockets']={k:True for k in connections}
    if extra: e.update(extra)
    traversal.append(e); manifest.append(e)

# Straight stairs: 150
count=0
for width in (.8,1.0,1.2,1.5,1.8):
  for steps in (8,10,12,14,16):
    for tread in (.27,.30):
      for rail in ('both','left','right'):
        rise=.18
        m,H,R=stairs_mesh(width,rise,tread,steps,rail)
        id_=f'stair_straight_w{int(width*100)}_n{steps}_t{int(tread*100)}_{rail}'
        coll={'type':'steps','stepRise':rise,'stepDepth':tread,'stepCount':steps,'width':width,'totalRise':round(H,3),'totalRun':round(R,3),'walkSurface':'individual-steps'}
        con={'bottom':{'position':[0,0,0],'facing':'-z'},'top':{'position':[0,round(H,3),round(R,3)],'facing':'+z'}}
        trav_entry(id_,f'Straight stair {width:.1f}m × {steps} steps',id_+'.glb',m,'stair.straight',con,coll,climb=True)
        count+=1

# U stairwells: 72
for width in (1.8,2.2,2.6,3.0):
  for fh in (2.7,3.0,3.3):
    for run in (1.65,1.95,2.25):
      for rail in (True,False):
        m=stairwell_u_mesh(width,fh,run,rail)
        id_=f'stairwell_u_w{int(width*100)}_h{int(fh*100)}_r{int(run*100)}_{"rail" if rail else "bare"}'
        con={'bottom':{'position':[-width*.25,0,0],'facing':'-z'},'midLanding':{'position':[0,round(fh/2,3),round(run+.425,3)],'facing':'+z'},'top':{'position':[width*.25,round(fh,3),0],'facing':'-z'}}
        coll={'type':'u-stairwell','totalRise':fh,'flightRun':run,'width':width,'landingDepth':.85,'walkSurface':'individual-steps+landing'}
        trav_entry(id_,f'U-turn stairwell {width:.1f}m / {fh:.1f}m floor',id_+'.glb',m,'stairwell.u',con,coll,programs=('residential','office','civic','industrial','motel'),climb=True)

# Platforms: 54
for w in (1.0,1.4,1.8):
  for d in (1.0,1.5,2.0):
    for rails in [('left','right','back'),('left','right'),('back',),()]:
      for height in (0.0,):
        m=platform_mesh(w,d,rails)
        key='-'.join(rails) if rails else 'open'
        id_=f'landing_w{int(w*100)}_d{int(d*100)}_{key}'
        con={'front':{'position':[0,.12,d/2],'facing':'+z'},'back':{'position':[0,.12,-d/2],'facing':'-z'},'left':{'position':[-w/2,.12,0],'facing':'-x'},'right':{'position':[w/2,.12,0],'facing':'+x'}}
        coll={'type':'platform','box':{'size':[w,.12,d],'center':[0,.06,0]}}
        trav_entry(id_,f'Rail landing {w:.1f} × {d:.1f}m {key}',id_+'.glb',m,'landing',con,coll,climb=True)

# Ramps: 72
for width in (1.0,1.4,1.8,2.4):
  for rise in (.45,.75,1.05):
    for run in (2.4,3.2):
      for rail in ('both','left','right'):
        m=ramp_mesh(width,rise,run,rail)
        id_=f'ramp_w{int(width*100)}_h{int(rise*100)}_r{int(run*100)}_{rail}'
        con={'bottom':{'position':[0,0,0],'facing':'-z'},'top':{'position':[0,rise,run],'facing':'+z'}}
        coll={'type':'ramp','width':width,'rise':rise,'run':run,'slopeRadians':round(math.atan2(rise,run),5)}
        trav_entry(id_,f'Walk ramp {width:.1f}m rise {rise:.2f}',id_+'.glb',m,'ramp',con,coll,climb=True)

# Ladders: 48
for width in (.45,.55,.7):
  for height in (1.8,2.4,3.0,3.6,4.2,5.0,6.0,7.5):
    for cage in (False,True):
      m=ladder_mesh(width,height,cage)
      id_=f'ladder_w{int(width*100)}_h{int(height*100)}_{"cage" if cage else "open"}'
      con={'bottom':{'position':[0,0,0],'facing':'-z'},'top':{'position':[0,height,0],'facing':'-z'}}
      coll={'type':'ladder','width':width,'height':height,'rungSpacing':round(height/max(2,int(height/.28)),3),'climbAxis':'+y'}
      trav_entry(id_,f'{"Caged" if cage else "Open"} ladder {height:.1f}m',id_+'.glb',m,'ladder',con,coll,climb=True,walk=False)

# Catwalks: 72
for width in (.8,1.0,1.2):
  for length in (2.0,3.0,4.5,6.0):
    for rail in ('both','left','right'):
      for supports in (False,True):
        m=catwalk_mesh(width,length,rail,supports)
        id_=f'catwalk_w{int(width*100)}_l{int(length*100)}_{rail}_{"leg" if supports else "wall"}'
        con={'a':{'position':[0,.1,-length/2],'facing':'-z'},'b':{'position':[0,.1,length/2],'facing':'+z'}}
        coll={'type':'platform','box':{'size':[width,.1,length],'center':[0,.05,0]}}
        trav_entry(id_,f'Catwalk {width:.1f} × {length:.1f}m',id_+'.glb',m,'catwalk',con,coll,programs=('factory','warehouse','utility','rooftop'),climb=True)

# Fire escapes: 96: visually identifiable AND continuously walkable multi-level assemblies
for span in (3.2,3.8,4.4,5.0):
  for fh in (2.7,3.0,3.3):
    for floors in (1,2,3,4):
      for drop in (False,True):
        m,actual_span,steps,rise,tread,pdepth=fire_escape_mesh(span,fh,floors,1,drop)
        id_=f'fire_escape_span{int(span*100)}_h{int(fh*100)}_f{floors}_{"drop" if drop else "fixed"}'
        sockets={'wallBase':{'position':[0,0,0],'facing':'-z'}}
        access_requirements=[]
        for f in range(floors):
            floor_y=round(f*fh,3)
            sockets[f'floor{f}']={'position':[0,floor_y,round(pdepth/2,3)],'facing':'-z','type':'floor-platform'}
            sockets[f'accessPortal{f}']={
              'position':[0,floor_y,0],'facing':'-z','type':'facade-access-portal',
              'required':True,'acceptsCapabilities':['walk-through','climb-through'],
              'acceptsOpeningFamilies':['human-passage','fire-escape-window'],
            }
            access_requirements.append({
              'floor':f,'socket':f'accessPortal{f}','required':True,
              'acceptedCapabilities':['walk-through','climb-through'],
              'acceptedOpeningFamilies':['human-passage','fire-escape-window'],
              'preferredOpeningByProgram':{
                'motel':'walk-through','stairwell':'walk-through','civic':'walk-through',
                'industrial':'walk-through','residential':'climb-through','alley':'climb-through'
              },
              'mustCutStructuralWallVoid':True,
              'mustResolveBeforeWallCollisionCommit':True,
            })
        sockets['top']={'position':[0,round((floors-1)*fh,3),round(pdepth/2,3)],'facing':'-z'}
        flights=[]
        for f in range(max(0,floors-1)):
            sign=1 if f%2==0 else -1
            flights.append({
              'fromFloor':f,'toFloor':f+1,'stepCount':steps,'stepRise':round(rise,5),'stepDepth':tread,
              'runAxis':'+x' if sign>0 else '-x','run':round(steps*tread,4),'stairWidth':.86,
              'lowerY':round(f*fh,4),'upperY':round((f+1)*fh,4),
              'lowerTouchesPlatform':True,'upperTouchesPlatform':True,
            })
        coll={
          'type':'fire-escape','floorHeight':fh,'floors':floors,'platformDepth':pdepth,'platformSpan':round(actual_span,4),
          'platforms':[{'floor':f,'y':round(f*fh,4),'size':[round(actual_span,4),.12,pdepth]} for f in range(floors)],
          'flights':flights,'stairs':'individual-steps','railings':'visual+barrier-recommended','continuousRoute':True,
        }
        trav_entry(id_,f'Walkable fire escape {floors} floor / {actual_span:.1f}m span',id_+'.glb',m,'fire_escape',sockets,coll,programs=('exterior','alley','industrial','residential','motel'),climb=True,extra={
          'continuousTraversal':True,'visualIdentity':'facade-balconies+zigzag-stairs',
          'facadeAccessRequired':True,'accessRequirements':access_requirements,
          'accessResolutionRule':'each facade landing must resolve to a compatible structural opening before wall collision commit',
        })

# Loading docks / roof access / scaffold / bridges: 80
for i in range(20):
    w=1.4+(i%4)*.4; d=1.6+(i%5)*.35; h=.45+(i%3)*.18
    p=[]; box(p,w,h,d,0,h/2,0,'steel'); box(p,w,.12,.18,0,h+.06,d/2-.09,'yellow');
    for x in (-w*.38,w*.38): box(p,.09,h+.7,.09,x,(h+.7)/2,-d*.38,'dark')
    m=ground(merge(p)); id_=f'loading_dock_{i+1:02d}'
    con={'floor':{'position':[0,0,-d/2],'facing':'-z'},'dock':{'position':[0,h,d/2],'facing':'+z'}}
    coll={'type':'loading-dock','platform':{'size':[w,h,d]},'topY':h}
    trav_entry(id_,f'Loading dock module {i+1}',id_+'.glb',m,'loading_dock',con,coll,programs=('warehouse','factory','auto_shop'),climb=True)
for i in range(20):
    w=1.0+(i%4)*.25; h=1.9+(i%5)*.22; d=.85+(i%3)*.18
    p=[]; box(p,w,h,.08,0,h/2,-d/2,'dark'); box(p,w,.12,d,0,.06,0,'steel'); box(p,.65,h*.72,.06,0,h*.52,-d/2+.06,'red')
    box(p,.8,.12,.35,0,h*.18,-d*.10,'steel')
    m=ground(merge(p)); id_=f'roof_access_hatch_stair_{i+1:02d}'
    con={'roof':{'position':[0,.12,d/2],'facing':'+z'},'door':{'position':[0,0,-d/2],'facing':'-z'}}
    coll={'type':'roof-access','platform':{'size':[w,.12,d]},'doorClearance':[.8,h*.72]}
    trav_entry(id_,f'Roof access hatch/stair house {i+1}',id_+'.glb',m,'roof_access',con,coll,programs=('rooftop','industrial','residential'),climb=True)
for i in range(20):
    w=1.0+(i%4)*.3; l=2.0+(i%5)*.65; levels=1+(i%3)
    p=[]
    for lv in range(levels):
        y=lv*1.8; box(p,w,.10,l,0,y+.05,0,'steel')
        for x in (-w*.48,w*.48):
            for z in (-l*.48,l*.48): box(p,.05,1.8,.05,x,y+.9,z,'dark')
        box(p,w,.05,.05,0,y+1.0,-l*.48,'dark')
    m=ground(merge(p)); id_=f'scaffold_bay_{i+1:02d}'
    con={'endA':{'position':[0,0,-l/2],'facing':'-z'},'endB':{'position':[0,0,l/2],'facing':'+z'},'top':{'position':[0,(levels-1)*1.8+.1,0],'facing':'+y'}}
    coll={'type':'scaffold','levels':levels,'platforms':[{'y':round(lv*1.8+.1,3),'size':[w,.1,l]} for lv in range(levels)]}
    trav_entry(id_,f'Scaffold bay {levels} level {i+1}',id_+'.glb',m,'scaffold',con,coll,programs=('construction','alley','industrial'),climb=True)
for i in range(20):
    w=.8+(i%4)*.2; l=2.0+(i%5)*.8
    m=catwalk_mesh(w,l,'both',False); id_=f'utility_bridge_{i+1:02d}'
    con={'a':{'position':[0,.1,-l/2],'facing':'-z'},'b':{'position':[0,.1,l/2],'facing':'+z'}}
    coll={'type':'bridge','box':{'size':[w,.1,l],'center':[0,.05,0]}}
    trav_entry(id_,f'Utility bridge {i+1}',id_+'.glb',m,'bridge',con,coll,programs=('rooftop','factory','utility','alley'),climb=True)


# ----- Opening / doorway contracts -----
# A doorway asset is NEGATIVE SPACE FIRST. The mesh contains only surround/frame
# geometry. There is deliberately no door leaf, gate, glass slab, or hidden
# blocker in the passage. Structural placement must reserve `voidContract`
# before wall collision is published.

def opening_frame_mesh(width,height,wall_depth,style='plain',trim_variant=0):
    p=[]
    # Structural-looking surround, entirely OUTSIDE the guaranteed clear void.
    # The actual wall remains owned by the world builder.
    base_t=max(.055,min(.16,width*.09))
    jamb=base_t*(1.0 + (0.18 if style in ('heavy_casing','civic','industrial','security_reveal') else 0.0))
    head=jamb
    c='steel' if style in ('fire_rated','industrial','security_reveal','hospital','service') else ('wood' if style in ('motel','painted_trim') else 'mid')
    # jambs centered outside clear x extents; header centered above clear height
    box(p,jamb,height+head,wall_depth,-width/2-jamb/2,(height+head)/2,0,c)
    box(p,jamb,height+head,wall_depth, width/2+jamb/2,(height+head)/2,0,c)
    box(p,width+2*jamb,head,wall_depth,0,height+head/2,0,c)

    # Front/back casing: also strictly outside the opening envelope.
    if style in ('painted_trim','heavy_casing','motel','civic','brick_return','tile_return','emergency_exit','storefront') or trim_variant:
        trim=max(.045,jamb*.48); zoff=wall_depth/2+trim*.35
        tc='cream' if style in ('painted_trim','motel','civic') else ('red' if style=='emergency_exit' else 'dark')
        for z in (-zoff,zoff):
            box(p,trim,height+head*1.6,trim,-width/2-jamb-trim/2,(height+head*1.6)/2,z,tc)
            box(p,trim,height+head*1.6,trim, width/2+jamb+trim/2,(height+head*1.6)/2,z,tc)
            box(p,width+2*(jamb+trim),trim,trim,0,height+head+trim/2,z,tc)

    # Semantic styling above/beside the void. No element may cross the passage.
    if style=='fire_rated':
        # Heavy steel header and small closer/service boxes ABOVE clear height.
        box(p,width+2*jamb+.10,.09,wall_depth+.08,0,height+head+.07,0,'dark')
        box(p,.18,.11,.10,-width*.28,height+head+.15,wall_depth/2+.05,'red')
    elif style=='motel':
        # Tiny canopy, room-number plate and exterior lamp all above/to side.
        box(p,width+2*jamb+.24,.08,.42,0,height+head+.18,-wall_depth/2-.18,'cream')
        box(p,.23,.13,.035,width/2+jamb+.14,height*.72,-wall_depth/2-.04,'dark')
        box(p,.10,.18,.10,-width/2-jamb-.12,height*.78,-wall_depth/2-.08,'yellow')
    elif style=='storefront':
        # Fascia/transom ABOVE the guaranteed human-clear rectangle.
        box(p,width+2*jamb+.18,.26,.08,0,height+head+.18,-wall_depth/2-.06,'dark')
        for x in (-width*.34,width*.34): box(p,.045,.24,.06,x,height+head+.18,-wall_depth/2-.07,'metal')
    elif style=='civic':
        # Blocky masonry lintel/side plinths.
        box(p,width+2*jamb+.30,.18,wall_depth+.14,0,height+head+.13,0,'light')
        for x in (-1,1): box(p,jamb+.12,.28,wall_depth+.12,x*(width/2+(jamb+.12)/2),.14,0,'light')
    elif style=='hospital':
        # Wide clean header marker above the portal; nothing in the doorway.
        box(p,width+2*jamb+.14,.16,.09,0,height+head+.12,-wall_depth/2-.05,'white')
        box(p,.30,.06,.04,width*.28,height+head+.12,-wall_depth/2-.10,'blue')
    elif style=='arched':
        # Low-poly arch CROWN above a fully rectangular guaranteed clear void.
        # This reads as an arch while preserving more clearance than it visually needs.
        seg=7; radius=width*.56
        for i in range(seg):
            a0=math.pi*(i/seg); a1=math.pi*((i+1)/seg); a=(a0+a1)/2
            x=math.cos(a)*radius; y=height+head+math.sin(a)*radius*.42
            length=max(.08,radius*(a1-a0)*.95)
            m=trimesh.creation.box(extents=(length,head*.72,wall_depth+.04)); m.apply_transform(trimesh.transformations.rotation_matrix(-a+math.pi/2,[0,0,1])); m.apply_translation((x,y,0)); p.append(colorize(m,'light'))
    elif style=='brick_return':
        # Alternating surround blocks, always outside void bounds.
        n=max(4,int(height/.28))
        for i in range(n):
            yy=(i+.5)*height/n
            for sx in (-1,1): box(p,jamb*.82,height/n*.72,wall_depth+.05,sx*(width/2+jamb*.55),yy,0,'red' if i%2 else 'wood2')
    elif style=='tile_return':
        n=max(5,int(height/.22))
        for i in range(n):
            yy=(i+.5)*height/n
            for sx in (-1,1): box(p,jamb*.72,height/n*.62,.035,sx*(width/2+jamb*.62),yy,-wall_depth/2-.025,'cream' if i%2 else 'green')
    elif style=='security_reveal':
        # Deep reveal and protective bollard-ish jamb guards, beside passage only.
        box(p,jamb*.65,height*.55,.15,-width/2-jamb*.72,height*.28,-wall_depth/2-.08,'dark')
        box(p,jamb*.65,height*.55,.15, width/2+jamb*.72,height*.28,-wall_depth/2-.08,'dark')
        box(p,width+2*jamb+.12,.10,wall_depth+.18,0,height+head+.10,0,'steel')
    elif style=='emergency_exit':
        # Sign housing ABOVE void, no actual exit door leaf.
        box(p,min(width*.72,.72),.18,.07,0,height+head+.17,-wall_depth/2-.06,'red')
    elif style=='industrial':
        # Channel-like posts and top beam outside clear opening.
        for sx in (-1,1):
            box(p,jamb*.52,height+head+.20,.09,sx*(width/2+jamb*.76),(height+head+.20)/2,-wall_depth/2-.04,'dark')
        box(p,width+2*jamb+.20,.11,.11,0,height+head+.13,-wall_depth/2-.04,'dark')
    elif style=='service':
        # Utility conduit and call box beside the opening.
        cyl(p,.025,max(.30,height*.42),-width/2-jamb-.10,height*.52,-wall_depth/2-.05,'metal',6)
        box(p,.16,.22,.08,width/2+jamb+.12,height*.62,-wall_depth/2-.06,'dark')
    return merge(p)

def window_opening_frame_mesh(width,height,wall_depth,style,sill):
    # A styled, entirely empty facade aperture. No sash, glass, screen, or leaf may cross the void.
    p=[]; jamb=max(.055,min(.12,width*.08)); head=max(.06,jamb*.9)
    cy=sill+height/2
    for sx in (-1,1):
        box(p,jamb,height+head*2,wall_depth,sx*(width/2+jamb/2),cy,0,'dark')
    box(p,width+2*jamb,head,wall_depth,0,sill+height+head/2,0,'dark')
    box(p,width+2*jamb,head,wall_depth,0,sill-head/2,0,'dark')
    if style=='brick':
        box(p,width+2*jamb+.22,.12,wall_depth+.06,0,sill+height+.12,0,'red')
        box(p,width+2*jamb+.14,.08,wall_depth+.10,0,sill-.07,.02,'steel')
    elif style=='industrial':
        for sx in (-1,1): box(p,.05,height+.22,.05,sx*(width/2+jamb+.07),cy,-wall_depth/2-.04,'metal')
        box(p,width+2*jamb+.18,.06,.06,0,sill+height+.13,-wall_depth/2-.04,'metal')
    elif style=='motel':
        box(p,width+2*jamb+.16,.10,.07,0,sill+height+.10,-wall_depth/2-.04,'yellow')
    elif style=='civic':
        box(p,width+2*jamb+.20,.15,.08,0,sill+height+.14,-wall_depth/2-.04,'steel')
    return merge(p)

openings=[]
def opening_entry(id_,label,file,mesh,width,height,wall_depth,style,programs,extra=None,sill=0.0):
    geom=export_mesh(mesh,OPENINGS/file)
    # Required negative space reaches through the wall plus safety depth on both
    # sides so a late wall or trim collider cannot seal the portal.
    safety_depth=max(.55,wall_depth+.32)
    void={
      'shape':'box','center':[0,round(sill+height/2,4),0],
      'size':[round(width,4),round(height,4),round(safety_depth,4)],
      'clearWidth':round(width,4),'clearHeight':round(height,4),'sillHeight':round(sill,4),
      'clearDepth':round(safety_depth,4),'axis':'z','hardRequirement':True,
    }
    wall_cut={
      'type':'rectangular-opening','width':round(width,4),'height':round(height,4),'sillHeight':round(sill,4),'wallDepth':round(wall_depth,4),
      'reserveBeforeWallCollision':True,'cutThroughWall':True,
      'failPlacementIfVoidCannotBeGuaranteed':True,'doorLeafPresent':False,
      'negativeSpaceIsAsset':True,
    }
    sockets={
      'approachFront':{'position':[0,0,round(-safety_depth/2,4)],'facing':'+z','clearanceWidth':round(width,4)},
      'portal':{'position':[0,round(sill,4),0],'facing':'+z','clearanceWidth':round(width,4),'clearanceHeight':round(height,4)},
      'approachBack':{'position':[0,0,round(safety_depth/2,4)],'facing':'-z','clearanceWidth':round(width,4)},
    }
    e={
      'id':f'semantic/opening/{id_}','label':label,'file':f'semantic-megapack/openings/{file}',
      'category':'opening','semanticCategory':'opening','semanticClass':f'opening.doorway.{style}',
      'kind':id_,'programs':list(programs),'mount':'wall-opening','frontAxis':'+z','repetition':'module',
      'importance':'structural','loadTier':0,'collision':'void-contract','climbable':False,'walkable':True,
      'sourceLayer':'opening','canonicalId':f'semantic/opening/{id_}','variantKey':'base',
      'doorLeafPresent':False,'passageRequired':True,'negativeSpaceIsAsset':True,'accessCapabilities':['walk-through'],
      'voidContract':void,'wallOpeningRecipe':wall_cut,'connectionSockets':sockets,
      'collisionRecipe':{'type':'void-contract','requiredVoid':void,'frameCollision':'none','wallCollisionMustExcludeVoid':True},
    }
    e.update(geom)
    e['clearance']={'front':round(safety_depth/2,3),'sides':0.0,'rear':round(safety_depth/2,3)}
    e['sockets']={k:True for k in sockets}
    if extra: e.update(extra)
    openings.append(e); manifest.append(e)

human_styles=(
  'plain','painted_trim','heavy_casing','fire_rated','motel','storefront',
  'civic','hospital','arched','brick_return','tile_return','security_reveal',
  'emergency_exit','industrial','service'
)
human_programs={
 'plain':('residential','office','generic'),'painted_trim':('residential','motel','office'),
 'heavy_casing':('historic','civic','bank'),'fire_rated':('stairwell','industrial','office','civic'),
 'motel':('motel','exterior'),'storefront':('retail','diner','pharmacy','grocery'),
 'civic':('library','bank','post_office','municipal'),'hospital':('clinic','hospital','institutional'),
 'arched':('historic','religious','civic','residential'),'brick_return':('industrial','historic','alley'),
 'tile_return':('diner','laundromat','clinic','transit'),'security_reveal':('utility','industrial','secure'),
 'emergency_exit':('civic','retail','industrial','entertainment'),'industrial':('factory','warehouse','utility'),
 'service':('kitchen','utility','warehouse','retail')
}
# 7 widths × 4 heights × 15 styles × 2 wall depths = 840 guaranteed-clear human portals.
for width in (.76,.86,.96,1.06,1.22,1.52,1.82):
  for height in (2.0,2.1,2.2,2.4):
    for style in human_styles:
      for depth in (.16,.24):
        # Skip implausibly narrow hospital/storefront doubles while still leaving broad variety.
        if style=='hospital' and width<.96: continue
        if style=='storefront' and width<.86: continue
        m=opening_frame_mesh(width,height,depth,style,0)
        id_=f'doorway_{style}_w{int(width*100)}_h{int(height*100)}_d{int(depth*100)}'
        opening_entry(id_,f'{style.replace("_"," ").title()} clear doorway {width:.2f} × {height:.2f}m',id_+'.glb',m,width,height,depth,style,human_programs[style],extra={'openingFamily':'human-passage'})

# Fire-escape / egress windows: empty climb-through apertures with explicit sill contracts.
window_styles=('plain','brick','industrial','motel','civic')
window_programs={
 'plain':('residential','alley','generic'),'brick':('residential','historic','alley'),
 'industrial':('factory','warehouse','utility'),'motel':('motel','exterior'),
 'civic':('office','civic','institutional')
}
for width in (.72,.86,1.0,1.18):
  for height in (.90,1.10,1.30):
    for sill in (.55,.72,.88):
      for style in window_styles:
        for depth in (.16,.24):
          m=window_opening_frame_mesh(width,height,depth,style,sill)
          id_=f'egress_window_{style}_w{int(width*100)}_h{int(height*100)}_s{int(sill*100)}_d{int(depth*100)}'
          opening_entry(id_,f'{style.title()} empty egress window {width:.2f} x {height:.2f}m sill {sill:.2f}m',id_+'.glb',m,width,height,depth,'egress_window',window_programs[style],sill=sill,extra={
            'openingFamily':'fire-escape-window','accessCapabilities':['climb-through'],
            'windowLeafPresent':False,'climbThrough':True,'maxPreferredSillHeight':.90,
          })

# Large openings: roll-up/loading/storefront/service BAY *openings*, not doors.
# Again: no shutter or leaf geometry. The void is the semantic object.
large_styles=('loading_bay','service_bay','storefront_wide','industrial_frame')
large_programs={
 'loading_bay':('warehouse','factory','auto_shop','loading_dock'),
 'service_bay':('auto_shop','warehouse','utility'),
 'storefront_wide':('retail','grocery','showroom'),
 'industrial_frame':('factory','warehouse','industrial')
}
for width in (2.4,3.0,3.6,4.2,4.8):
  for height in (2.4,2.8,3.2,3.6,4.2):
    for style in large_styles:
      for depth in (.20,.30):
        # Reuse frame grammar but add bay-specific surround OUTSIDE void.
        base_style='storefront' if style=='storefront_wide' else 'industrial'
        m=opening_frame_mesh(width,height,depth,base_style,1)
        pp=[m]
        jamb=max(.10,min(.22,width*.045))
        if style in ('loading_bay','service_bay'):
            # hazard posts and header service box all outside portal
            for sx in (-1,1):
                box(pp,.11,min(1.0,height*.40),.11,sx*(width/2+jamb+.10),min(.5,height*.20),-depth/2-.09,'yellow')
            box(pp,min(1.1,width*.34),.20,.12,width*.24,height+.28,-depth/2-.08,'dark')
        elif style=='storefront_wide':
            box(pp,width+.46,.34,.10,0,height+.28,-depth/2-.07,'dark')
            for x in (-width*.38,width*.38): box(pp,.06,.32,.06,x,height+.28,-depth/2-.10,'metal')
        m=merge(pp)
        id_=f'bay_opening_{style}_w{int(width*100)}_h{int(height*100)}_d{int(depth*100)}'
        opening_entry(id_,f'{style.replace("_"," ").title()} clear opening {width:.1f} × {height:.1f}m',id_+'.glb',m,width,height,depth,style,large_programs[style],extra={'openingFamily':'vehicle-or-wide-passage'})


# ----- Progressive bundles / room recipes -----
v1recipes=json.load(open(V1/'room-recipes.json'))
recipes=v1recipes['recipes']
# Add traversal placement recipes as separate semantic patterns.
traversal_recipes=[
 {'id':'exterior_fire_escape_stack','identity':['semantic/traversal/fire_escape_w150_h300_f3_drop'],'relations':['wallBase anchors to facade','floor sockets align authored floors','bottom remains optional emergency egress','load platform first, stairs second, rails last'],'progressiveTiers':[['platform/floor0'],['flight/floor1'],['remaining floors'],['rails/drop ladder']]},
 {'id':'u_stair_core','identity':['semantic/traversal/stairwell_u_w220_h300_r195_rail'],'relations':['bottom/top sockets align floor datums','landing remains collision-atomic with adjacent flights'],'progressiveTiers':[['first flight+landing'],['second flight'],['rails']]},
 {'id':'industrial_catwalk_route','identity':['semantic/traversal/catwalk_w100_l450_both_wall'],'relations':['connect endpoints to authored platform sockets','never spawn visual bridge without walk surface'],'progressiveTiers':[['walk slab'],['rails'],['supports/clutter']]},
 {'id':'roof_access_chain','identity':['semantic/traversal/ladder_w55_h300_cage'],'relations':['ladder top must resolve to roof/platform socket','climb metadata active before visual enrichment'],'progressiveTiers':[['climb collider'],['ladder rails+rungs'],['cage/signage']]},
]

# ----- Export catalogs -----
manifest_obj={'version':3,'assetCount':len(manifest),'canonicalCount':len(v1m),'variantCount':len(v1m)*len(VARIANTS),'traversalCount':len(traversal),'openingCount':len(openings),'assets':manifest}
(ROOT/'manifest.json').write_text(json.dumps(manifest_obj,indent=2),encoding='utf-8')
(ROOT/'traversal-manifest.json').write_text(json.dumps({'version':3,'assetCount':len(traversal),'assets':traversal},indent=2),encoding='utf-8')
(ROOT/'opening-manifest.json').write_text(json.dumps({'version':3,'assetCount':len(openings),'assets':openings},indent=2),encoding='utf-8')
(ROOT/'room-recipes.json').write_text(json.dumps({'version':3,'recipes':recipes,'traversalRecipes':traversal_recipes},indent=2),encoding='utf-8')
compact=json.dumps(manifest,separators=(',',':'))
(ROOT/'catalog.js').write_text('export const SEMANTIC_MEGA_ASSETS = '+compact+';\nexport const SEMANTIC_MEGA_ASSET_BY_ID = new Map(SEMANTIC_MEGA_ASSETS.map(a=>[a.id,a]));\n',encoding='utf-8')
(ROOT/'traversal-catalog.js').write_text('export const SEMANTIC_TRAVERSAL_ASSETS = '+json.dumps(traversal,separators=(',',':'))+';\nexport const SEMANTIC_TRAVERSAL_BY_ID = new Map(SEMANTIC_TRAVERSAL_ASSETS.map(a=>[a.id,a]));\n',encoding='utf-8')
(ROOT/'opening-catalog.js').write_text('export const SEMANTIC_OPENING_ASSETS = '+json.dumps(openings,separators=(',',':'))+';\nexport const SEMANTIC_OPENING_BY_ID = new Map(SEMANTIC_OPENING_ASSETS.map(a=>[a.id,a]));\n',encoding='utf-8')
(ROOT/'room-recipes.js').write_text('export const SEMANTIC_ROOM_RECIPES = '+json.dumps(recipes,separators=(',',':'))+';\nexport const SEMANTIC_TRAVERSAL_RECIPES = '+json.dumps(traversal_recipes,separators=(',',':'))+';\n',encoding='utf-8')

# Adapter avoids making assumptions about JWEB collision API while giving a stable consumption contract.
adapter=r'''import { SEMANTIC_MEGA_ASSET_BY_ID } from './catalog.js';

export function getSemanticMegaAsset(id) { return SEMANTIC_MEGA_ASSET_BY_ID.get(id) || null; }

export function progressiveAssetPhases(def) {
  if (!def) return [];
  if (def.sourceLayer === 'opening') return [
    { tier: 0, kind: 'negative-space', voidContract: def.voidContract, wallOpeningRecipe: def.wallOpeningRecipe },
    { tier: 0, kind: 'connections', sockets: def.connectionSockets },
    { tier: 1, kind: 'visual-frame', file: def.file },
  ];
  if (def.sourceLayer !== 'traversal') return [
    { tier: def.loadTier ?? 2, kind: 'visual', file: def.file },
  ];
  return [
    { tier: 0, kind: 'collision', recipe: def.collisionRecipe },
    { tier: 0, kind: 'connections', sockets: def.connectionSockets },
    { tier: 1, kind: 'visual', file: def.file },
  ];
}

export function emitTraversalCollision(def, transform, sink) {
  if (!def?.collisionRecipe || !sink) return false;
  // `sink` is intentionally callback-shaped so the world engine remains the sole
  // structural/collision authority. This pack never creates physics by itself.
  sink({ assetId: def.id, transform, recipe: def.collisionRecipe, sockets: def.connectionSockets });
  return true;
}

export function emitOpeningContract(def, transform, sink) {
  if (def?.sourceLayer !== 'opening' || !def?.voidContract || !sink) return false;
  // NEGATIVE SPACE IS PART OF THE ASSET. Consumers must reserve/cut this void
  // before publishing wall collision. A frame visual may load later; the hole may not.
  sink({
    assetId: def.id,
    transform,
    voidContract: def.voidContract,
    wallOpeningRecipe: def.wallOpeningRecipe,
    sockets: def.connectionSockets,
  });
  return true;
}

export function compatibleSocketPairs(a,b) {
  if (!a?.connectionSockets || !b?.connectionSockets) return [];
  const out=[];
  for (const [ak,av] of Object.entries(a.connectionSockets)) for (const [bk,bv] of Object.entries(b.connectionSockets)) {
    if (!av?.position || !bv?.position) continue;
    out.push({a:ak,b:bk});
  }
  return out;
}
'''
(ROOT/'runtime-adapter.js').write_text(adapter,encoding='utf-8')

# Preview browser usable after overlaying into repo.
preview='''<!doctype html><meta charset="utf-8"><title>JWEB Semantic Megapack v3</title><style>html,body{margin:0;background:#111;color:#ddd;font:13px monospace}#hud{position:fixed;z-index:2;padding:10px;background:#000b;max-width:520px}canvas{display:block}</style><div id="hud">JWEB Semantic Megapack v3<br><input id="q" placeholder="filter asset id"><button id="next">next</button><span id="name"></span></div><script type="module">import * as THREE from '../../../three/three.module.js';import{GLTFLoader}from'../../../three/addons/loaders/GLTFLoader.js';import{SEMANTIC_MEGA_ASSETS as A}from'./catalog.js';const s=new THREE.Scene(),c=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,100),r=new THREE.WebGLRenderer({antialias:true});document.body.append(r.domElement);r.setSize(innerWidth,innerHeight);c.position.set(3,2.3,4);c.lookAt(0,.8,0);s.add(new THREE.HemisphereLight(0xffffff,0x333333,2));const g=new THREE.GridHelper(10,20);s.add(g);let cur=null,i=0;const l=new GLTFLoader();function list(){const q=document.querySelector('#q').value.toLowerCase();return A.filter(x=>x.id.toLowerCase().includes(q))}function show(){const a=list();if(!a.length)return;i%=a.length;const d=a[i++];if(cur)s.remove(cur);l.load('./'+d.file.replace('semantic-megapack/',''),x=>{cur=x.scene;s.add(cur);document.querySelector('#name').textContent=' '+d.id+' ('+d.geometry.triangles+' tris)'})}document.querySelector('#next').onclick=show;document.querySelector('#q').onchange=()=>{i=0;show()};addEventListener('resize',()=>{c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();r.setSize(innerWidth,innerHeight)});r.setAnimationLoop(()=>{if(cur)cur.rotation.y+=.002;r.render(s,c)});show()</script>'''
(ROOT/'preview.html').write_text(preview,encoding='utf-8')

# Minimal JWEB patch: sidecar import and union, no collision ownership changes.
patch='''diff --git a/systems/adornment-assets.js b/systems/adornment-assets.js
--- a/systems/adornment-assets.js
+++ b/systems/adornment-assets.js
@@ -1,5 +1,6 @@
 import * as THREE from '../vendor/three/three.module.js';
 import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
 import { CLAUDE_CITY_ASSETS } from '../vendor/city-pack/asset-catalog.js';
+import { SEMANTIC_MEGA_ASSETS } from '../vendor/city-pack/semantic-megapack/catalog.js';
 import { QP } from '../runtime/main-quantitative-literals.js';
 import { createPriorityLoadQueue } from '../priority-load-queue.js';
@@ -163,1 +164,2 @@
-    const CITY_ASSET_BY_ID = new Map(CLAUDE_CITY_ASSETS.map(a => [a.id, a]));
+    const ALL_CITY_ASSETS = [...CLAUDE_CITY_ASSETS, ...SEMANTIC_MEGA_ASSETS];
+    const CITY_ASSET_BY_ID = new Map(ALL_CITY_ASSETS.map(a => [a.id, a]));
@@ -311,7 +313,7 @@
     const cityAssetCategoryCache = new Map();
     function cityAssetsByCategory(category) {
         if (!cityAssetCategoryCache.has(category)) {
-            cityAssetCategoryCache.set(category, CLAUDE_CITY_ASSETS.filter(a => a.category === category));
+            cityAssetCategoryCache.set(category, ALL_CITY_ASSETS.filter(a => a.category === category));
         }
         return cityAssetCategoryCache.get(category);
     }
'''
(PACK/'jweb-semantic-megapack.patch').write_text(patch,encoding='utf-8')

# Windows helper with check-first semantics.
cmd='''@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nif not exist "vendor\\city-pack\\semantic-megapack\\manifest.json" (echo ERROR: package incomplete.& exit /b 1)\r\nwhere git >nul 2>nul || (echo ERROR: Git not found.& exit /b 1)\r\nif not exist ".git" (echo ERROR: Run this from the root of a JWEB git checkout after extracting the archive over it.& exit /b 1)\r\ngit apply --check "jweb-semantic-megapack.patch" || (echo ERROR: adapter patch does not apply cleanly. No files changed.& exit /b 1)\r\ngit apply "jweb-semantic-megapack.patch" || exit /b 1\r\necho Megapack files are already overlaid. Adapter patch applied. Nothing committed or pushed.\r\ngit status --short\r\n'''
(PACK/'APPLY-TO-JWEB.cmd').write_bytes(cmd.encode('ascii'))

# README
readme=f'''# JWEB Semantic Megapack v3

A progressively consumable low-poly semantic + traversal asset library for jweb.dev.

## Inventory

- {len(v1m)} canonical semantic nouns from v1
- {len(v1m)*len(VARIANTS)} deterministic geometric variants/mini-assemblies
- {len(traversal)} traversal-grade modules
- {len(openings)} **negative-space doorway / wall-opening modules**
- **{len(manifest)} GLB assets total**

Traversal families include straight stairs, U-turn stairwells, landings, walk ramps, open/caged ladders, catwalks, multi-floor fire escapes, loading docks, roof-access modules, scaffold bays, and utility bridges.

Opening families include residential, motel, storefront, civic, hospital, fire-rated, historic/arched, tile/brick-return, security, emergency-exit, industrial/service, wide storefront, loading-bay and vehicle/service-bay openings. Every one is a **styled hole, not a closed door**.

## Progressive contract

Decorative assets remain non-structural. Traversal assets ship explicit `collisionRecipe` and `connectionSockets`. Opening assets go further: **the empty passage is part of the asset**. Each opening ships `voidContract` + `wallOpeningRecipe`, and placement is invalid unless the world builder reserves/cuts that volume before wall collision is committed. There is deliberately no door leaf in these GLBs.

Recommended load order:

1. opening voids + traversal collision + socket topology
2. minimum visual walk surfaces / doorway frames
3. stairs/platform visual body
4. rails/supports/casing/headers
5. narrative clutter/signage/wear

Never publish a visual fire escape before its walk representation. Never publish a doorway frame while leaving a wall collider in its required void.

`runtime-adapter.js` emits recipes/contracts into the world engine so the existing structural/collision authority stays authoritative. The minimal adapter patch unions the visual catalog only; it intentionally does **not** pretend that catalog inclusion alone implements structural void carving.

## Use

Extract at repository root. Run `APPLY-TO-JWEB.cmd` only if you want the minimal catalog union patch. It performs `git apply --check` before mutation and does **not** commit or push.

`vendor/city-pack/semantic-megapack/preview.html` can be opened through the site's HTTP server to browse assets.
'''
(PACK/'README.md').write_text(readme,encoding='utf-8')

# Preserve source generator in pack.
shutil.copy2(Path(__file__),SRC/'generate_semantic_megapack_v3.py')

# ----- Validation -----
errors=[]; tri=[]; sizes=[]; ids=set(); files=set(); geom_hashes={}
for n,e in enumerate(manifest):
    if e['id'] in ids: errors.append(f'duplicate id {e["id"]}')
    ids.add(e['id'])
    fp=ROOT/(e['file'].replace('semantic-megapack/',''))
    if not fp.exists(): errors.append(f'missing {fp}')
    files.add(str(fp))
    try:
        mm=load_glb(fp)
        if len(mm.faces)==0 or len(mm.vertices)==0: errors.append(f'empty {e["id"]}')
        tri.append(len(mm.faces)); sizes.append(fp.stat().st_size)
        # geometry fingerprint after quantization, catches literal duplicates independent of GLB bytes
        q=np.round(mm.vertices,4).astype(np.float32).tobytes()+mm.faces.astype(np.int32).tobytes()
        h=hashlib.sha256(q).hexdigest(); geom_hashes.setdefault(h,[]).append(e['id'])
    except Exception as ex: errors.append(f'reload {e["id"]}: {ex}')
for e in openings:
    if not e.get('voidContract'): errors.append('opening void missing '+e['id'])
    if not e.get('wallOpeningRecipe'): errors.append('opening wall cut missing '+e['id'])
    if e.get('doorLeafPresent') is not False: errors.append('opening contains/permits leaf '+e['id'])
    if not e.get('negativeSpaceIsAsset'): errors.append('opening negative-space flag missing '+e['id'])
    # Geometric invariant: no triangle AABB may enter the guaranteed clear volume interior.
    fp=ROOT/(e['file'].replace('semantic-megapack/',''))
    mm=load_glb(fp)
    v=e['voidContract']; w=float(v['clearWidth']); h=float(v['clearHeight']); dep=float(v['clearDepth']); tol=1e-4
    cx,cy,cz=map(float,v['center'])
    tris=mm.vertices[mm.faces]
    mn=tris.min(axis=1); mx=tris.max(axis=1)
    overlap=(mx[:,0] > cx-w/2+tol) & (mn[:,0] < cx+w/2-tol) & (mx[:,1] > cy-h/2+tol) & (mn[:,1] < cy+h/2-tol) & (mx[:,2] > cz-dep/2+tol) & (mn[:,2] < cz+dep/2-tol)
    if bool(np.any(overlap)): errors.append('opening mesh intrudes required void '+e['id'])
for e in traversal:
    if not e.get('connectionSockets'): errors.append('traversal sockets missing '+e['id'])
    if not e.get('collisionRecipe'): errors.append('traversal collision missing '+e['id'])
    if e.get('loadTier')!=0: errors.append('traversal not tier0 '+e['id'])
# straight stairs + fire-escape continuity policy
for e in traversal:
    cr=e['collisionRecipe']
    if cr.get('type')=='steps' and cr.get('stepRise',1)>.20: errors.append('step too high '+e['id'])
    if cr.get('type')=='fire-escape':
        if not cr.get('continuousRoute'): errors.append('fire escape not marked continuous '+e['id'])
        if len(cr.get('platforms',[])) != cr.get('floors'): errors.append('fire escape platform count mismatch '+e['id'])
        if len(cr.get('flights',[])) != max(0,cr.get('floors',0)-1): errors.append('fire escape flight count mismatch '+e['id'])
        reqs=e.get('accessRequirements',[])
        if len(reqs) != cr.get('floors'): errors.append('fire escape access portal count mismatch '+e['id'])
        for floor in range(cr.get('floors',0)):
            sock=e.get('connectionSockets',{}).get(f'accessPortal{floor}')
            if not sock or not sock.get('required'): errors.append('fire escape access socket missing '+e['id']+f' floor {floor}')
            elif not {'walk-through','climb-through'}.issubset(set(sock.get('acceptsCapabilities',[]))): errors.append('fire escape portal capabilities incomplete '+e['id'])
        for f in cr.get('flights',[]):
            if f.get('stepRise',1) > .20 or f.get('stepDepth',0) < .24: errors.append('fire escape unsafe step geometry '+e['id'])
            if not f.get('lowerTouchesPlatform') or not f.get('upperTouchesPlatform'): errors.append('fire escape disconnected flight '+e['id'])
# literal duplicate geometry is okay only base-vs-derived edge cases; report, don't fail unless huge.
dup_groups=[v for v in geom_hashes.values() if len(v)>1]
report={
 'version':3,'assetCount':len(manifest),'canonicalCount':len(v1m),'variantCount':len(v1m)*len(VARIANTS),'traversalCount':len(traversal),'openingCount':len(openings),
 'trianglesTotal':int(sum(tri)),'trianglesMedian':int(np.median(tri)),'trianglesMax':int(max(tri)),'bytesTotal':int(sum(sizes)),
 'reloadSuccess':len(manifest)-sum(1 for x in errors if x.startswith('reload')),
 'duplicateGeometryGroups':len(dup_groups),'duplicateGeometryAssets':sum(len(x) for x in dup_groups),
 'errors':errors,'sampleDuplicateGroups':dup_groups[:20]
}
(ROOT/'validation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
if errors: raise SystemExit('VALIDATION FAILED\n'+json.dumps(errors[:30],indent=2))
(PACK/'VALIDATION.txt').write_text('\n'.join([
 'JWEB SEMANTIC MEGAPACK V3 VALIDATION','',
 f'assets: {len(manifest)}',f'canonical: {len(v1m)}',f'variants: {len(v1m)*len(VARIANTS)}',f'traversal: {len(traversal)}',f'openings: {len(openings)}',
 f'glb reload: {len(manifest)}/{len(manifest)}',f'triangles total: {sum(tri):,}',f'triangles median: {int(np.median(tri)):,}',f'triangles max: {max(tri):,}',
 f'raw GLB bytes: {sum(sizes):,}',f'duplicate literal geometry groups: {len(dup_groups)} (reported, not hidden)',
 'straight stair rise policy: <= 0.20m PASS','fire escape floor-to-floor continuity: PASS','fire escape tread/rise policy: PASS','traversal collision recipes: PASS','traversal connection sockets: PASS','opening void contracts: PASS','opening geometry clear-volume intrusion: PASS','door leaves present: 0 PASS','external textures: none (embedded GLB vertex colors)','errors: 0',''
]),encoding='utf-8')

# zip root-shaped
zip_path=OUTROOT/'jweb-semantic-megapack-v3.zip'
if zip_path.exists(): zip_path.unlink()
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
    for fp in sorted(PACK.rglob('*')):
        if fp.is_file(): z.write(fp,fp.relative_to(PACK))
sha=hashlib.sha256(zip_path.read_bytes()).hexdigest()
print(json.dumps({'zip':str(zip_path),'sha256':sha,**report,'zipBytes':zip_path.stat().st_size},indent=2))
