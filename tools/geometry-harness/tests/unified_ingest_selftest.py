#!/usr/bin/env python3
from pathlib import Path
import json, sys, tempfile
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
import jweb_silhouette_tester as t

# All shipped authored fixtures must pass the same physical checker.
for name in ('fork','fence','house','apartment-stair','horse-statue','wall-business-sign'):
    sp=ROOT/'specs'/f'{name}.json'; spec=t._read_spec_json(sp); batches=t.expand_structure(spec,sp.parent)
    result=t.run_geometry_checks(spec,batches)
    assert result['pass'], (name,[x for x in result['checks'] if not x.get('pass')])

# The neutral city-ingest primitive is a true transformed box and must render
# identically whether the fast convex path is enabled or normal triangles are used.
corners=np.array([
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
],dtype=float)
# arbitrary affine transform preserving a parallelepiped
M=np.array([[1.1,0.0,0.35],[0.15,1.4,0.0],[-0.25,0.1,0.85]],dtype=float)
world=corners@M.T+np.array([3.0,2.0,-4.0])
fast=t.TriBatch(world,t.BOX_FACES.copy(),t.ROLE_VISUAL,'fast',True)
slow=t.TriBatch(world,t.BOX_FACES.copy(),t.ROLE_VISUAL,'slow',False)
for view in t.VIEW_ORDER+t.CARDINAL_VIEW_ORDER:
    frame=t._frame_for_view(t._all_triangles([fast],t.ROLE_BOTH),view,128,128,0.06)
    a=t.render_mask([fast],t.ROLE_VISUAL,view,width=128,height=128,frame=frame)
    b=t.render_mask([slow],t.ROLE_VISUAL,view,width=128,height=128,frame=frame)
    # Polygon edge tie-breaking can differ by one pixel at shared triangle edges;
    # area and disagreement must remain negligible.
    delta=np.count_nonzero((a>16)!=(b>16)); union=np.count_nonzero((a>16)|(b>16))
    assert delta <= max(8,int(union*0.003)), (view,delta,union)

# Snapshot schema uses the same expand/render path, including isolated roles.
with tempfile.TemporaryDirectory() as td:
    td=Path(td); sp=td/'snapshot.json'; out=td/'out'
    sp.write_text(json.dumps({
      'schema':'jweb.geometry-scene.v1','name':'synthetic neutral scene','source_kind':'jweb-generated-chunk',
      'elements':[
        {'type':'parallelepiped','id':'visual:test','roles':['visual'],'corners':world.tolist()},
        {'type':'box','id':'collider:test','roles':['collider'],'center':[3,0.5,-4],'size':[2,1,2]},
        {'type':'cylinder','id':'collider:round-prop','roles':['collider'],'center':[0,1,0],'radius':0.5,'height':2.0,'sides':16},
      ],'checks':[]}),encoding='utf-8')
    report=t.render_structure(sp,out,width=128,height=128,view_order=t.CARDINAL_VIEW_ORDER)
    assert report['source_kind']=='jweb-generated-chunk'
    assert report['geometry_checks']['pass']
    assert report['geometry_checks']['coverage']=='mesh-integrity', report['geometry_checks']['coverage']
    assert set(report['views'])==set(t.CARDINAL_VIEW_ORDER)
    assert (out/'contact-sheet.png').exists()

# Generated city authority health participates in overall pass/fail independently
# from triangle integrity, so a finite mesh cannot hide a semantic traversal failure.
healthy=box_batch = []
t.add_box(healthy,center=[0,0,0],size=[1,1,1],roles=t.ROLE_BOTH,tag='healthy')
rr=t.run_geometry_checks({'source_kind':'jweb-generated-chunk','source_metadata':{
    'capture_health':{'pass':True},'authority_health':{'pass':False,'errors':[{'type':'synthetic'}]}},'checks':[]},healthy)
assert not rr['pass'], rr
assert rr['coverage']=='mesh-integrity+capture-health+semantic-authority', rr['coverage']

print('PASS: unified authored + neutral city ingest, convex renderer equivalence, cardinal compatibility')
