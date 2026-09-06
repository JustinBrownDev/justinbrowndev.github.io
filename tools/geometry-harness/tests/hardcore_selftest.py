#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import math
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
import jweb_silhouette_tester as t


def must(cond,msg):
    if not cond:
        raise AssertionError(msg)


def box_batch(center,size,tag='box',roles=t.ROLE_BOTH):
    out=[]; t.add_box(out,center=center,size=size,roles=roles,tag=tag); return out[0]

# ---------------------------------------------------------------------------
# 1. Shipped baseline models: strict physical checks + watertight components.
# ---------------------------------------------------------------------------
for name in ('fork','fence','house'):
    sp=ROOT/'specs'/f'{name}.json'; spec=json.loads(sp.read_text()); batches=t.expand_structure(spec,sp.parent)
    r=t.run_geometry_checks(spec,batches)
    must(r['pass'],(name,[x for x in r['checks'] if not x['pass']]))
    wr=t.run_geometry_checks({'checks':[{'type':'watertight','selector':'model:*','id':'solid'}]},batches)
    must(wr['pass'],(name,'watertight', [x for x in wr['checks'] if not x['pass']]))

# ---------------------------------------------------------------------------
# 2. Precise contact authority: AABBs can touch while triangles are far apart.
# ---------------------------------------------------------------------------
a=t.TriBatch(np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]]),np.array([[0,1,2]],dtype=np.int32),t.ROLE_BOTH,'a')
b=t.TriBatch(np.array([[1.,1.,0.],[2.,1.,0.],[1.,2.,0.]]),np.array([[0,1,2]],dtype=np.int32),t.ROLE_BOTH,'b')
r=t.run_geometry_checks({'checks':[{'type':'contact','a':'a','b':'b','max_gap':0.05,'id':'no-aabb-cheat'}]},[a,b])
chk=next(x for x in r['checks'] if x['id']=='no-aabb-cheat')
must(not chk['pass'],chk)
must(chk['aabb_gap']==0.0,chk)
must(chk['surface_distance']>0.5,chk)

# True edge contact must pass.
c=t.TriBatch(np.array([[1.,0.,0.],[2.,0.,0.],[1.,1.,0.]]),np.array([[0,1,2]],dtype=np.int32),t.ROLE_BOTH,'c')
r=t.run_geometry_checks({'checks':[{'type':'contact','a':'a','b':'c','max_gap':1e-8,'id':'true-touch'}]},[a,c])
chk=next(x for x in r['checks'] if x['id']=='true-touch')
must(chk['pass'] and chk['surface_distance']<=1e-8,chk)

# ---------------------------------------------------------------------------
# 3. Analytic box-distance property sweep validates triangle distance broadly.
# ---------------------------------------------------------------------------
positions=[(2.0,0,0),(0,3.0,0),(0,0,-4.0),(2.0,3.0,0),(2.0,3.0,4.0),(-2.5,-3.25,4.75)]
base=box_batch((0,0,0),(2,2,2),'base')
for n,pos in enumerate(positions):
    other=box_batch(pos,(2,2,2),f'o{n}')
    d=t._mesh_surface_distance([base],[other])
    sep=np.maximum(0.0,np.abs(np.asarray(pos,dtype=float))-2.0)
    expected=float(np.linalg.norm(sep))
    must(abs(d-expected)<1e-9,(pos,d,expected))
# intersecting boxes -> zero surface intersection
other=box_batch((0.5,0.5,0.5),(2,2,2),'overlap')
must(t._mesh_surface_distance([base],[other])<1e-10,'intersecting boxes must have zero surface distance')

# ---------------------------------------------------------------------------
# 4. Mesh integrity rejects NaN, invalid index, degeneracy, duplicate triangles.
# ---------------------------------------------------------------------------
goodv=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]])
cases=[
    t.TriBatch(np.array([[math.nan,0,0],[1,0,0],[0,1,0]],float),np.array([[0,1,2]],np.int32),3,'nan'),
    t.TriBatch(goodv.copy(),np.array([[0,1,3]],np.int32),3,'bad-index'),
    t.TriBatch(np.array([[0.,0.,0.],[1.,0.,0.],[2.,0.,0.]]),np.array([[0,1,2]],np.int32),3,'degenerate'),
    t.TriBatch(goodv.copy(),np.array([[0,1,2],[2,1,0]],np.int32),3,'duplicate'),
]
for bad in cases:
    rr=t.run_geometry_checks({},[bad])
    must(not rr['pass'],(bad.tag,rr))

# Open triangle is valid render geometry but fails explicit solid/watertight authority.
rr=t.run_geometry_checks({'checks':[{'type':'watertight','selector':'open','id':'must-be-solid'}]},[a.__class__(a.vertices,a.faces,a.roles,'open')])
must(not rr['pass'],rr)

# A closed cube with one face flipped still has incidence 2 everywhere, but is not
# a consistently oriented solid and must fail watertight authority.
flipped=box_batch((0,0,0),(2,2,2),'flipped')
flipped.faces[0]=flipped.faces[0][::-1]
rr=t.run_geometry_checks({'checks':[{'type':'watertight','selector':'flipped','consistent_winding':True,'id':'winding'}]},[flipped])
wchk=next(x for x in rr['checks'] if x['id']=='winding')
must(not wchk['pass'],wchk)
must(wchk['components'][0]['orientation_conflicts']>0,wchk)

# ---------------------------------------------------------------------------
# 5. OBJ parser: preserve groups/negative indices; reject 0 and out-of-range.
# ---------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    td=Path(td)
    ok=td/'ok.obj'
    ok.write_text('''v 0 0 0\nv 1 0 0\nv 0 1 0\ng first\nf -3 -2 -1\ng second\nf 1 3 2\n''')
    bs=t.load_obj_batches(ok,t.ROLE_BOTH,'obj')
    must([x.tag for x in bs]==['obj:first','obj:second'],[x.tag for x in bs])
    zero=td/'zero.obj'; zero.write_text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 1 2\n')
    try: t.load_obj_batches(zero,t.ROLE_BOTH,'bad')
    except ValueError: pass
    else: raise AssertionError('OBJ index zero must fail')
    oor=td/'oor.obj'; oor.write_text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n')
    try: t.load_obj_batches(oor,t.ROLE_BOTH,'bad')
    except ValueError: pass
    else: raise AssertionError('OBJ out-of-range index must fail')

# ---------------------------------------------------------------------------
# 6. Transform semantics: yaw-only must apply; box extra transform must fail loudly.
# ---------------------------------------------------------------------------
spec={'elements':[{'type':'mesh','id':'m','roles':'both','yaw_deg':90,
                   'vertices':[[1,0,0],[2,0,0],[1,1,0]],'faces':[[0,1,2]]}]}
bs=t.expand_structure(spec,Path('.'))
must(abs(bs[0].vertices[0,0])<1e-10 and abs(bs[0].vertices[0,2]-1.0)<1e-10,bs[0].vertices[0])
try:
    t.expand_structure({'elements':[{'type':'box','size':[1,1,1],'center':[0,0,0],'position':[1,0,0]}]},Path('.'))
except ValueError: pass
else: raise AssertionError('box position/translate/scale ambiguity must fail loudly')

# ---------------------------------------------------------------------------
# 7. Clearance uses actual triangle/AABB intersection, not AABB overlap alone.
# ---------------------------------------------------------------------------
zone=[]; t.add_box(zone,center=[0,0,0],size=[1,1,0.2],roles=0,tag='zone')
# AABB reaches into the zone near origin, triangle itself is x+y>=2 and does not.
fartri=t.TriBatch(np.array([[0.,2.,0.],[2.,0.,0.],[2.,2.,0.]]),np.array([[0,1,2]],np.int32),3,'fartri')
rr=t.run_geometry_checks({'checks':[{'type':'clearance','clearance':'zone','obstacles':'fartri','id':'precise-clear'}]},zone+[fartri])
chk=next(x for x in rr['checks'] if x['id']=='precise-clear'); must(chk['pass'],chk)
# Real crossing triangle must fail.
cross=t.TriBatch(np.array([[-1.,0.,0.],[1.,0.,0.],[0.,1.,0.]]),np.array([[0,1,2]],np.int32),3,'cross')
rr=t.run_geometry_checks({'checks':[{'type':'clearance','clearance':'zone','obstacles':'cross','id':'blocked'}]},zone+[cross])
chk=next(x for x in rr['checks'] if x['id']=='blocked'); must(not chk['pass'],chk)

# Non-zero penetration tolerance used to be estimated from AABB overlap, which is
# not an exact mesh penetration depth. Fail closed instead of granting a false pass.
rr=t.run_geometry_checks({'checks':[{'type':'clearance','clearance':'zone','obstacles':'cross','max_penetration':0.01,'id':'no-fake-depth'}]},zone+[cross])
chk=next(x for x in rr['checks'] if x['id']=='no-fake-depth')
must(not chk['pass'] and 'not exact' in chk.get('error',''),chk)

# ---------------------------------------------------------------------------
# 8. Diagnostic-only geometry must not influence frame; roles remain isolated.
# ---------------------------------------------------------------------------
probe=[]
t.add_box(probe,center=[0,0,0],size=[2,2,2],roles=t.ROLE_VISUAL,tag='visual')
t.add_box(probe,center=[5,0,0],size=[2,2,2],roles=t.ROLE_COLLIDER,tag='collider')
t.add_box(probe,center=[1000,1000,1000],size=[100,100,100],roles=0,tag='diagnostic')
fr=t._frame_for_view(t._all_triangles(probe,t.ROLE_BOTH),'front',128,128,0.06)
must(np.allclose(fr[2],[-1,-1]) and np.allclose(fr[3],[6,1]),(fr[2],fr[3]))
vm=t.render_mask(probe,t.ROLE_VISUAL,'front',width=128,height=128,frame=fr)
cm=t.render_mask(probe,t.ROLE_COLLIDER,'front',width=128,height=128,frame=fr)
met=t._mask_metrics(vm,cm); must(met['shared_pixels']==0,met)

# ---------------------------------------------------------------------------
# 9. Semantic stair: visual steps and collider ramp come from one definition.
# ---------------------------------------------------------------------------
st={'elements':[{'type':'stair','id':'flight','start':[0,0,0],'end':[0,3,4],'width':1.2,'steps':15,
                 'rails':{'enabled':False}}]}
bs=t.expand_structure(st,Path('.'))
steps=[b for b in bs if ':step:' in b.tag]; ramps=[b for b in bs if b.tag.endswith(':collider-ramp')]
must(len(steps)==15 and len(ramps)==1,(len(steps),len(ramps)))
must(all(b.roles==t.ROLE_VISUAL for b in steps),'steps must be visual role')
must(ramps[0].roles==t.ROLE_COLLIDER,'ramp must be collider role')
smn,smx=t._bbox_of(steps); rmn,rmx=t._bbox_of(ramps)
must(abs((smx[0]-smn[0])-1.2)<1e-9,(smn,smx))
must(abs((rmx[0]-rmn[0])-1.2)<1e-9,(rmn,rmx))
must(abs((smx[2]-smn[2])-4.0)<0.01,(smn,smx))
must(abs((rmx[2]-rmn[2])-4.0)<1e-9,(rmn,rmx))

# ---------------------------------------------------------------------------
# 10. Count rule and selector behavior.
# ---------------------------------------------------------------------------
rr=t.run_geometry_checks({'checks':[{'type':'count','selector':['visual','collider'],'exact':2,'id':'two'}]},probe)
# list selector matches tags, diagnostic doesn't match
must(next(x for x in rr['checks'] if x['id']=='two')['pass'],rr)

# ---------------------------------------------------------------------------
# 11. Deterministic render bytes + output contract.
# ---------------------------------------------------------------------------
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
with tempfile.TemporaryDirectory() as td:
    td=Path(td); aout=td/'a'; bout=td/'b'; sp=ROOT/'specs'/'fork.json'
    ra=t.render_structure(sp,aout,width=128,height=128)
    rb=t.render_structure(sp,bout,width=128,height=128)
    names=[f'{v}.{kind}.png' for v in t.VIEW_ORDER for kind in ('visual','collider','diff')]+['contact-sheet.png','geometry-checks.json']
    for name in names:
        must((aout/name).exists() and (bout/name).exists(),name)
        must(sha(aout/name)==sha(bout/name),f'nondeterministic output: {name}')
    for v in t.VIEW_ORDER:
        im=Image.open(aout/f'{v}.visual.png').convert('RGBA')
        must(im.size==(128,128),im.size)
        colors={tuple(px) for row in __import__("numpy").asarray(im) for px in row}; must(colors <= {(0,0,0,255),(255,255,255,255)},colors)
    sheet=Image.open(aout/'contact-sheet.png'); must(sheet.size==(512,598),sheet.size)
    # timing is intentionally excluded from byte comparison, but structural facts agree.
    for k in ('triangle_count','batch_count','bounds','diagnostic_only_batch_count'):
        must(ra[k]==rb[k],(k,ra[k],rb[k]))

# ---------------------------------------------------------------------------
# 12. Strict CLI must propagate geometry failure as exit code 2.
# ---------------------------------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    td=Path(td); sp=td/'bad.json'; out=td/'out'
    sp.write_text(json.dumps({'name':'bad','elements':[
        {'type':'box','id':'a','center':[0,0,0],'size':[1,1,1],'roles':'both'},
        {'type':'box','id':'b','center':[5,0,0],'size':[1,1,1],'roles':'both'}],
        'checks':[{'type':'contact','a':'a','b':'b','max_gap':0.01,'id':'must-fail'}]}))
    cmd=[sys.executable,str(ROOT/'source'/'jweb_silhouette_tester.py'),str(sp),'-o',str(out),'--size','64','--strict-geometry']
    cp=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    must(cp.returncode==2,(cp.returncode,cp.stdout,cp.stderr))

# ---------------------------------------------------------------------------
# 13. Empty render authority and unknown roles fail instead of producing junk.
# ---------------------------------------------------------------------------
try: t._frame_for_view(np.empty((0,3,3)), 'front', 64,64,0.06)
except ValueError: pass
else: raise AssertionError('empty frame must fail')
try: t.expand_structure({'elements':[{'type':'box','center':[0,0,0],'size':[1,1,1],'roles':['banana']}]},Path('.'))
except ValueError: pass
else: raise AssertionError('unknown role must fail')

print('PASS: hardcore geometry harness reliability suite')
