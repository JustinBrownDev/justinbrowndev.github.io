#!/usr/bin/env python3
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'models'
SPECS = ROOT / 'specs'
MODELS.mkdir(exist_ok=True)
SPECS.mkdir(exist_ok=True)


class Obj:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.groups = []

    def _add(self, verts, faces, group):
        base = len(self.v)
        self.v.extend(tuple(map(float, p)) for p in verts)
        start = len(self.f)
        self.f.extend([[base + i for i in face] for face in faces])
        self.groups.append((str(group), start, len(self.f)))

    def box(self, center, size, group='box'):
        cx, cy, cz = center
        sx, sy, sz = size
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        verts = [
            (cx-hx,cy-hy,cz-hz),(cx+hx,cy-hy,cz-hz),(cx+hx,cy+hy,cz-hz),(cx-hx,cy+hy,cz-hz),
            (cx-hx,cy-hy,cz+hz),(cx+hx,cy-hy,cz+hz),(cx+hx,cy+hy,cz+hz),(cx-hx,cy+hy,cz+hz),
        ]
        faces = [
            [0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],
            [3,2,6],[3,6,7],[1,5,6],[1,6,2],[0,3,7],[0,7,4],
        ]
        self._add(verts, faces, group)

    def elliptical_loft_z(self, sections, sides=16, group='loft', cap=True):
        """Smooth forged-like solid along Z.

        Each section is (z, center_x, width_x, center_y, thickness_y).
        A shared ring topology removes the prismoid-seam notches from v1.
        """
        if len(sections) < 2:
            raise ValueError('loft needs at least two sections')
        sides = max(8, int(sides))
        verts = []
        for z, cx, width, cy, thick in sections:
            if width <= 0 or thick <= 0:
                raise ValueError('loft section width/thickness must be positive')
            for i in range(sides):
                a = 2 * math.pi * i / sides
                verts.append((cx + math.cos(a) * width/2,
                              cy + math.sin(a) * thick/2,
                              z))
        faces = []
        rings = len(sections)
        for r in range(rings - 1):
            a0 = r * sides
            b0 = (r + 1) * sides
            for i in range(sides):
                j = (i + 1) % sides
                faces.append([a0+i, b0+i, b0+j])
                faces.append([a0+i, b0+j, a0+j])
        if cap:
            # triangle fans around added center points
            z,cx,w,cy,t = sections[0]
            c0 = len(verts); verts.append((cx,cy,z))
            z,cx,w,cy,t = sections[-1]
            c1 = len(verts); verts.append((cx,cy,z))
            for i in range(sides):
                j = (i + 1) % sides
                faces.append([c0,j,i])
                o = (rings-1)*sides
                faces.append([c1,o+i,o+j])
        self._add(verts, faces, group)

    def cylinder_between(self, a, b, radius, sides=12, group='rod'):
        ax,ay,az = map(float,a); bx,by,bz = map(float,b)
        dx,dy,dz = bx-ax, by-ay, bz-az
        length = math.sqrt(dx*dx+dy*dy+dz*dz)
        if length <= 1e-9:
            raise ValueError('zero-length cylinder')
        ux,uy,uz = dx/length,dy/length,dz/length
        # Stable perpendicular basis.
        if abs(uy) < 0.9:
            rx,ry,rz = -uz,0.0,ux
        else:
            rx,ry,rz = 1.0,0.0,0.0
        rn = math.sqrt(rx*rx+ry*ry+rz*rz); rx,ry,rz = rx/rn,ry/rn,rz/rn
        sx = uy*rz-uz*ry; sy = uz*rx-ux*rz; sz = ux*ry-uy*rx
        sn = math.sqrt(sx*sx+sy*sy+sz*sz); sx,sy,sz = sx/sn,sy/sn,sz/sn
        verts=[]
        for p in ((ax,ay,az),(bx,by,bz)):
            for i in range(sides):
                ang=2*math.pi*i/sides; ca,sa=math.cos(ang),math.sin(ang)
                verts.append((p[0]+radius*(rx*ca+sx*sa),
                              p[1]+radius*(ry*ca+sy*sa),
                              p[2]+radius*(rz*ca+sz*sa)))
        faces=[]
        for i in range(sides):
            j=(i+1)%sides
            faces.append([i,j,sides+j]); faces.append([i,sides+j,sides+i])
        c0=len(verts); verts.append((ax,ay,az))
        c1=len(verts); verts.append((bx,by,bz))
        for i in range(sides):
            j=(i+1)%sides
            faces.append([c0,j,i]); faces.append([c1,sides+i,sides+j])
        self._add(verts, faces, group)

    def gable(self, z, depth, half_width, eave_y, ridge_y, group='gable'):
        z0,z1=z-depth/2,z+depth/2
        verts=[(-half_width,eave_y,z0),(half_width,eave_y,z0),(0,ridge_y,z0),
               (-half_width,eave_y,z1),(half_width,eave_y,z1),(0,ridge_y,z1)]
        faces=[[0,1,2],[3,5,4],[0,3,4],[0,4,1],[1,4,5],[1,5,2],[2,5,3],[2,3,0]]
        self._add(verts,faces,group)

    def roof_slab_x(self, x_eave, x_ridge, eave_y, ridge_y, z_half, thickness=0.18, group='roof'):
        # One continuous sloped solid. Vertical thickness is intentional here because
        # the support diagnostics operate in world-Y and this keeps bearing surfaces explicit.
        z0,z1=-z_half,z_half
        verts=[(x_eave,eave_y,z0),(x_ridge,ridge_y,z0),(x_eave,eave_y,z1),(x_ridge,ridge_y,z1),
               (x_eave,eave_y-thickness,z0),(x_ridge,ridge_y-thickness,z0),(x_eave,eave_y-thickness,z1),(x_ridge,ridge_y-thickness,z1)]
        faces=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]]
        self._add(verts,faces,group)

    def shed_roof_z(self, x_half, z_inner,z_outer, y_inner,y_outer, thickness=0.16, group='porch-roof'):
        verts=[(-x_half,y_inner,z_inner),(x_half,y_inner,z_inner),(-x_half,y_outer,z_outer),(x_half,y_outer,z_outer),
               (-x_half,y_inner-thickness,z_inner),(x_half,y_inner-thickness,z_inner),(-x_half,y_outer-thickness,z_outer),(x_half,y_outer-thickness,z_outer)]
        faces=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]]
        self._add(verts,faces,group)

    def ellipsoid(self, center, radii, segments=24, rings=12, group='ellipsoid'):
        cx,cy,cz=map(float,center); rx,ry,rz=map(float,radii)
        if min(rx,ry,rz) <= 0:
            raise ValueError('ellipsoid radii must be positive')
        segments=max(8,int(segments)); rings=max(4,int(rings))
        verts=[(cx,cy+ry,cz)]
        for j in range(1,rings):
            phi=math.pi*j/rings
            sp,cp=math.sin(phi),math.cos(phi)
            for i in range(segments):
                th=2*math.pi*i/segments
                verts.append((cx+rx*sp*math.cos(th), cy+ry*cp, cz+rz*sp*math.sin(th)))
        bottom=len(verts); verts.append((cx,cy-ry,cz))
        faces=[]
        # top fan
        first=1
        for i in range(segments):
            j=(i+1)%segments
            faces.append([0,first+i,first+j])
        # middle strips
        for r in range(rings-2):
            a=1+r*segments; b=a+segments
            for i in range(segments):
                j=(i+1)%segments
                faces.append([a+i,b+i,b+j]); faces.append([a+i,b+j,a+j])
        # bottom fan
        last=1+(rings-2)*segments
        for i in range(segments):
            j=(i+1)%segments
            faces.append([bottom,last+j,last+i])
        self._add(verts,faces,group)

    def tapered_cylinder_between(self, a, b, radius_a, radius_b, sides=12, group='tapered-rod'):
        ax,ay,az=map(float,a); bx,by,bz=map(float,b)
        dx,dy,dz=bx-ax,by-ay,bz-az
        length=math.sqrt(dx*dx+dy*dy+dz*dz)
        if length <= 1e-9:
            raise ValueError('zero-length tapered cylinder')
        ux,uy,uz=dx/length,dy/length,dz/length
        if abs(uy) < 0.9:
            rx,ry,rz=-uz,0.0,ux
        else:
            rx,ry,rz=1.0,0.0,0.0
        rn=math.sqrt(rx*rx+ry*ry+rz*rz); rx,ry,rz=rx/rn,ry/rn,rz/rn
        sx=uy*rz-uz*ry; sy=uz*rx-ux*rz; sz=ux*ry-uy*rx
        sn=math.sqrt(sx*sx+sy*sy+sz*sz); sx,sy,sz=sx/sn,sy/sn,sz/sn
        verts=[]
        for p,radius in (((ax,ay,az),float(radius_a)),((bx,by,bz),float(radius_b))):
            for i in range(sides):
                ang=2*math.pi*i/sides; ca,sa=math.cos(ang),math.sin(ang)
                verts.append((p[0]+radius*(rx*ca+sx*sa),
                              p[1]+radius*(ry*ca+sy*sa),
                              p[2]+radius*(rz*ca+sz*sa)))
        faces=[]
        for i in range(sides):
            j=(i+1)%sides
            faces.append([i,j,sides+j]); faces.append([i,sides+j,sides+i])
        c0=len(verts); verts.append((ax,ay,az)); c1=len(verts); verts.append((bx,by,bz))
        for i in range(sides):
            j=(i+1)%sides
            faces.append([c0,j,i]); faces.append([c1,sides+i,sides+j])
        self._add(verts,faces,group)

    def write(self,path):
        path=Path(path)
        with path.open('w',encoding='utf-8',newline='\n') as fh:
            fh.write(f'# {self.name}\n')
            for x,y,z in self.v:
                fh.write(f'v {x:.6f} {y:.6f} {z:.6f}\n')
            starts={s:(g,e) for g,s,e in self.groups}
            for i,face in enumerate(self.f):
                if i in starts:
                    group,_ = starts[i]
                    fh.write(f'g {group}\n')
                fh.write('f '+' '.join(str(k+1) for k in face)+'\n')
        return {'vertices':len(self.v),'triangles':len(self.f),'groups':len(self.groups)}


def make_spec(name,obj_name,checks):
    return {
      'schema':'jweb.silhouette-tester.structure.v2',
      'name':name,
      'elements':[{'type':'obj','id':'model','path':f'../models/{obj_name}','roles':['visual','collider']}],
      'checks':checks,
    }


# 1. EATING FORK -------------------------------------------------------------
# v2 correction: the fork is now a rounded forged loft rather than a chain of
# rectangular prismoids. The handle is materially thicker, the outside edge is
# continuous through the neck/head, and tine slots open *inside* the head rather
# than creating accidental edge notches.
f=Obj('Eating fork v2 - rounded thick handle, four tines')
f.elliptical_loft_z([
    (-0.108,0.0000,0.0190,0.0000,0.0048),
    (-0.092,0.0000,0.0198,0.0002,0.0050),
    (-0.060,0.0000,0.0170,0.0004,0.0047),
    (-0.022,0.0000,0.0140,0.0005,0.0042),
    ( 0.010,0.0000,0.0165,0.0008,0.0038),
    ( 0.032,0.0000,0.0256,0.0012,0.0034),
    ( 0.044,0.0000,0.0256,0.0015,0.0032),
], sides=20, group='fork-body')
# Tines overlap the last 8 mm of the head. At their root they exactly tessellate
# the 25.6 mm head width, so no exterior shoulder notches are introduced.
root_centers=[-0.0096,-0.0032,0.0032,0.0096]
tip_centers=[-0.0103,-0.00345,0.00345,0.0103]
for i,(xb,xt) in enumerate(zip(root_centers,tip_centers),1):
    f.elliptical_loft_z([
        (0.036, xb,                         0.0064,0.0015,0.0030),
        (0.046, xb+(xt-xb)*0.16,            0.0055,0.0018,0.0028),
        (0.072, xb+(xt-xb)*0.58,            0.0045,0.0026,0.0025),
        (0.091, xt,                         0.0034,0.0040,0.0022),
        (0.096, xt,                         0.0028,0.0044,0.0020),
    ], sides=14, group=f'tine-{i}')
f_meta=f.write(MODELS/'fork.obj')
f_checks=[
    {'type':'extent','selector':'fork-body','axis':'y','min':0.0040,'id':'fork-handle-not-knife-thin'},
    {'type':'extent','selector':'tine-*','axis':'y','min':0.0019,'id':'fork-tines-have-safe-material-thickness'},
]
for i in range(1,5):
    f_checks.append({'type':'contact','a':'fork-body','b':f'tine-{i}','max_gap':0.0005,'id':f'fork-body-joins-tine-{i}'})
(SPECS/'fork.json').write_text(json.dumps(make_spec('Eating Fork v2','fork.obj',f_checks),indent=2)+'\n')


# 2. CHEAP ROLL-OUT WIRE FENCE ---------------------------------------------
# v2 correction: this is no longer a picket fence. It is one complete bay of
# inexpensive galvanized welded-wire roll fencing: two posts, one top rail/pole,
# and wire mesh tied between them. No bottom rail.
fe=Obj('Cheap welded-wire roll fence - one bay inclusive')
post_x=(-1.20,1.20)
post_r=0.030
rail_y=1.18
for n,x in enumerate(post_x,1):
    fe.cylinder_between((x,0.0,0.0),(x,1.30,0.0),post_r,14,f'post-{n}')
# One horizontal pole across the top, centerline spanning post center-to-center.
fe.cylinder_between((post_x[0],rail_y,0.0),(post_x[1],rail_y,0.0),0.020,12,'top-rail')
# Roll-out welded wire panel. Mesh touches the inner faces of both posts and rises
# to the underside of the top rail. Small 3 mm wires are modeled as actual solids.
x0=post_x[0]+post_r; x1=post_x[1]-post_r
y0=0.10; y1=rail_y-0.020
wire_r=0.0015
# Edge wires are deliberate attachment members; interior spacing is ~240 mm.
vertical_count=11
for i in range(vertical_count):
    x=x0+(x1-x0)*i/(vertical_count-1)
    fe.cylinder_between((x,y0,0.0),(x,y1,0.0),wire_r,8,f'mesh-v-{i:02d}')
horizontal_count=7
for j in range(horizontal_count):
    y=y0+(y1-y0)*j/(horizontal_count-1)
    fe.cylinder_between((x0,y,0.0),(x1,y,0.0),wire_r,8,f'mesh-h-{j:02d}')
fe_meta=fe.write(MODELS/'fence.obj')
fe_checks=[
    {'type':'contact','a':'top-rail','b':'post-1','max_gap':0.001,'id':'top-rail-attached-left-post'},
    {'type':'contact','a':'top-rail','b':'post-2','max_gap':0.001,'id':'top-rail-attached-right-post'},
    {'type':'contact','a':'mesh-v-00','b':'post-1','max_gap':0.002,'id':'wire-roll-tied-left'},
    {'type':'contact','a':'mesh-v-10','b':'post-2','max_gap':0.002,'id':'wire-roll-tied-right'},
    {'type':'contact','a':'mesh-h-06','b':'top-rail','max_gap':0.003,'id':'wire-roll-reaches-top-rail'},
    {'type':'extent','selector':'post-*','axis':'y','min':1.29,'id':'fence-post-height'},
]
(SPECS/'fence.json').write_text(json.dumps(make_spec('Cheap Roll-Out Wire Fence Bay v2','fence.obj',fe_checks),indent=2)+'\n')


# 3. TRADITIONAL HOUSE WITH EXPLICIT LOAD PATHS -----------------------------
h=Obj('Traditional two-story gable farmhouse v2 - explicit support chain')
W,D=8.4,6.8
FOUND_TOP=0.50
WALL_TOP=4.62
PLATE_H=0.14
PLATE_TOP=WALL_TOP+PLATE_H
RIDGE_TOP=7.22
ROOF_T=0.18

def endpoint_y_for_supported_line(x0, x1, y1, thickness, support_x, support_top):
    """Solve y(x0) so the slab underside passes exactly through a support top.

    The roof helpers model thickness as a world-Y offset. This equation makes the
    load-bearing condition explicit instead of guessing an eave elevation that
    merely overlaps in AABB space.
    """
    r=(float(support_x)-float(x0))/(float(x1)-float(x0))
    if not (0.0 <= r < 1.0):
        raise ValueError('support must lie between endpoint x0 and fixed endpoint x1')
    return (float(support_top)+float(thickness)-r*float(y1))/(1.0-r)
# Ground-bearing foundation and supported main wall mass.
h.box((0,FOUND_TOP/2,0),(W,FOUND_TOP,D),'foundation')
h.box((0,(FOUND_TOP+WALL_TOP)/2,0),(W,WALL_TOP-FOUND_TOP,D),'main-walls')
# Real top plates under both rafter seats.
plate_w=0.24
h.box((-W/2+plate_w/2,WALL_TOP+PLATE_H/2,0),(plate_w,PLATE_H,D),'top-plate-left')
h.box(( W/2-plate_w/2,WALL_TOP+PLATE_H/2,0),(plate_w,PLATE_H,D),'top-plate-right')
# Roof halves deliberately overlap by 80 mm at ridge: no crack/separation can
# appear from floating-point/rasterization or from two merely edge-touching slabs.
# Crucially, eave elevation is SOLVED from the actual top-plate bearing point.
# The overhang therefore continues naturally down-slope outside the wall instead
# of being held artificially high above the plate.
roof_x=W/2+0.45; roof_z=D/2+0.48
left_seat_x=-W/2+plate_w/2
right_seat_x=W/2-plate_w/2
left_eave_top=endpoint_y_for_supported_line(-roof_x,0.04,RIDGE_TOP,ROOF_T,left_seat_x,PLATE_TOP)
right_eave_top=endpoint_y_for_supported_line(roof_x,-0.04,RIDGE_TOP,ROOF_T,right_seat_x,PLATE_TOP)
h.roof_slab_x(-roof_x, 0.04, left_eave_top,RIDGE_TOP,roof_z,ROOF_T,'roof-left')
h.roof_slab_x( roof_x,-0.04, right_eave_top,RIDGE_TOP,roof_z,ROOF_T,'roof-right')
# Ridge board physically occupies the joint rather than leaving two independent shells.
h.box((0,RIDGE_TOP-ROOF_T*0.55,0),(0.10,ROOF_T*0.90,D+0.30),'ridge-board')
# Gable infill rises from wall/top-plate zone into the roof volume.
h.gable(D/2-0.04,0.20,W/2,WALL_TOP,RIDGE_TOP-0.12,'front-gable')
h.gable(-D/2+0.04,0.20,W/2,WALL_TOP,RIDGE_TOP-0.12,'rear-gable')

# Full-height masonry chimney: no longer a floating roof ornament. It bears on the
# foundation and continues through the house and roof to above-ridge termination.
chimney_x=-2.25; chimney_z=-0.82
h.box((chimney_x,4.05,chimney_z),(0.68,8.10,0.72),'chimney')

# Porch support chain: masonry piers -> front beam/deck -> columns -> header -> shed roof.
porch_z0=D/2-0.02; porch_z1=D/2+1.85
porch_xs=(-2.75,-0.92,0.92,2.75)
deck_bottom=0.42; deck_top=0.58
pier_top=0.26
for i,x in enumerate(porch_xs,1):
    h.box((x,pier_top/2,porch_z1-0.18),(0.30,pier_top,0.30),f'porch-pier-{i}')
# Beam bears exactly on pier tops and deck bears exactly on beam top.
h.box((0,(pier_top+deck_bottom)/2,porch_z1-0.18),(6.55,deck_bottom-pier_top,0.24),'porch-deck-beam')
h.box((0,(deck_bottom+deck_top)/2,(porch_z0+porch_z1)/2),(6.55,deck_top-deck_bottom,porch_z1-porch_z0),'porch-deck')
# Columns begin on top of deck and terminate exactly at header underside.
header_bottom=2.66; header_h=0.18; header_top=header_bottom+header_h
for i,x in enumerate(porch_xs,1):
    h.box((x,(deck_top+header_bottom)/2,porch_z1-0.18),(0.19,header_bottom-deck_top,0.19),f'porch-column-{i}')
h.box((0,header_bottom+header_h/2,porch_z1-0.18),(6.65,header_h,0.22),'porch-header')
# House-side ledger gives the inner porch rafters a real bearing point.
ledger_y=3.36; ledger_h=0.16
h.box((0,ledger_y,D/2+0.055),(6.75,ledger_h,0.18),'porch-ledger')
# Solve the shed-roof plane from BOTH actual bearing lines. The previous pass
# guessed endpoint heights and could miss the header even though the AABBs overlapped.
porch_roof_t=0.17
z_inner=D/2+0.02; z_outer=porch_z1+0.18
z_ledger=D/2+0.055; z_header=porch_z1-0.18
y_ledger_top=ledger_y+ledger_h/2+porch_roof_t
y_header_top=header_top+porch_roof_t
slope=(y_header_top-y_ledger_top)/(z_header-z_ledger)
porch_roof_inner_top=y_ledger_top+slope*(z_inner-z_ledger)
porch_roof_outer_top=y_ledger_top+slope*(z_outer-z_ledger)
h.shed_roof_z(3.45,z_inner,z_outer,porch_roof_inner_top,porch_roof_outer_top,porch_roof_t,'porch-roof')

# Four ground-built masonry steps rise toward the porch; highest tread is flush with deck top.
step_depth=0.34
for i,top_y in enumerate((0.145,0.290,0.435,0.580),1):
    zc=porch_z1+step_depth*(4-i+0.5)  # lowest is farthest out, highest nearest deck
    width=1.85-(4-i)*0.10
    h.box((0,top_y/2,zc),(width,top_y,step_depth),f'front-step-{i}')
# Rear stoop is ground-bearing and touches the rear wall/foundation.
h.box((1.55,0.18,-D/2-0.34),(1.7,0.36,0.68),'rear-stoop')

h_meta=h.write(MODELS/'house.obj')
h_checks=[
    {'type':'contact','a':'roof-left','b':'roof-right','max_gap':0.0,'id':'gable-roof-halves-overlap-at-ridge'},
    {'type':'contact','a':'roof-left','b':'ridge-board','max_gap':0.001,'id':'left-rafter-joint-ridge-board'},
    {'type':'contact','a':'roof-right','b':'ridge-board','max_gap':0.001,'id':'right-rafter-joint-ridge-board'},
    {'type':'contact','a':'roof-left','b':'top-plate-left','max_gap':0.001,'id':'left-roof-bears-on-left-top-plate'},
    {'type':'contact','a':'roof-right','b':'top-plate-right','max_gap':0.001,'id':'right-roof-bears-on-right-top-plate'},
    {'type':'support','supported':'main-walls','supporter':'foundation','max_gap':0.001,'max_penetration':0.001,'id':'walls-supported-by-foundation'},
    {'type':'support','supported':'top-plate-left','supporter':'main-walls','max_gap':0.001,'max_penetration':0.001,'id':'left-top-plate-supported-by-wall'},
    {'type':'support','supported':'top-plate-right','supporter':'main-walls','max_gap':0.001,'max_penetration':0.001,'id':'right-top-plate-supported-by-wall'},
    {'type':'support','supported':'chimney','supporter':'foundation','max_gap':0.001,'max_penetration':0.51,'id':'chimney-grounded-through-foundation'},
    {'type':'contact','a':'porch-deck','b':'main-walls','max_gap':0.001,'id':'porch-deck-ledger-contact-house'},
    {'type':'support','supported':'porch-deck','supporter':'porch-deck-beam','max_gap':0.001,'max_penetration':0.02,'id':'porch-deck-supported-front-beam'},
    {'type':'contact','a':'porch-roof','b':'porch-ledger','max_gap':0.002,'id':'porch-roof-bears-house-ledger'},
    {'type':'contact','a':'porch-roof','b':'porch-header','max_gap':0.002,'id':'porch-roof-bears-front-header'},
]
for i in range(1,5):
    h_checks.extend([
        {'type':'support','supported':f'porch-deck-beam','supporter':f'porch-pier-{i}','max_gap':0.001,'max_penetration':0.02,'id':f'porch-beam-bearing-pier-{i}'},
        {'type':'support','supported':f'porch-column-{i}','supporter':'porch-deck','max_gap':0.001,'max_penetration':0.001,'id':f'porch-column-{i}-starts-on-deck'},
        {'type':'support','supported':'porch-header','supporter':f'porch-column-{i}','max_gap':0.001,'max_penetration':0.001,'id':f'porch-header-bearing-column-{i}'},
    ])
(SPECS/'house.json').write_text(json.dumps(make_spec('Traditional Gable Farmhouse v2','house.obj',h_checks),indent=2)+'\n')

manifest={
    'schema':'jweb.model-fixpass.v2',
    'fork':f_meta,'fence':fe_meta,'house':h_meta,
    'changes':[
        'fork uses rounded continuous lofts, thicker handle/tines, and no accidental exterior seam notches',
        'fence is galvanized roll-out welded wire between two posts with one top rail',
        'house roof halves overlap and share a ridge board; explicit foundation/wall/top-plate/porch/chimney load paths are modeled',
    ],
    'principle':'3D construction first. Silhouette remains an observer; v2 harness adds physical component diagnostics independent of projection aesthetics.'
}
(ROOT/'model-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))

# 4. APARTMENT DOGLEG STAIR / WALKWAY ---------------------------------------
# This fixture is intentionally authored as one semantic stair description in the
# harness spec. Visual treads and physics ramps are therefore derived from the same
# endpoints/width/step counts instead of being hand-built twice.
apartment_spec={
  'schema':'jweb.geometry-scene.v1',
  'name':'Apartment Dogleg Stair Walkway',
  'source_kind':'authored-structure',
  'source_metadata':{
    'family':'interior apartment egress stair',
    'floor_to_floor_m':3.0,
    'stair_width_m':1.08,
    'landing_depth_m':1.20,
    'principle':'visual steps and collider ramps share the same semantic flight authority',
  },
  'elements':[
    {'type':'box','id':'base-floor-slab','center':[0,-0.09,-0.85],'size':[2.80,0.18,5.10],'roles':['visual','collider']},
    {'type':'landing','id':'mid-landing','center':[0,1.42,1.02],'size':[2.50,0.16,1.20],'roles':['visual','collider']},
    {'type':'landing','id':'upper-landing','center':[0.65,2.92,-2.70],'size':[1.20,0.16,1.20],'roles':['visual','collider']},
    {'type':'box','id':'support:mid-beam','center':[0,1.24,1.02],'size':[2.70,0.20,0.22],'roles':['visual','collider']},
    {'type':'box','id':'support:column-left','center':[-1.05,0.57,1.02],'size':[0.18,1.14,0.18],'roles':['visual','collider']},
    {'type':'box','id':'support:column-right','center':[1.05,0.57,1.02],'size':[0.18,1.14,0.18],'roles':['visual','collider']},
    {'type':'stair','id':'flight-low','start':[-0.65,0.0,-2.10],'end':[-0.65,1.50,0.42],
      'width':1.08,'steps':9,'construction':'closed','tread_thickness':0.08,'collider_thickness':0.14,
      'rails':{'enabled':True,'height':0.96,'post_every_steps':2,'post_thickness':0.045,'rail_thickness':0.055,
               'sides':['left','right'],'roles':['visual','collider']}},
    {'type':'stair','id':'flight-high','start':[0.65,1.50,0.42],'end':[0.65,3.0,-2.10],
      'width':1.08,'steps':9,'construction':'closed','tread_thickness':0.08,'collider_thickness':0.14,
      'rails':{'enabled':True,'height':0.96,'post_every_steps':2,'post_thickness':0.045,'rail_thickness':0.055,
               'sides':['left','right'],'roles':['visual','collider']}},
    # Diagnostic volumes do not render or affect framing.
    {'type':'box','id':'diagnostic:turn-clearance','center':[0,2.02,1.02],'size':[2.10,0.90,0.92],'roles':[]},
  ],
  'checks':[
    {'type':'contact','a':'flight-low:collider-ramp','b':'base-floor-slab','max_gap':0.001,'id':'lower-ramp-meets-floor'},
    {'type':'contact','a':'flight-low:collider-ramp','b':'mid-landing','max_gap':0.001,'id':'lower-ramp-meets-turn-landing'},
    {'type':'contact','a':'flight-high:collider-ramp','b':'mid-landing','max_gap':0.001,'id':'upper-ramp-leaves-turn-landing'},
    {'type':'contact','a':'flight-high:collider-ramp','b':'upper-landing','max_gap':0.001,'id':'upper-ramp-meets-upper-floor'},
    {'type':'support','supported':'mid-landing','supporter':'support:mid-beam','max_gap':0.001,'max_penetration':0.001,'id':'turn-landing-bears-on-beam'},
    {'type':'support','supported':'support:mid-beam','supporter':'support:column-left','max_gap':0.001,'max_penetration':0.001,'id':'beam-bears-left-column'},
    {'type':'support','supported':'support:mid-beam','supporter':'support:column-right','max_gap':0.001,'max_penetration':0.001,'id':'beam-bears-right-column'},
    {'type':'support','supported':'support:column-left','supporter':'base-floor-slab','max_gap':0.001,'max_penetration':0.001,'id':'left-column-grounded'},
    {'type':'support','supported':'support:column-right','supporter':'base-floor-slab','max_gap':0.001,'max_penetration':0.001,'id':'right-column-grounded'},
    {'type':'extent','selector':['flight-low:step:*','flight-high:step:*'],'axis':'x','min':2.25,'max':2.40,'id':'two-lane-stair-overall-width'},
    {'type':'count','selector':'flight-low:step:*','exact':9,'id':'lower-flight-step-count'},
    {'type':'count','selector':'flight-high:step:*','exact':9,'id':'upper-flight-step-count'},
    {'type':'clearance','clearance':'diagnostic:turn-clearance','obstacles':['support:column-*'],'max_penetration':0.0,'id':'turning-space-free-of-support-columns'},
  ],
}
(SPECS/'apartment-stair.json').write_text(json.dumps(apartment_spec,indent=2)+'\n')


# 5. HORSE STATUE ------------------------------------------------------------
# A low-poly cast/stone statue with every visible solid also carrying collision.
# The plinth and four legs create a literal gravity path; body/head/neck/tail are
# overlapping cast masses rather than disconnected decorative shells.
hs=Obj('Standing horse statue on plinth')
hs.box((0,0.20,0),(1.55,0.40,3.05),'plinth')
# Body and chest masses.
hs.ellipsoid((0,1.55,0.00),(0.52,0.43,0.83),24,12,'body')
hs.ellipsoid((0,1.62,0.52),(0.48,0.46,0.48),20,10,'chest')
# Four planted legs, two-piece to avoid broomstick geometry.
legs={
 'front-left':((-0.30,1.56,0.48),(-0.31,1.00,0.58),(-0.31,0.40,0.55)),
 'front-right':((0.30,1.56,0.48),(0.31,1.00,0.58),(0.31,0.40,0.55)),
 'hind-left':((-0.30,1.50,-0.48),(-0.34,0.98,-0.58),(-0.34,0.40,-0.66)),
 'hind-right':((0.30,1.50,-0.48),(0.34,0.98,-0.58),(0.34,0.40,-0.66)),
}
for name,(hip,knee,hoof) in legs.items():
    hs.tapered_cylinder_between(hip,knee,0.115,0.085,12,f'leg-{name}-upper')
    hs.tapered_cylinder_between(knee,hoof,0.088,0.105,12,f'leg-{name}-lower')
    hs.ellipsoid((hoof[0],0.43,hoof[2]),(0.13,0.055,0.18),14,7,f'hoof-{name}')
# Neck/head/muzzle.
hs.tapered_cylinder_between((0,1.72,0.55),(0,2.12,0.92),0.31,0.21,18,'neck')
hs.ellipsoid((0,2.22,1.12),(0.27,0.32,0.40),22,11,'head')
hs.ellipsoid((0,2.12,1.47),(0.23,0.20,0.30),18,9,'muzzle')
# Ears are tapered cast projections.
hs.tapered_cylinder_between((-0.12,2.43,1.02),(-0.14,2.68,0.98),0.070,0.018,10,'ear-left')
hs.tapered_cylinder_between((0.12,2.43,1.02),(0.14,2.68,0.98),0.070,0.018,10,'ear-right')
# Tail: two joined cast segments.
hs.tapered_cylinder_between((0,1.66,-0.72),(0,1.42,-1.05),0.105,0.075,12,'tail-root')
hs.tapered_cylinder_between((0,1.42,-1.05),(0,0.98,-1.30),0.075,0.030,12,'tail-tip')
horse_meta=hs.write(MODELS/'horse-statue.obj')
horse_checks=[]
for name in legs:
    horse_checks += [
      {'type':'support','supported':f'hoof-{name}','supporter':'plinth','max_gap':0.001,'max_penetration':0.04,'id':f'hoof-{name}-planted'},
      {'type':'contact','a':f'leg-{name}-lower','b':f'leg-{name}-upper','max_gap':0.001,'id':f'{name}-knee-connected'},
      {'type':'contact','a':f'leg-{name}-upper','b':['body','chest'],'max_gap':0.001,'id':f'{name}-leg-enters-body'},
    ]
horse_checks += [
  {'type':'contact','a':'neck','b':['body','chest'],'max_gap':0.001,'id':'neck-joins-torso'},
  {'type':'contact','a':'neck','b':'head','max_gap':0.001,'id':'neck-joins-head'},
  {'type':'contact','a':'head','b':'muzzle','max_gap':0.001,'id':'muzzle-joins-head'},
  {'type':'contact','a':'tail-root','b':'body','max_gap':0.001,'id':'tail-root-joins-body'},
  {'type':'contact','a':'tail-root','b':'tail-tip','max_gap':0.001,'id':'tail-segments-join'},
  {'type':'extent','selector':'model:*','axis':'y','min':2.65,'max':2.72,'id':'horse-statue-height'},
]
(SPECS/'horse-statue.json').write_text(json.dumps(make_spec('Horse Statue','horse-statue.obj',horse_checks),indent=2)+'\n')


# 6. PROJECTING SMALL-BUSINESS WALL SIGN -----------------------------------
sg=Obj('Projecting blade sign with wall hardware')
# Two steel wall plates touch the diagnostic building wall in the spec.
sg.box((0,2.34,0.045),(0.34,0.36,0.09),'wall-plate-upper')
sg.box((0,1.92,0.045),(0.30,0.30,0.09),'wall-plate-lower')
# Square-tube upper arm projecting from the wall.
sg.box((0,2.34,0.67),(0.10,0.10,1.25),'top-arm')
# Diagonal brace and two hanger rods.
sg.cylinder_between((0,1.98,0.09),(0,2.29,0.98),0.040,12,'diagonal-brace')
sg.cylinder_between((0,2.29,0.44),(0,2.04,0.44),0.030,10,'hanger-inner')
sg.cylinder_between((0,2.29,0.96),(0,2.04,0.96),0.030,10,'hanger-outer')
# Double-sided sign cabinet, perpendicular to wall. The text/graphics are a
# material concern later; geometry is the physical sign body and trim.
sg.box((0,1.62,0.70),(0.12,0.84,0.98),'sign-cabinet')
sg.box((0,2.055,0.70),(0.16,0.07,1.04),'sign-top-trim')
sg.box((0,1.185,0.70),(0.16,0.07,1.04),'sign-bottom-trim')
sign_meta=sg.write(MODELS/'wall-business-sign.obj')
sign_spec={
  'schema':'jweb.geometry-scene.v1','name':'Projecting Small-Business Wall Sign','source_kind':'authored-structure',
  'source_metadata':{'family':'projecting blade sign','mount':'two wall plates + arm + diagonal brace + two hangers'},
  'elements':[
    {'type':'obj','id':'model','path':'../models/wall-business-sign.obj','roles':['visual','collider']},
    {'type':'box','id':'diagnostic:building-wall','center':[0,1.75,-0.05],'size':[3.0,3.50,0.10],'roles':[]},
  ],
  'checks':[
    {'type':'contact','a':'wall-plate-upper','b':'diagnostic:building-wall','max_gap':0.001,'id':'upper-plate-seated-on-wall'},
    {'type':'contact','a':'wall-plate-lower','b':'diagnostic:building-wall','max_gap':0.001,'id':'lower-plate-seated-on-wall'},
    {'type':'contact','a':'top-arm','b':'wall-plate-upper','max_gap':0.001,'id':'arm-welded-to-upper-plate'},
    {'type':'contact','a':'diagonal-brace','b':'wall-plate-lower','max_gap':0.001,'id':'brace-starts-at-lower-plate'},
    {'type':'contact','a':'diagonal-brace','b':'top-arm','max_gap':0.001,'id':'brace-terminates-at-arm'},
    {'type':'contact','a':'hanger-inner','b':'top-arm','max_gap':0.001,'id':'inner-hanger-attaches-arm'},
    {'type':'contact','a':'hanger-outer','b':'top-arm','max_gap':0.001,'id':'outer-hanger-attaches-arm'},
    {'type':'contact','a':'hanger-inner','b':['sign-cabinet','sign-top-trim'],'max_gap':0.001,'id':'inner-hanger-attaches-sign'},
    {'type':'contact','a':'hanger-outer','b':['sign-cabinet','sign-top-trim'],'max_gap':0.001,'id':'outer-hanger-attaches-sign'},
    {'type':'contact','a':'sign-top-trim','b':'sign-cabinet','max_gap':0.001,'id':'top-trim-fixed-to-cabinet'},
    {'type':'contact','a':'sign-bottom-trim','b':'sign-cabinet','max_gap':0.001,'id':'bottom-trim-fixed-to-cabinet'},
  ],
}
(SPECS/'wall-business-sign.json').write_text(json.dumps(sign_spec,indent=2)+'\n')

manifest.update({
  'apartment-stair':{'representation':'semantic geometry spec','spec':'specs/apartment-stair.json'},
  'horse-statue':horse_meta,
  'wall-business-sign':sign_meta,
})
manifest['changes'].extend([
  'added a physically supported two-flight apartment dogleg stair fixture driven by one semantic visual/collider stair authority',
  'added a planted four-leg horse statue on a plinth with connected neck/head/tail masses',
  'added a wall-mounted projecting business blade sign with plates, arm, brace, hangers, cabinet, and diagnostic wall attachment checks',
])
(ROOT/'model-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('added apartment stair, horse statue, and wall business sign fixtures')
