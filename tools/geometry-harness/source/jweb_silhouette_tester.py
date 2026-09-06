#!/usr/bin/env python3
"""JWEB unified geometry + silhouette harness.

One hardened observer for authored structures and captured JWEB city chunks.
Both ingest paths normalize to TriBatch geometry with visual/collider role bits;
projection, framing, rasterization, diffs, reports, and geometry checks are shared.
"""
from __future__ import annotations

import argparse
import fnmatch
import gzip
import json
import math
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROLE_VISUAL = 1
ROLE_COLLIDER = 2
ROLE_BOTH = ROLE_VISUAL | ROLE_COLLIDER
VIEW_ORDER = ("front", "side", "top", "isometric")
CARDINAL_VIEW_ORDER = ("north", "east", "south", "west")
EPS = 1e-9
BOX_FACES = np.array([
    [0,1,2],[0,2,3], [4,6,5],[4,7,6],
    [0,4,5],[0,5,1], [3,2,6],[3,6,7],
    [1,5,6],[1,6,2], [0,3,7],[0,7,4],
], dtype=np.int32)


def _roles(value) -> int:
    if value is None or value == "both":
        return ROLE_BOTH
    if isinstance(value, int):
        iv=int(value)
        if iv < 0 or (iv & ~ROLE_BOTH):
            raise ValueError(f"invalid role bitmask: {iv}; only 0..{ROLE_BOTH} are valid")
        return iv
    if isinstance(value, str):
        value = [value]
    bits = 0
    for item in value:
        s = str(item).lower()
        if s in {"visual", "render", "visible"}:
            bits |= ROLE_VISUAL
        elif s in {"collider", "collision", "physics"}:
            bits |= ROLE_COLLIDER
        elif s == "both":
            bits |= ROLE_BOTH
        else:
            raise ValueError(f"unknown role: {item}")
    return bits


def _v3(v) -> np.ndarray:
    a = np.asarray(v, dtype=np.float64)
    if a.shape != (3,):
        raise ValueError(f"expected vec3, got {v}")
    return a


def _unit(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    if n <= EPS:
        raise ValueError("zero-length vector")
    return v / n


def _yaw_matrix(deg: float) -> np.ndarray:
    a = math.radians(float(deg))
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]], dtype=np.float64)


@dataclass
class TriBatch:
    vertices: np.ndarray  # (N, 3)
    faces: np.ndarray     # (M, 3)
    roles: int
    tag: str
    convex: bool = False

    def triangles(self) -> np.ndarray:
        return self.vertices[self.faces]


def _box_vertices_faces(center, size, yaw_deg=0.0):
    c = _v3(center)
    sx, sy, sz = map(float, size)
    if min(sx, sy, sz) <= 0:
        raise ValueError(f"box size must be positive: {size}")
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = np.array([
        [-hx, -hy, -hz], [ hx, -hy, -hz], [ hx,  hy, -hz], [-hx,  hy, -hz],
        [-hx, -hy,  hz], [ hx, -hy,  hz], [ hx,  hy,  hz], [-hx,  hy,  hz],
    ], dtype=np.float64)
    if yaw_deg:
        v = v @ _yaw_matrix(yaw_deg).T
    v += c
    return v, BOX_FACES.copy()


def add_box(out: list[TriBatch], *, center, size, yaw_deg=0.0, roles=ROLE_BOTH, tag="box"):
    v, f = _box_vertices_faces(center, size, yaw_deg)
    out.append(TriBatch(v, f, roles, tag, True))


def add_parallelepiped(out: list[TriBatch], *, corners, roles=ROLE_BOTH, tag="parallelepiped"):
    v = np.asarray(corners, dtype=np.float64)
    if v.shape != (8, 3):
        raise ValueError(f"parallelepiped requires 8 vec3 corners, got {v.shape}")
    if not np.all(np.isfinite(v)):
        raise ValueError("parallelepiped corners must be finite")
    out.append(TriBatch(v, BOX_FACES.copy(), roles, tag, True))


def add_cylinder(out: list[TriBatch], *, center, radius, height, sides=16, roles=ROLE_BOTH, tag="cylinder"):
    """Closed vertical prism used for JWEB's radius-based prop colliders.

    Player physics tests these props as circles in XZ over [yMin, yMax]. A box is
    not an equivalent visualization: it invents collision in the four corners.
    """
    c=_v3(center); radius=float(radius); height=float(height); sides=int(sides)
    if not np.all(np.isfinite(c)) or not math.isfinite(radius) or not math.isfinite(height):
        raise ValueError("cylinder center/radius/height must be finite")
    if radius <= 0 or height <= 0:
        raise ValueError(f"cylinder radius/height must be positive: r={radius} h={height}")
    if sides < 6:
        raise ValueError(f"cylinder sides must be >= 6, got {sides}")
    y0=c[1]-height/2; y1=c[1]+height/2
    verts=[]
    for y in (y0,y1):
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append([c[0]+math.cos(a)*radius,y,c[2]+math.sin(a)*radius])
    verts.extend([[c[0],y0,c[2]],[c[0],y1,c[2]]])
    bottom_center=2*sides; top_center=bottom_center+1
    faces=[]
    for i in range(sides):
        j=(i+1)%sides
        faces.append([bottom_center,j,i])
        faces.append([top_center,sides+i,sides+j])
        faces.append([i,j,sides+j]); faces.append([i,sides+j,sides+i])
    out.append(TriBatch(np.asarray(verts,dtype=np.float64),np.asarray(faces,dtype=np.int32),roles,tag,True))


def _oriented_box_between(a, b, thickness_y, thickness_side, *, roles, tag):
    """Horizontal-ish rectangular beam between 3D endpoints, oriented in XZ and sloped in Y.

    Uses a true 3D local frame so a stair handrail follows rise as well as run.
    """
    a, b = _v3(a), _v3(b)
    d = b - a
    length = float(np.linalg.norm(d))
    if length <= EPS:
        return None
    u = d / length
    # Choose a stable side vector perpendicular to the run and world-up where possible.
    world_up = np.array([0.0, 1.0, 0.0])
    side = np.cross(world_up, u)
    if np.linalg.norm(side) <= EPS:
        side = np.array([1.0, 0.0, 0.0])
    side = _unit(side)
    normal = _unit(np.cross(u, side))
    hx, hy, hz = length / 2, thickness_y / 2, thickness_side / 2
    local = np.array([
        [-hx,-hy,-hz],[ hx,-hy,-hz],[ hx, hy,-hz],[-hx, hy,-hz],
        [-hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[-hx, hy, hz],
    ], dtype=np.float64)
    # local x -> u, local y -> normal, local z -> side
    basis = np.column_stack([u, normal, side])
    v = local @ basis.T + (a + b) / 2
    f = np.array([
        [0,1,2],[0,2,3], [4,6,5],[4,7,6],
        [0,4,5],[0,5,1], [3,2,6],[3,6,7],
        [1,5,6],[1,6,2], [0,3,7],[0,7,4],
    ], dtype=np.int32)
    return TriBatch(v, f, roles, tag, True)


def add_ramp_prism(out: list[TriBatch], *, start, end, width, thickness=0.12, roles=ROLE_COLLIDER, tag="ramp"):
    """Triangulated sloped prism following the same stair flight endpoints."""
    a = _v3(start)
    b = _v3(end)
    horizontal = np.array([b[0]-a[0], 0.0, b[2]-a[2]], dtype=np.float64)
    run = float(np.linalg.norm(horizontal))
    if run <= EPS:
        raise ValueError("ramp/stair flight requires nonzero horizontal run")
    d = horizontal / run
    side = np.array([-d[2], 0.0, d[0]], dtype=np.float64)
    hw = float(width) / 2
    # Top corners start/end, left/right. Bottom is offset down by thickness.
    top = np.array([
        a - side*hw,
        a + side*hw,
        b - side*hw,
        b + side*hw,
    ])
    bottom = top.copy(); bottom[:,1] -= float(thickness)
    v = np.vstack([top, bottom])
    f = np.array([
        [0,2,3],[0,3,1],      # sloped top
        [4,5,7],[4,7,6],      # bottom
        [0,4,6],[0,6,2],      # side
        [1,3,7],[1,7,5],      # side
        [0,1,5],[0,5,4],      # start cap
        [2,6,7],[2,7,3],      # end cap
    ], dtype=np.int32)
    out.append(TriBatch(v, f, roles, tag, True))


def add_stair_flight(out: list[TriBatch], *, start, end, width, steps, construction="jweb",
                     tread_thickness=0.08, collider_thickness=0.14, rails=None, tag="flight"):
    """Expand one semantic flight into role-tagged visual and collider geometry.

    This is intentionally ONE implementation. Visual steps and the collider ramp are
    derived from the exact same start/end/width/step count. Visibility is a later mask.
    """
    a = _v3(start); b = _v3(end)
    steps = int(steps)
    if steps <= 0:
        raise ValueError("steps must be > 0")
    hvec = np.array([b[0]-a[0], 0.0, b[2]-a[2]], dtype=np.float64)
    run = float(np.linalg.norm(hvec))
    if run <= EPS:
        raise ValueError("stair flight must have horizontal run")
    d = hvec / run
    side = np.array([-d[2], 0.0, d[0]])
    yaw = math.degrees(math.atan2(d[0], d[2]))
    step_run = run / steps
    dy = (b[1] - a[1]) / steps

    # Visual stair: every tread/riser derives from the flight metric.
    for i in range(steps):
        center_h = a + d * ((i + 0.5) * step_run)
        top_y = a[1] + (i + 1) * dy
        mode = str(construction).lower()
        if mode in {"jweb", "open", "treads", "closed"}:
            sy = float(tread_thickness)
            cy = top_y - sy/2
        elif mode in {"mass", "solid-mass", "stacked"}:
            base_y = min(a[1], b[1]) - float(tread_thickness)
            sy = max(float(tread_thickness), top_y - base_y)
            cy = base_y + sy/2
        else:
            raise ValueError(f"unknown stair construction mode: {construction}")
        add_box(out, center=[center_h[0], cy, center_h[2]], size=[width, sy, step_run*1.01],
                yaw_deg=yaw, roles=ROLE_VISUAL, tag=f"{tag}:step:{i}")
        if mode == "closed":
            # A thin riser plate; still derived from the exact same flight step boundary.
            front_h = a + d * ((i + 1) * step_run)
            riser_h = max(abs(dy), 0.02)
            riser_mid_y = top_y - dy/2
            add_box(out, center=[front_h[0], riser_mid_y, front_h[2]],
                    size=[width, riser_h, min(0.045, step_run*0.25)], yaw_deg=yaw,
                    roles=ROLE_VISUAL, tag=f"{tag}:riser:{i}")

    # Physics proxy: same authoritative endpoints/width, one smooth ramp.
    add_ramp_prism(out, start=a, end=b, width=width, thickness=collider_thickness,
                   roles=ROLE_COLLIDER, tag=f"{tag}:collider-ramp")

    if rails and rails.get("enabled", True):
        post_h = float(rails.get("height", 0.95))
        post_t = float(rails.get("post_thickness", 0.045))
        rail_t = float(rails.get("rail_thickness", 0.06))
        post_every = max(1, int(rails.get("post_every_steps", 3)))
        rail_roles = _roles(rails.get("roles", ["visual", "collider"]))
        sides = rails.get("sides", ["left", "right"])
        side_signs = []
        if "left" in sides: side_signs.append(-1)
        if "right" in sides: side_signs.append(1)
        for sign in side_signs:
            lateral = side * (float(width)/2 - post_t/2)
            # Posts sample exact stair slope at semantic step boundaries.
            for i in range(0, steps + 1, post_every):
                t = i / steps
                p = a + hvec * t
                p[1] = a[1] + (b[1]-a[1])*t
                p += lateral
                add_box(out, center=[p[0], p[1]+post_h/2, p[2]], size=[post_t, post_h, post_t],
                        roles=rail_roles, tag=f"{tag}:rail-post")
            r0 = a + lateral + np.array([0, post_h, 0])
            r1 = b + lateral + np.array([0, post_h, 0])
            beam = _oriented_box_between(r0, r1, rail_t, rail_t, roles=rail_roles, tag=f"{tag}:handrail")
            if beam is not None:
                out.append(beam)


def add_landing(out: list[TriBatch], *, center, size, yaw_deg=0.0, roles=ROLE_BOTH, tag="landing"):
    add_box(out, center=center, size=size, yaw_deg=yaw_deg, roles=roles, tag=tag)


def load_obj_batches(path: Path, roles: int, tag: str) -> list[TriBatch]:
    """Load OBJ while preserving `g` groups as physical diagnostic components.

    v1 flattened the whole OBJ into one opaque batch, which made it impossible to
    ask whether a roof half actually touched its ridge, a column actually reached
    a beam, or a fence mesh actually met a post. Geometry rendering is unchanged;
    only component identity is retained.
    """
    verts: list[list[float]] = []
    group_faces: dict[str, list[list[int]]] = {}
    current = "default"
    group_faces[current] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        toks = s.split()
        if toks[0] == "v" and len(toks) >= 4:
            verts.append([float(toks[1]), float(toks[2]), float(toks[3])])
        elif toks[0] in {"g", "o"}:
            current = toks[1] if len(toks) > 1 else "default"
            group_faces.setdefault(current, [])
        elif toks[0] == "f" and len(toks) >= 4:
            idx = []
            for t in toks[1:]:
                head=t.split("/")[0]
                if not head:
                    raise ValueError(f"OBJ face has missing vertex index: {path}: {s}")
                raw=int(head)
                if raw == 0:
                    raise ValueError(f"OBJ indices are 1-based; zero is invalid: {path}: {s}")
                resolved=raw-1 if raw>0 else len(verts)+raw
                if resolved < 0 or resolved >= len(verts):
                    raise ValueError(f"OBJ face index out of range: {raw} with {len(verts)} vertices in {path}")
                idx.append(resolved)
            for i in range(1, len(idx)-1):
                group_faces.setdefault(current, []).append([idx[0], idx[i], idx[i+1]])
    if not verts or not any(group_faces.values()):
        raise ValueError(f"OBJ has no triangles: {path}")
    out: list[TriBatch] = []
    for group, faces in group_faces.items():
        if not faces:
            continue
        used = sorted({i for face in faces for i in face})
        remap = {old: new for new, old in enumerate(used)}
        gv = np.asarray([verts[i] for i in used], dtype=np.float64)
        gf = np.asarray([[remap[i] for i in face] for face in faces], dtype=np.int32)
        component_tag = f"{tag}:{group}" if group != "default" else tag
        out.append(TriBatch(gv, gf, roles, component_tag))
    return out


def _apply_transform(batch: TriBatch, el: dict) -> TriBatch:
    v = batch.vertices.copy()
    scale = el.get("scale")
    if scale is not None:
        if isinstance(scale, (int, float)):
            v *= float(scale)
        else:
            v *= _v3(scale)
    yaw = float(el.get("yaw_deg", 0.0))
    if yaw:
        v = v @ _yaw_matrix(yaw).T
    pos = el.get("position") or el.get("translate")
    if pos is not None:
        v += _v3(pos)
    return TriBatch(v, batch.faces.copy(), batch.roles, batch.tag, batch.convex)


def expand_structure(spec: dict, base_dir: Path) -> list[TriBatch]:
    out: list[TriBatch] = []
    for n, el in enumerate(spec.get("elements", [])):
        typ = str(el.get("type", "box")).lower()
        tag = str(el.get("id", f"element-{n}"))
        roles = _roles(el.get("roles"))
        before = len(out)
        if typ == "box":
            add_box(out, center=el.get("center", [0,0,0]), size=el["size"], yaw_deg=el.get("yaw_deg", 0), roles=roles, tag=tag)
        elif typ in {"parallelepiped", "bounds_box", "obb"}:
            add_parallelepiped(out, corners=el["corners"], roles=roles, tag=tag)
        elif typ == "mesh":
            v = np.asarray(el["vertices"], dtype=np.float64)
            f = np.asarray(el["faces"], dtype=np.int32)
            out.append(TriBatch(v, f, roles, tag, bool(el.get("convex_projection", False))))
        elif typ in {"cylinder", "vertical_cylinder"}:
            add_cylinder(out, center=el["center"], radius=el["radius"], height=el["height"],
                         sides=el.get("sides",16), roles=roles, tag=tag)
        elif typ == "obj":
            out.extend(load_obj_batches((base_dir / el["path"]).resolve(), roles, tag))
        elif typ == "landing":
            add_landing(out, center=el["center"], size=el["size"], yaw_deg=el.get("yaw_deg",0), roles=roles, tag=tag)
        elif typ in {"ramp", "ramp_prism"}:
            add_ramp_prism(out, start=el["start"], end=el["end"], width=el["width"],
                           thickness=el.get("thickness", 0.12), roles=roles, tag=tag)
        elif typ in {"stair", "stair_flight"}:
            add_stair_flight(out,
                start=el["start"], end=el["end"], width=el["width"], steps=el["steps"],
                construction=el.get("construction","jweb"), tread_thickness=el.get("tread_thickness",0.08),
                collider_thickness=el.get("collider_thickness",0.14), rails=el.get("rails"), tag=tag)
        else:
            raise ValueError(f"unsupported element type {typ!r}")
        # Transform any newly emitted child geometry together. Generic mesh/OBJ/stair
        # transforms are origin-based and must work even when yaw is the ONLY transform.
        # Box/landing already define center/size/yaw explicitly; silently accepting a
        # second transform vocabulary for them is error-prone, so reject it.
        if typ in {"box","landing","cylinder","vertical_cylinder"} and any(k in el for k in ("position","translate","scale")):
            raise ValueError(f"{typ} uses direct geometry fields; position/translate/scale are not supported")
        if typ not in {"box","landing","cylinder","vertical_cylinder"} and any(k in el for k in ("position","translate","scale","yaw_deg")):
            for i in range(before, len(out)):
                out[i] = _apply_transform(out[i], el)
    if not out:
        raise ValueError("structure contains no renderable elements")
    return out


def _camera_basis(view: str):
    if view == "front":
        right = np.array([1.0,0.0,0.0]); up = np.array([0.0,1.0,0.0]); forward = np.array([0.0,0.0,-1.0])
    elif view == "side":
        right = np.array([0.0,0.0,-1.0]); up = np.array([0.0,1.0,0.0]); forward = np.array([-1.0,0.0,0.0])
    elif view == "top":
        right = np.array([1.0,0.0,0.0]); up = np.array([0.0,0.0,1.0]); forward = np.array([0.0,-1.0,0.0])
    elif view == "isometric":
        forward = _unit(np.array([-1.0,-0.78,-1.0]))
        world_up = np.array([0.0,1.0,0.0])
        right = _unit(np.cross(forward, world_up))
        up = _unit(np.cross(right, forward))
    elif view == "north":
        right=np.array([1.0,0.0,0.0]); up=np.array([0.0,1.0,0.0]); forward=np.array([0.0,0.0,1.0])
    elif view == "east":
        right=np.array([0.0,0.0,-1.0]); up=np.array([0.0,1.0,0.0]); forward=np.array([1.0,0.0,0.0])
    elif view == "south":
        right=np.array([-1.0,0.0,0.0]); up=np.array([0.0,1.0,0.0]); forward=np.array([0.0,0.0,-1.0])
    elif view == "west":
        right=np.array([0.0,0.0,1.0]); up=np.array([0.0,1.0,0.0]); forward=np.array([-1.0,0.0,0.0])
    else:
        raise ValueError(f"unknown view: {view}")
    return right, up, forward


def _project_points(points: np.ndarray, view: str) -> np.ndarray:
    right, up, _ = _camera_basis(view)
    points=np.asarray(points,dtype=np.float64)
    return np.stack([points @ right, points @ up], axis=-1)


def _convex_hull_2d(points: np.ndarray) -> np.ndarray:
    pts=sorted({(float(p[0]),float(p[1])) for p in np.asarray(points).reshape(-1,2)})
    if len(pts) <= 2:
        return np.asarray(pts,dtype=np.float64)
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for p in pts:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p) <= EPS: lower.pop()
        lower.append(p)
    upper=[]
    for p in reversed(pts):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p) <= EPS: upper.pop()
        upper.append(p)
    return np.asarray(lower[:-1]+upper[:-1],dtype=np.float64)


def _all_triangles(batches: Sequence[TriBatch], role_mask: int | None = None) -> np.ndarray:
    tris = []
    for b in batches:
        if role_mask is None or (b.roles & role_mask):
            if len(b.faces): tris.append(b.triangles())
    return np.concatenate(tris, axis=0) if tris else np.empty((0,3,3), dtype=np.float64)


def _project(tris: np.ndarray, view: str):
    right, up, forward = _camera_basis(view)
    if len(tris) == 0:
        return np.empty((0,3,2)), np.empty((0,3))
    uv = np.stack([tris @ right, tris @ up], axis=-1)
    depth = tris @ forward
    return uv, depth


def _frame_for_view(all_tris: np.ndarray, view: str, width: int, height: int, pad_frac: float):
    if int(width) <= 0 or int(height) <= 0:
        raise ValueError("render width/height must be positive")
    if not (0.0 <= float(pad_frac) < 0.5):
        raise ValueError("pad_frac must be in [0, 0.5)")
    if len(all_tris) == 0:
        raise ValueError("cannot frame structure with no visual/collider triangles")
    uv, _ = _project(all_tris, view)
    pts = uv.reshape(-1,2)
    mn = pts.min(axis=0); mx = pts.max(axis=0)
    span = np.maximum(mx-mn, 1e-6)
    usable_w = width * (1-2*pad_frac); usable_h = height * (1-2*pad_frac)
    scale = min(usable_w/span[0], usable_h/span[1])
    center = (mn+mx)/2
    return center, scale, mn, mx


def render_mask(batches: Sequence[TriBatch], role_mask: int, view: str, *, width=512, height=512, supersample=1,
                frame=None, pad_frac=0.06) -> np.ndarray:
    width = int(width); height = int(height); ss = max(1, int(supersample))
    if frame is None:
        frame = _frame_for_view(_all_triangles(batches, ROLE_BOTH), view, width, height, pad_frac)
    center, scale, _, _ = frame
    W, H = width*ss, height*ss
    im = Image.new("L", (W,H), 0)
    draw = ImageDraw.Draw(im)
    def pixelize(q):
        q=np.asarray(q,dtype=np.float64).copy()
        q[...,0] = (q[...,0]-center[0])*scale*ss + W/2
        q[...,1] = H/2 - (q[...,1]-center[1])*scale*ss
        return q
    for batch in batches:
        if not (batch.roles & role_mask):
            continue
        if batch.convex:
            hull=_convex_hull_2d(_project_points(batch.vertices,view))
            if len(hull) >= 3:
                q=pixelize(hull)
                draw.polygon([(float(x),float(y)) for x,y in q], fill=255)
            continue
        uv,_=_project(batch.triangles(),view)
        if len(uv):
            q=pixelize(uv)
            for tri in q:
                draw.polygon([(float(x),float(y)) for x,y in tri], fill=255)
    if ss > 1:
        im = im.resize((width,height), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=np.uint8)


def _save_binary(mask: np.ndarray, path: Path):
    # White background / black silhouette for maximum legibility and easy vision inspection.
    out = np.full(mask.shape + (4,), 255, dtype=np.uint8)
    ink = mask > 16
    out[ink,:3] = 0
    out[...,3] = 255
    Image.fromarray(out, "RGBA").save(path, compress_level=1)


def _save_overlay(visual: np.ndarray, collider: np.ndarray, path: Path):
    v = visual > 16; c = collider > 16
    out = np.full(v.shape + (4,), 255, dtype=np.uint8)
    both = v & c; vonly = v & ~c; conly = c & ~v
    out[both,:3] = (32,32,32)
    out[vonly,:3] = (196,32,88)   # visible-only
    out[conly,:3] = (0,142,176)   # collider-only
    Image.fromarray(out, "RGBA").save(path, compress_level=1)


def _mask_metrics(v: np.ndarray, c: np.ndarray):
    vb = v > 16; cb = c > 16
    both = int(np.count_nonzero(vb & cb)); union = int(np.count_nonzero(vb | cb))
    return {
        "visual_pixels": int(np.count_nonzero(vb)),
        "collider_pixels": int(np.count_nonzero(cb)),
        "shared_pixels": both,
        "visual_only_pixels": int(np.count_nonzero(vb & ~cb)),
        "collider_only_pixels": int(np.count_nonzero(cb & ~vb)),
        "iou": (both/union if union else 1.0),
    }



def _matches_selector(tag: str, selector) -> bool:
    if isinstance(selector, (list, tuple)):
        return any(_matches_selector(tag, item) for item in selector)
    pattern = str(selector)
    if fnmatch.fnmatch(tag, pattern):
        return True
    # Specs may address an OBJ group without repeating the outer element id.
    leaf = tag.split(":")[-1]
    return fnmatch.fnmatch(leaf, pattern)


def _select_batches(batches: Sequence[TriBatch], selector) -> list[TriBatch]:
    return [b for b in batches if _matches_selector(b.tag, selector)]


def _bbox_of(selected: Sequence[TriBatch]):
    if not selected:
        return None
    v = np.concatenate([b.vertices for b in selected], axis=0)
    return np.min(v, axis=0), np.max(v, axis=0)


def _aabb_gap(a_box, b_box):
    amn, amx = a_box; bmn, bmx = b_box
    sep = np.maximum(0.0, np.maximum(bmn-amx, amn-bmx))
    return float(np.linalg.norm(sep)), sep


def _aabb_overlap(a_box, b_box):
    amn, amx = a_box; bmn, bmx = b_box
    return np.maximum(0.0, np.minimum(amx, bmx) - np.maximum(amn, bmn))


def _point_triangle_distance_sq(p, a, b, c):
    """Squared distance from a point to a triangle (Ericson region tests)."""
    ab = b - a; ac = c - a; ap = p - a
    d1 = float(np.dot(ab, ap)); d2 = float(np.dot(ac, ap))
    if d1 <= 0.0 and d2 <= 0.0:
        return float(np.dot(ap, ap))
    bp = p - b
    d3 = float(np.dot(ab, bp)); d4 = float(np.dot(ac, bp))
    if d3 >= 0.0 and d4 <= d3:
        return float(np.dot(bp, bp))
    vc = d1*d4 - d3*d2
    if vc <= 0.0 and d1 >= 0.0 and d3 <= 0.0:
        v = d1 / (d1 - d3)
        q = a + v*ab
        d = p-q; return float(np.dot(d,d))
    cp = p - c
    d5 = float(np.dot(ab, cp)); d6 = float(np.dot(ac, cp))
    if d6 >= 0.0 and d5 <= d6:
        return float(np.dot(cp, cp))
    vb = d5*d2 - d1*d6
    if vb <= 0.0 and d2 >= 0.0 and d6 <= 0.0:
        w = d2 / (d2 - d6)
        q = a + w*ac
        d = p-q; return float(np.dot(d,d))
    va = d3*d6 - d5*d4
    if va <= 0.0 and (d4-d3) >= 0.0 and (d5-d6) >= 0.0:
        w = (d4-d3) / ((d4-d3) + (d5-d6))
        q = b + w*(c-b)
        d = p-q; return float(np.dot(d,d))
    denom = va + vb + vc
    if abs(denom) <= EPS:
        # Degenerate triangles are rejected by integrity checks, but keep this safe.
        return min(float(np.dot(p-a,p-a)), float(np.dot(p-b,p-b)), float(np.dot(p-c,p-c)))
    v = vb/denom; w = vc/denom
    q = a + ab*v + ac*w
    d = p-q
    return float(np.dot(d,d))


def _segment_segment_distance_sq(p1, q1, p2, q2):
    """Squared distance between two finite 3D segments."""
    d1=q1-p1; d2=q2-p2; r=p1-p2
    a=float(np.dot(d1,d1)); e=float(np.dot(d2,d2)); f=float(np.dot(d2,r))
    if a <= EPS and e <= EPS:
        return float(np.dot(r,r))
    if a <= EPS:
        s=0.0; t=min(1.0,max(0.0,f/e))
    else:
        c=float(np.dot(d1,r))
        if e <= EPS:
            t=0.0; s=min(1.0,max(0.0,-c/a))
        else:
            b=float(np.dot(d1,d2)); denom=a*e-b*b
            s=min(1.0,max(0.0,(b*f-c*e)/denom)) if abs(denom)>EPS else 0.0
            t=(b*s+f)/e
            if t < 0.0:
                t=0.0; s=min(1.0,max(0.0,-c/a))
            elif t > 1.0:
                t=1.0; s=min(1.0,max(0.0,(b-c)/a))
    c1=p1+d1*s; c2=p2+d2*t; d=c1-c2
    return float(np.dot(d,d))


def _segment_triangle_intersects(p0, p1, tri, eps=1e-10):
    """Moller-Trumbore segment/triangle intersection, including segment endpoints."""
    a,b,c=tri
    d=p1-p0; e1=b-a; e2=c-a
    h=np.cross(d,e2); det=float(np.dot(e1,h))
    if abs(det) <= eps:
        return False
    inv=1.0/det; s=p0-a; u=inv*float(np.dot(s,h))
    if u < -eps or u > 1.0+eps:
        return False
    q=np.cross(s,e1); v=inv*float(np.dot(d,q))
    if v < -eps or u+v > 1.0+eps:
        return False
    t=inv*float(np.dot(e2,q))
    return -eps <= t <= 1.0+eps


def _triangle_distance_sq(t1, t2):
    """Exact-enough triangle distance for diagnostics, including crossing triangles."""
    edges=((0,1),(1,2),(2,0))
    # Non-coplanar crossings can have no vertex on the other triangle and no edge-edge
    # intersection. Test every edge against the opposite face first.
    for i,j in edges:
        if _segment_triangle_intersects(t1[i],t1[j],t2) or _segment_triangle_intersects(t2[i],t2[j],t1):
            return 0.0
    best=math.inf
    for p in t1:
        best=min(best,_point_triangle_distance_sq(p,*t2))
    for p in t2:
        best=min(best,_point_triangle_distance_sq(p,*t1))
    for i,j in edges:
        for k,l in edges:
            best=min(best,_segment_segment_distance_sq(t1[i],t1[j],t2[k],t2[l]))
    return best


def _triangle_bounds(tris):
    return np.min(tris,axis=1), np.max(tris,axis=1)


def _mesh_surface_distance(selected_a, selected_b, stop_at=0.0):
    """Minimum triangle-surface distance with AABB broad phase.

    `stop_at` permits an early success when the caller only needs to know whether
    surfaces are within a tolerance. The returned distance is never an AABB-only
    approximation for a failing result.
    """
    ta=np.concatenate([b.triangles() for b in selected_a if len(b.faces)],axis=0)
    tb=np.concatenate([b.triangles() for b in selected_b if len(b.faces)],axis=0)
    if not len(ta) or not len(tb):
        return math.inf
    amin,amax=_triangle_bounds(ta); bmin,bmax=_triangle_bounds(tb)
    best_sq=math.inf
    threshold_sq=max(0.0,float(stop_at))**2
    for i,t in enumerate(ta):
        sep=np.maximum(0.0,np.maximum(bmin-amax[i],amin[i]-bmax))
        lower_sq=np.einsum('ij,ij->i',sep,sep)
        order=np.argsort(lower_sq)
        for j in order:
            lb=float(lower_sq[j])
            if lb > best_sq + 1e-24:
                break
            dsq=_triangle_distance_sq(t,tb[j])
            if dsq < best_sq:
                best_sq=dsq
                if best_sq <= threshold_sq + 1e-24:
                    return math.sqrt(max(0.0,best_sq))
    return math.sqrt(max(0.0,best_sq))


def _segment_aabb_intersects(p0,p1,box,eps=1e-12):
    mn,mx=box; d=p1-p0; t0,t1=0.0,1.0
    for ax in range(3):
        if abs(float(d[ax])) <= eps:
            if p0[ax] < mn[ax]-eps or p0[ax] > mx[ax]+eps:
                return False
            continue
        inv=1.0/float(d[ax]); a=(mn[ax]-p0[ax])*inv; b=(mx[ax]-p0[ax])*inv
        if a>b: a,b=b,a
        t0=max(t0,a); t1=min(t1,b)
        if t0>t1+eps: return False
    return True


def _aabb_corners_edges(box):
    mn,mx=box
    c=np.array([[x,y,z] for x in (mn[0],mx[0]) for y in (mn[1],mx[1]) for z in (mn[2],mx[2])],dtype=np.float64)
    edges=[]
    for i in range(8):
        for j in range(i+1,8):
            diff=np.count_nonzero(np.abs(c[i]-c[j])>1e-15)
            if diff==1: edges.append((c[i],c[j]))
    return c,edges


def _triangle_intersects_aabb(tri,box):
    mn,mx=box
    inside=np.all((tri>=mn-1e-12)&(tri<=mx+1e-12),axis=1)
    if bool(np.any(inside)): return True
    for a,b in ((0,1),(1,2),(2,0)):
        if _segment_aabb_intersects(tri[a],tri[b],box): return True
    _,edges=_aabb_corners_edges(box)
    for p0,p1 in edges:
        if _segment_triangle_intersects(p0,p1,tri): return True
    return False


def _mesh_intersects_aabb(selected,box):
    mn,mx=box
    for b in selected:
        for tri in b.triangles():
            tmn=np.min(tri,axis=0); tmx=np.max(tri,axis=0)
            if np.any(tmx < mn-1e-12) or np.any(tmn > mx+1e-12):
                continue
            if _triangle_intersects_aabb(tri,box):
                return True
    # Catch an obstacle component entirely inside the diagnostic volume.
    for b in selected:
        if len(b.vertices) and bool(np.any(np.all((b.vertices>=mn-1e-12)&(b.vertices<=mx+1e-12),axis=1))):
            return True
    return False


def _edge_incidence(batch):
    counts={}
    for face in batch.faces:
        for i,j in ((0,1),(1,2),(2,0)):
            a=int(face[i]); b=int(face[j]); key=(a,b) if a<b else (b,a)
            counts[key]=counts.get(key,0)+1
    return counts


def _edge_orientation_conflicts(batch):
    """Count manifold edges whose two incident faces traverse the edge the same way.

    Incidence==2 alone is not enough for an oriented closed surface: a flipped face
    can leave every undirected edge paired while invalidating solid orientation.
    """
    uses={}
    for face in batch.faces:
        for i,j in ((0,1),(1,2),(2,0)):
            a=int(face[i]); b=int(face[j]); key=(a,b) if a<b else (b,a)
            direction=1 if (a,b)==key else -1
            uses.setdefault(key,[]).append(direction)
    return sum(1 for directions in uses.values() if len(directions)==2 and directions[0]==directions[1])


def _signed_mesh_volume(batch):
    tris=batch.triangles()
    if not len(tris): return 0.0
    return float(np.sum(np.einsum('ij,ij->i',tris[:,0],np.cross(tris[:,1],tris[:,2])))/6.0)


def _face_component_count(batch):
    if not len(batch.faces): return 0
    edge_faces={}
    for fi,face in enumerate(batch.faces):
        for i,j in ((0,1),(1,2),(2,0)):
            a=int(face[i]); b=int(face[j]); key=(a,b) if a<b else (b,a)
            edge_faces.setdefault(key,[]).append(fi)
    adj=[set() for _ in range(len(batch.faces))]
    for fs in edge_faces.values():
        for a in fs:
            adj[a].update(x for x in fs if x!=a)
    seen=set(); comps=0
    for start in range(len(adj)):
        if start in seen: continue
        comps+=1; stack=[start]; seen.add(start)
        while stack:
            x=stack.pop()
            for y in adj[x]:
                if y not in seen: seen.add(y); stack.append(y)
    return comps


def _axis_index(value):
    if isinstance(value, int):
        return int(value)
    return {"x":0,"y":1,"z":2}[str(value).lower()]


def _mesh_integrity(batches: Sequence[TriBatch]):
    checks=[]
    for b in batches:
        v=np.asarray(b.vertices); f=np.asarray(b.faces)
        shape_ok=(v.ndim==2 and v.shape[1:]==(3,) and f.ndim==2 and f.shape[1:]==(3,))
        finite=bool(np.isfinite(v).all()) if v.size else False
        index_ok=bool(f.size and np.issubdtype(f.dtype,np.integer) and np.min(f)>=0 and np.max(f)<len(v)) if shape_ok else False
        degenerate=0; duplicate=0
        if shape_ok and finite and index_ok:
            tris=v[f]
            cross=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0])
            degenerate=int(np.count_nonzero(np.linalg.norm(cross,axis=1)<=1e-12))
            canon=np.sort(f,axis=1)
            duplicate=int(len(canon)-len(np.unique(canon,axis=0)))
        checks.append({
            "id":f"mesh-integrity:{b.tag}","type":"mesh_integrity",
            "pass":bool(shape_ok and finite and index_ok and degenerate==0 and duplicate==0),
            "tag":b.tag,"shape_ok":shape_ok,"finite":finite,"index_ok":index_ok,
            "degenerate_triangles":degenerate,"duplicate_triangles":duplicate,
            "vertices":int(len(v)) if v.ndim else 0,"triangles":int(len(f)) if f.ndim else 0,
        })
    return checks


def run_geometry_checks(spec: dict, batches: Sequence[TriBatch]):
    """Evaluate physical assertions without using any camera or silhouette pixels.

    AABBs are only broad-phase/extent tools. Contact authority is triangle-surface
    distance; clearance authority tests actual obstacle triangles against the
    diagnostic volume. This avoids the old false-positive class where overlapping
    bounding boxes were mistaken for physical attachment.
    """
    results=_mesh_integrity(batches)
    for n,rule in enumerate(spec.get("checks",[])):
        typ=str(rule.get("type","")).lower(); rid=str(rule.get("id",f"check-{n}"))
        item={"id":rid,"type":typ,"pass":False}
        try:
            if typ in {"contact","distance"}:
                aa=_select_batches(batches,rule["a"]); bb=_select_batches(batches,rule["b"])
                if not aa or not bb: raise ValueError(f"selector matched nothing: a={rule.get('a')} b={rule.get('b')}")
                max_gap=float(rule.get("max_gap",rule.get("max",0.001)))
                min_gap=float(rule.get("min_gap",rule.get("min",0.0)))
                surface_distance=_mesh_surface_distance(aa,bb,stop_at=max_gap if min_gap<=0 else 0.0)
                aabb_gap,sep=_aabb_gap(_bbox_of(aa),_bbox_of(bb))
                item.update({"a":rule["a"],"b":rule["b"],"surface_distance":surface_distance,
                             "aabb_gap":aabb_gap,"axis_separation":sep.tolist(),"min_gap":min_gap,"max_gap":max_gap})
                item["pass"]=min_gap-1e-12 <= surface_distance <= max_gap+1e-12
            elif typ=="support":
                supd=_select_batches(batches,rule["supported"]); supr=_select_batches(batches,rule["supporter"])
                if not supd or not supr: raise ValueError(f"selector matched nothing: supported={rule.get('supported')} supporter={rule.get('supporter')}")
                dmn,dmx=_bbox_of(supd); rmn,rmx=_bbox_of(supr)
                vertical_gap=float(dmn[1]-rmx[1])
                overlap_x=float(max(0.0,min(dmx[0],rmx[0])-max(dmn[0],rmn[0])))
                overlap_z=float(max(0.0,min(dmx[2],rmx[2])-max(dmn[2],rmn[2])))
                max_gap=float(rule.get("max_gap",0.001)); max_pen=float(rule.get("max_penetration",0.002)); min_overlap=float(rule.get("min_overlap",1e-6))
                # Exact surface proximity prevents footprint AABB coincidences from being
                # treated as bearing. If parts penetrate within the permitted tolerance,
                # intersecting surfaces give distance zero.
                surf=_mesh_surface_distance(supd,supr,stop_at=max(max_gap,max_pen))
                item.update({"supported":rule["supported"],"supporter":rule["supporter"],"vertical_gap":vertical_gap,
                             "surface_distance":surf,"max_gap":max_gap,"max_penetration":max_pen,
                             "overlap_x":overlap_x,"overlap_z":overlap_z,"min_overlap":min_overlap})
                item["pass"]=(-max_pen-1e-12<=vertical_gap<=max_gap+1e-12 and overlap_x>=min_overlap and overlap_z>=min_overlap
                              and surf<=max(max_gap,max_pen)+1e-12)
            elif typ=="extent":
                selected=_select_batches(batches,rule["selector"])
                if not selected: raise ValueError(f"selector matched nothing: {rule.get('selector')}")
                mn,mx=_bbox_of(selected); axis=_axis_index(rule.get("axis","y")); extent=float(mx[axis]-mn[axis])
                lo=float(rule.get("min",-math.inf)); hi=float(rule.get("max",math.inf))
                item.update({"selector":rule["selector"],"axis":axis,"extent":extent,"min":lo,"max":hi})
                item["pass"]=lo-1e-12<=extent<=hi+1e-12
            elif typ=="count":
                selected=_select_batches(batches,rule["selector"]); count=len(selected)
                lo=int(rule.get("min",rule.get("exact",0))); hi=int(rule.get("max",rule.get("exact",2**31-1)))
                item.update({"selector":rule["selector"],"count":count,"min":lo,"max":hi})
                item["pass"]=lo<=count<=hi
            elif typ=="watertight":
                selected=_select_batches(batches,rule["selector"])
                if not selected: raise ValueError(f"selector matched nothing: {rule.get('selector')}")
                details=[]; ok=True; min_volume=float(rule.get("min_volume",1e-12)); require_single=bool(rule.get("single_component",True)); require_winding=bool(rule.get("consistent_winding",False))
                for b in selected:
                    inc=_edge_incidence(b); boundary=sum(1 for c in inc.values() if c==1); nonmanifold=sum(1 for c in inc.values() if c>2)
                    orientation_conflicts=_edge_orientation_conflicts(b)
                    comps=_face_component_count(b); vol=abs(_signed_mesh_volume(b))
                    good=(boundary==0 and nonmanifold==0 and (not require_winding or orientation_conflicts==0) and vol>=min_volume and (not require_single or comps==1))
                    ok=ok and good
                    details.append({"tag":b.tag,"boundary_edges":boundary,"nonmanifold_edges":nonmanifold,
                                    "orientation_conflicts":orientation_conflicts,
                                    "face_components":comps,"absolute_signed_volume":vol,"pass":good})
                item.update({"selector":rule["selector"],"min_volume":min_volume,"single_component":require_single,"consistent_winding":require_winding,"components":details})
                item["pass"]=ok
            elif typ=="clearance":
                zones=_select_batches(batches,rule["clearance"]); obstacles=_select_batches(batches,rule["obstacles"])
                if not zones or not obstacles: raise ValueError(f"selector matched nothing: clearance={rule.get('clearance')} obstacles={rule.get('obstacles')}")
                max_pen=float(rule.get("max_penetration",0.0)); violations=[]; worst=0.0
                if max_pen > 0.0:
                    raise ValueError("clearance max_penetration > 0 is not exact for arbitrary triangle meshes; use 0 until an exact penetration-depth solver is available")
                for z in zones:
                    zb=_bbox_of([z])
                    for o in obstacles:
                        ob=_bbox_of([o])
                        aabb_gap,_=_aabb_gap(zb,ob)
                        if aabb_gap>1e-12: continue
                        if not _mesh_intersects_aabb([o],zb): continue
                        ov=_aabb_overlap(zb,ob)
                        positive=ov[ov>1e-12]
                        pen=float(np.min(positive)) if len(positive) else 0.0
                        worst=max(worst,pen)
                        blocked = (max_pen <= 0.0) or (pen > max_pen + 1e-12)
                        if blocked:
                            violations.append({"clearance_tag":z.tag,"obstacle_tag":o.tag,"overlap":ov.tolist(),"penetration":pen})
                item.update({"clearance":rule["clearance"],"obstacles":rule["obstacles"],"max_penetration":max_pen,
                             "worst_penetration":worst,"violations":violations})
                item["pass"]=not violations
            else:
                raise ValueError(f"unsupported geometry check type: {typ!r}")
        except Exception as exc:
            item["error"]=str(exc); item["pass"]=False
        results.append(item)
    passed=sum(1 for x in results if x.get("pass")); failed=len(results)-passed
    integrity=[x for x in results if x.get("type")=="mesh_integrity"]
    assertions=[x for x in results if x.get("type")!="mesh_integrity"]
    ip=sum(1 for x in integrity if x.get("pass")); ap=sum(1 for x in assertions if x.get("pass"))
    metadata=spec.get("source_metadata",{})
    capture_health=metadata.get("capture_health")
    authority_health=metadata.get("authority_health")
    capture_ok=True if capture_health is None else bool(capture_health.get("pass",False))
    authority_ok=True if authority_health is None else bool(authority_health.get("pass",False))
    source_kind=spec.get("source_kind","authored-structure")
    coverage_parts=["mesh-integrity"]
    if capture_health is not None: coverage_parts.append("capture-health")
    if authority_health is not None: coverage_parts.append("semantic-authority")
    if assertions: coverage_parts.append("physical-assertions")
    coverage="+".join(coverage_parts)
    external_failures=(0 if capture_ok else 1)+(0 if authority_ok else 1)
    return {
        "pass":failed==0 and capture_ok and authority_ok, "passed":passed, "failed":failed + external_failures, "checks":results,
        "mesh_integrity":{"pass":ip==len(integrity),"passed":ip,"failed":len(integrity)-ip,"count":len(integrity)},
        "physical_assertions":{"pass":ap==len(assertions),"passed":ap,"failed":len(assertions)-ap,"count":len(assertions)},
        "capture_health":capture_health, "authority_health":authority_health, "coverage":coverage,
    }


def _label_font(size=22):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_contact_sheet(rendered: dict, out_path: Path, title: str, geometry_summary=None, view_order=VIEW_ORDER):
    tile_w, tile_h = next(iter(rendered.values()))[0].size
    label_h, title_h = 42, 88
    view_order=_parse_views(view_order)
    sheet = Image.new("RGB", (tile_w*len(view_order), title_h + (tile_h+label_h)*3), "#ececec")
    draw = ImageDraw.Draw(sheet)
    font = _label_font(20); title_font = _label_font(26); legend_font = _label_font(14)
    draw.text((16,10), title, fill="black", font=title_font)
    status = ""
    if geometry_summary is not None:
        mi=geometry_summary.get("mesh_integrity",{})
        pa=geometry_summary.get("physical_assertions",{})
        h=geometry_summary.get("capture_health")
        ah=geometry_summary.get("authority_health")
        hs="" if h is None else f" | CAPTURE {'PASS' if h.get('pass') else 'FAIL'}"
        ahs="" if ah is None else f" | AUTHORITY {'PASS' if ah.get('pass') else 'FAIL'}"
        status=(f"   INTEGRITY {'PASS' if mi.get('pass') else 'FAIL'} {mi.get('passed',0)}/{mi.get('count',0)}"
                f" | ASSERTIONS {pa.get('passed',0)}/{pa.get('count',0)}{hs}{ahs}")
    draw.text((16,50), "DIFF: dark=shared   magenta=visual-only   cyan=collider-only" + status, fill="#333333", font=legend_font)
    rows = [("VISUAL",0),("COLLIDER",1),("DIFF",2)]
    for col, view in enumerate(view_order):
        for row, (rowname, idx) in enumerate(rows):
            y0 = title_h + row*(tile_h+label_h)
            img = rendered[view][idx].convert("RGB")
            sheet.paste(img, (col*tile_w, y0+label_h))
            draw.text((col*tile_w+10, y0+9), f"{view.upper()} / {rowname}", fill="black", font=font)
    sheet.save(out_path, compress_level=1)


def _read_spec_json(path: Path) -> dict:
    path=Path(path)
    if path.suffix.lower()=='.gz':
        with gzip.open(path,'rt',encoding='utf-8') as fh: return json.load(fh)
    return json.loads(path.read_text(encoding='utf-8'))


def _parse_views(value) -> tuple[str,...]:
    if value is None: return VIEW_ORDER
    if isinstance(value,(list,tuple)): items=[str(x).strip() for x in value]
    else: items=[x.strip() for x in str(value).split(',')]
    items=[x for x in items if x]
    if not items: raise ValueError('at least one view is required')
    for v in items: _camera_basis(v)
    return tuple(items)


def capture_jweb_snapshot(repo: Path, snapshot_path: Path, *, world_seed=671278205, chunk_x=16, chunk_z=0, include_props=True, visual_mode="exact"):
    script=Path(__file__).with_name('capture_jweb_scene.mjs')
    if not script.exists(): raise FileNotFoundError(f'missing JWEB capture adapter: {script}')
    repo=Path(repo).resolve(); snapshot_path=Path(snapshot_path).resolve(); snapshot_path.parent.mkdir(parents=True,exist_ok=True)
    cmd=['node',str(script),'--repo',str(repo),'--out',str(snapshot_path),'--seed',str(int(world_seed)),
         '--x',str(int(chunk_x)),'--z',str(int(chunk_z)),'--visual-mode',str(visual_mode)]
    if include_props: cmd.append('--include-props')
    cp=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if cp.returncode != 0:
        raise RuntimeError(f'JWEB capture failed ({cp.returncode})\nSTDOUT:\n{cp.stdout}\nSTDERR:\n{cp.stderr}')
    return {'snapshot':str(snapshot_path),'stdout':cp.stdout,'stderr':cp.stderr,'command':cmd}


def render_structure(spec_path: Path, out_dir: Path, width=512, height=512, supersample=1, view_order=VIEW_ORDER, sheet_name="contact-sheet.png"):
    spec = _read_spec_json(spec_path)
    batches = expand_structure(spec, spec_path.parent)
    out_dir.mkdir(parents=True, exist_ok=True)
    all_tris = _all_triangles(batches, ROLE_BOTH)
    rendered = {}
    report = {
        "schema": "jweb.geometry-harness.report.v6",
        "name": spec.get("name", spec_path.stem),
        "source": str(spec_path),
        "source_kind": spec.get("source_kind", "authored-structure"),
        "source_metadata": spec.get("source_metadata", {}),
        "triangle_count": int(sum(len(b.faces) for b in batches)),
        "batch_count": len(batches),
        "convex_batch_count": int(sum(1 for b in batches if b.convex)),
        "bounds": {
            "min": np.min(np.concatenate([b.vertices for b in batches if b.roles & ROLE_BOTH],axis=0),axis=0).tolist(),
            "max": np.max(np.concatenate([b.vertices for b in batches if b.roles & ROLE_BOTH],axis=0),axis=0).tolist(),
        },
        "diagnostic_only_batch_count": int(sum(1 for b in batches if not (b.roles & ROLE_BOTH))),
        "views": {},
    }
    geometry_checks = run_geometry_checks(spec, batches)
    report["geometry_checks"] = geometry_checks
    (out_dir/"geometry-checks.json").write_text(json.dumps(geometry_checks, indent=2)+"\n", encoding="utf-8")
    t0 = time.perf_counter()
    view_order=_parse_views(view_order)
    for view in view_order:
        frame = _frame_for_view(all_tris, view, width, height, 0.06)
        v = render_mask(batches, ROLE_VISUAL, view, width=width, height=height, supersample=supersample, frame=frame)
        c = render_mask(batches, ROLE_COLLIDER, view, width=width, height=height, supersample=supersample, frame=frame)
        vp = out_dir / f"{view}.visual.png"; cp = out_dir / f"{view}.collider.png"; op = out_dir / f"{view}.diff.png"
        _save_binary(v, vp); _save_binary(c, cp); _save_overlay(v,c,op)
        rendered[view] = (Image.open(vp), Image.open(cp), Image.open(op))
        report["views"][view] = _mask_metrics(v,c)
        report["views"][view]["frame_projected_bounds"] = {"min": frame[2].tolist(), "max": frame[3].tolist()}
    report["render_ms"] = (time.perf_counter()-t0)*1000
    make_contact_sheet(rendered, out_dir/sheet_name, spec.get("name", spec_path.stem), geometry_checks, view_order=view_order)
    (out_dir/"report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    return report


def benchmark(spec_path: Path, iterations=20, width=384, height=384, view_order=VIEW_ORDER):
    spec = _read_spec_json(spec_path)
    batches = expand_structure(spec, spec_path.parent)
    all_tris = _all_triangles(batches, ROLE_BOTH)
    view_order=_parse_views(view_order)
    frames = {v:_frame_for_view(all_tris,v,width,height,0.06) for v in view_order}
    samples=[]
    for _ in range(int(iterations)):
        t0=time.perf_counter()
        for view in view_order:
            render_mask(batches,ROLE_VISUAL,view,width=width,height=height,frame=frames[view])
            render_mask(batches,ROLE_COLLIDER,view,width=width,height=height,frame=frames[view])
        samples.append((time.perf_counter()-t0)*1000)
    return {"iterations":len(samples),"width":width,"height":height,
            "median_ms":float(np.median(samples)),"p95_ms":float(np.percentile(samples,95)),
            "min_ms":float(np.min(samples)),"max_ms":float(np.max(samples)),
            "triangle_count":int(sum(len(b.faces) for b in batches))}


def main(argv=None):
    argv=list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == 'city':
        ap=argparse.ArgumentParser(description='Capture a generated JWEB chunk and inspect it with the same geometry harness')
        ap.add_argument('city', nargs='?')
        ap.add_argument('--repo',type=Path,required=True,help='JWEB repository checkout')
        ap.add_argument('-o','--out',type=Path,default=Path('city-silhouette-output'))
        ap.add_argument('--seed',type=int,default=671278205)
        ap.add_argument('--chunk',default='16,0',help='chunk x,z')
        ap.add_argument('--size',type=int,default=384)
        ap.add_argument('--supersample',type=int,default=1)
        ap.add_argument('--views',default=','.join(VIEW_ORDER),help='comma-separated views; cardinal names are supported')
        ap.add_argument('--include-props',dest='include_props',action='store_true',default=True,help='capture prop colliders (default)')
        ap.add_argument('--visual-mode',choices=('exact','bounds'),default='exact',help='capture real THREE triangles (default) or legacy local AABB boxes')
        ap.add_argument('--exclude-props',dest='include_props',action='store_false',help='omit prop colliders for a lighter structural-only city snapshot')
        ap.add_argument('--strict-geometry',action='store_true')
        ns=ap.parse_args(argv)
        try: cx,cz=(int(x.strip()) for x in ns.chunk.split(',',1))
        except Exception as exc: raise SystemExit(f'--chunk must be x,z: {ns.chunk!r}') from exc
        ns.out.mkdir(parents=True,exist_ok=True)
        snapshot=ns.out/'jweb-scene-snapshot.json'
        cap=capture_jweb_snapshot(ns.repo,snapshot,world_seed=ns.seed,chunk_x=cx,chunk_z=cz,include_props=ns.include_props,visual_mode=ns.visual_mode)
        views=_parse_views(ns.views)
        report=render_structure(snapshot,ns.out,width=ns.size,height=ns.size,supersample=ns.supersample,view_order=views)
        summary={'output':str(ns.out),'snapshot':str(snapshot),'render_ms':round(report['render_ms'],2),
                 'triangles':report['triangle_count'],'batches':report['batch_count'],'source_metadata':report.get('source_metadata',{}),
                 'geometry_pass':report['geometry_checks']['pass'],'geometry_coverage':report['geometry_checks'].get('coverage'),
                 'mesh_integrity':report['geometry_checks'].get('mesh_integrity'),
                 'physical_assertions':report['geometry_checks'].get('physical_assertions'),
                 'capture_health':report['geometry_checks'].get('capture_health'),
                 'authority_health':report['geometry_checks'].get('authority_health')}
        print(json.dumps(summary,indent=2))
        if ns.strict_geometry and not report['geometry_checks']['pass']: raise SystemExit(2)
        return

    ap = argparse.ArgumentParser(description="JWEB unified geometry + visual/collider silhouette harness")
    ap.add_argument("spec", type=Path, help="structure/snapshot JSON")
    ap.add_argument("-o","--out", type=Path, default=Path("silhouette-output"))
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--supersample", type=int, default=1)
    ap.add_argument("--views", default=','.join(VIEW_ORDER), help="comma-separated views: front,side,top,isometric or north,east,south,west")
    ap.add_argument("--benchmark", type=int, metavar="N", default=0)
    ap.add_argument("--strict-geometry", action="store_true", help="exit nonzero when any physical geometry check fails")
    ns=ap.parse_args(argv)
    views=_parse_views(ns.views)
    report=render_structure(ns.spec,ns.out,width=ns.size,height=ns.size,supersample=ns.supersample,view_order=views)
    print(json.dumps({"output":str(ns.out),"render_ms":round(report["render_ms"],2),"triangles":report["triangle_count"],
                      "geometry_pass":report["geometry_checks"]["pass"],"geometry_failed":report["geometry_checks"]["failed"]},indent=2))
    if ns.benchmark:
        bench=benchmark(ns.spec,ns.benchmark,width=min(ns.size,384),height=min(ns.size,384),view_order=views)
        (ns.out/"benchmark.json").write_text(json.dumps(bench,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(bench,indent=2))
    if ns.strict_geometry and not report["geometry_checks"]["pass"]:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
