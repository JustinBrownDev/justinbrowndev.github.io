#!/usr/bin/env python3
from pathlib import Path
import copy, json, sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
import jweb_silhouette_tester as t


def load(name):
    sp=ROOT/'specs'/f'{name}.json'
    spec=json.loads(sp.read_text())
    batches=t.expand_structure(spec,sp.parent)
    return spec,batches


def assert_pass(name):
    spec,batches=load(name)
    result=t.run_geometry_checks(spec,batches)
    assert result['pass'], (name,[x for x in result['checks'] if not x['pass']])
    return spec,batches,result


def broken_copy(batches):
    return [t.TriBatch(b.vertices.copy(),b.faces.copy(),b.roles,b.tag) for b in batches]


def find(batches,leaf):
    for b in batches:
        if b.tag.split(':')[-1] == leaf:
            return b
    raise AssertionError(f'missing {leaf}')

# Baselines must all pass.
for name in ('fork','fence','house'):
    assert_pass(name)

# OBJ group preservation is the foundation of the v2 physical debugger.
_, fence_batches, _ = assert_pass('fence')
assert len(fence_batches) == 21, len(fence_batches)
assert any(b.tag.endswith(':top-rail') for b in fence_batches)
assert any(b.tag.endswith(':mesh-v-00') for b in fence_batches)

# A) Deliberately separate the right roof half. The ridge contact regression must fail.
house_spec,house_batches,_=assert_pass('house')
bad=broken_copy(house_batches)
find(bad,'roof-right').vertices[:,0] += 0.20
r=t.run_geometry_checks(house_spec,bad)
assert not r['pass']
assert any((not x['pass']) and x['id']=='gable-roof-halves-overlap-at-ridge' for x in r['checks'])

# E) Deliberately shorten one porch column. Header bearing must fail.
bad=broken_copy(house_batches)
col=find(bad,'porch-column-2')
# pull its top down 120mm while leaving the foot on the deck
mn=col.vertices[:,1].min(); col.vertices[:,1]=mn+(col.vertices[:,1]-mn)*0.94
r=t.run_geometry_checks(house_spec,bad)
assert any((not x['pass']) and x['id']=='porch-header-bearing-column-2' for x in r['checks'])

# B) Deliberately thin the fork body. Dimension constraint must fail.
fork_spec,fork_batches,_=assert_pass('fork')
bad=broken_copy(fork_batches)
body=find(bad,'fork-body'); mid=(body.vertices[:,1].min()+body.vertices[:,1].max())/2
body.vertices[:,1]=mid+(body.vertices[:,1]-mid)*0.60
r=t.run_geometry_checks(fork_spec,bad)
assert any((not x['pass']) and x['id']=='fork-handle-not-knife-thin' for x in r['checks'])

# D) Deliberately pull the left edge of the roll mesh away from its post.
fence_spec,fence_batches,_=assert_pass('fence')
bad=broken_copy(fence_batches)
find(bad,'mesh-v-00').vertices[:,0] += 0.05
r=t.run_geometry_checks(fence_spec,bad)
assert any((not x['pass']) and x['id']=='wire-roll-tied-left' for x in r['checks'])

print('PASS: v2 geometry + harness regressions')


# v3: diagnostic-only geometry must not affect render framing.
probe=[]
t.add_box(probe, center=[0,0,0], size=[2,2,2], roles=t.ROLE_BOTH, tag='visible-box')
t.add_box(probe, center=[1000,1000,1000], size=[100,100,100], roles=0, tag='diagnostic-far-away')
frame=t._frame_for_view(t._all_triangles(probe,t.ROLE_BOTH),'front',256,256,0.06)
assert frame[2].tolist() == [-1.0,-1.0], frame[2]
assert frame[3].tolist() == [1.0,1.0], frame[3]

# v3: clearance volumes are geometry diagnostics and fail when an obstacle intrudes.
probe=[]
t.add_box(probe, center=[0,1,0], size=[1,2,1], roles=0, tag='headroom-zone')
t.add_box(probe, center=[2,1,0], size=[0.5,2,1], roles=t.ROLE_BOTH, tag='wall')
spec={'checks':[{'type':'clearance','clearance':'headroom-zone','obstacles':'wall','max_penetration':0.0,'id':'headroom-clear'}]}
r=t.run_geometry_checks(spec,probe)
assert r['pass'], r
probe[1].vertices[:,0]-=1.75
r=t.run_geometry_checks(spec,probe)
assert not r['pass']
assert any((not x['pass']) and x['id']=='headroom-clear' for x in r['checks'])

print('PASS: v3 diagnostic framing + clearance regressions')
