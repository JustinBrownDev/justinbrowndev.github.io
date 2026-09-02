export const GUARDRAIL_AUTHORITY_SCHEMA = 'jweb.guardrail-authority.v1';
const EPS = 1e-7;

const PROFILES = Object.freeze({
  'fire-escape-pipe': Object.freeze({
    family: 'fire-escape-pipe',
    construction: 'open-bar',
    material: 'metal',
    height: 0.82,
    memberThickness: 0.035,
    midRailHeight: 0.45,
    postSpacing: 1.28,
    collisionThickness: 0.075,
  }),
  'residential-civic-bar': Object.freeze({
    family: 'residential-civic-bar',
    construction: 'open-bar',
    material: 'metal',
    height: 0.96,
    memberThickness: 0.058,
    midRailHeight: 0.53,
    postSpacing: 0.90,
    collisionThickness: 0.10,
  }),
  'municipal-concrete': Object.freeze({
    family: 'municipal-concrete',
    construction: 'solid-mold',
    material: 'concrete',
    height: 1.02,
    bodyThickness: 0.20,
    capThickness: 0.24,
    capHeight: 0.08,
    collisionThickness: 0.20,
  }),
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function positive(value, fallback) {
  const n = finite(value, fallback);
  return n > 0 ? n : fallback;
}
function point(axis, along, fixed, y) {
  return axis === 'x' ? { x: along, y, z: fixed } : { x: fixed, y, z: along };
}
function axisOf(x1, z1, x2, z2) {
  if (Math.abs(z1 - z2) <= EPS && Math.abs(x1 - x2) > EPS) return 'x';
  if (Math.abs(x1 - x2) <= EPS && Math.abs(z1 - z2) > EPS) return 'z';
  return null;
}
function verticalBox({ x, z, y0, height, thickness, role, material }) {
  return Object.freeze({
    x, y: y0 + height * 0.5, z,
    sx: thickness, sy: height, sz: thickness,
    rx: 0, ry: 0, rz: 0, role, material,
  });
}

// Unit-box primitive whose long axis follows an axis-aligned horizontal run with
// optional vertical slope. This is enough for every active JWEB stair flight.
function segmentBox3D({ p0, p1, crossY, crossNormal, role, material }) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const x = (p0.x + p1.x) * 0.5;
  const y = (p0.y + p1.y) * 0.5;
  const z = (p0.z + p1.z) * 0.5;
  if (Math.abs(dz) <= EPS && Math.abs(dx) > EPS) {
    return Object.freeze({
      x, y, z,
      sx: Math.hypot(dx, dy), sy: crossY, sz: crossNormal,
      rx: 0, ry: 0, rz: Math.atan2(dy, dx), role, material,
    });
  }
  if (Math.abs(dx) <= EPS && Math.abs(dz) > EPS) {
    return Object.freeze({
      x, y, z,
      sx: crossNormal, sy: crossY, sz: Math.hypot(dz, dy),
      rx: -Math.atan2(dy, dz), ry: 0, rz: 0, role, material,
    });
  }
  throw new Error('guardrail segment must run on x or z axis');
}

function openBarVisuals({ axis, from, to, fixedCoord, y0, y1, profile }) {
  const visuals = [];
  const member = profile.memberThickness;
  const top0 = point(axis, from, fixedCoord, y0 + profile.height);
  const top1 = point(axis, to, fixedCoord, y1 + profile.height);
  const mid0 = point(axis, from, fixedCoord, y0 + profile.midRailHeight);
  const mid1 = point(axis, to, fixedCoord, y1 + profile.midRailHeight);
  visuals.push(
    segmentBox3D({ p0: top0, p1: top1, crossY: member, crossNormal: member, role: 'top-rail', material: profile.material }),
    segmentBox3D({ p0: mid0, p1: mid1, crossY: member, crossNormal: member, role: 'mid-rail', material: profile.material }),
  );
  const run = Math.abs(to - from);
  const sections = Math.max(1, Math.ceil(run / profile.postSpacing));
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const along = from + (to - from) * t;
    const baseY = y0 + (y1 - y0) * t;
    const p = point(axis, along, fixedCoord, baseY);
    visuals.push(verticalBox({
      x: p.x, z: p.z, y0: baseY,
      height: profile.height, thickness: member,
      role: 'post', material: profile.material,
    }));
  }
  return visuals;
}

function solidMoldVisuals({ axis, from, to, fixedCoord, y0, y1, profile }) {
  const center0 = point(axis, from, fixedCoord, y0 + profile.height * 0.5);
  const center1 = point(axis, to, fixedCoord, y1 + profile.height * 0.5);
  const cap0 = point(axis, from, fixedCoord, y0 + profile.height + profile.capHeight * 0.5);
  const cap1 = point(axis, to, fixedCoord, y1 + profile.height + profile.capHeight * 0.5);
  return [
    segmentBox3D({
      p0: center0, p1: center1,
      crossY: profile.height, crossNormal: profile.bodyThickness,
      role: 'concrete-body', material: profile.material,
    }),
    segmentBox3D({
      p0: cap0, p1: cap1,
      crossY: profile.capHeight, crossNormal: profile.capThickness,
      role: 'concrete-cap', material: profile.material,
    }),
  ];
}

export function guardProfile(family = 'residential-civic-bar') {
  const profile = PROFILES[family];
  if (!profile) throw new Error(`unknown guardrail family: ${family}`);
  return profile;
}

export function guardFamilyForContext({ supportKind = '', visualRole = '', physicalUse = '', kind = '' } = {}) {
  const text = `${supportKind}|${visualRole}|${kind}`.toLowerCase();
  const use = String(physicalUse ?? '').toLowerCase();
  if (text.includes('scaffold') || text.includes('fire-escape')) return 'fire-escape-pipe';
  if (text.includes('parapet') || text.includes('municipal-concrete') || text.includes('concrete-barrier')) return 'municipal-concrete';
  if (['industrial-service', 'storage', 'maintenance-utility'].includes(use)
      && (text.includes('stair') || text.includes('catwalk') || text.includes('transport') || text.includes('mezzanine'))) {
    return 'fire-escape-pipe';
  }
  return 'residential-civic-bar';
}

export function guardOpeningWidth(requested, { playerRadius, margin = 0.18, minimum = 0.72 } = {}) {
  const radius = positive(playerRadius, 0.22);
  return Math.max(positive(requested, 0), minimum, radius * 2 + positive(margin, 0.18));
}

export function planHorizontalGuardSpan({ id, x1, z1, x2, z2, y, family = 'residential-civic-bar' } = {}) {
  if (!id) throw new Error('horizontal guard span requires id');
  const values = [x1, z1, x2, z2, y].map(Number);
  if (!values.every(Number.isFinite)) throw new Error(`${id}: horizontal guard span coordinates must be finite`);
  const axis = axisOf(values[0], values[1], values[2], values[3]);
  if (!axis) throw new Error(`${id}: horizontal guard span must be axis aligned`);
  const profile = guardProfile(family);
  const from = axis === 'x' ? values[0] : values[1];
  const to = axis === 'x' ? values[2] : values[3];
  const fixedCoord = axis === 'x' ? values[1] : values[0];
  const run = Math.abs(to - from);
  if (!(run > EPS)) throw new Error(`${id}: horizontal guard span must have positive length`);
  const visual = profile.construction === 'solid-mold'
    ? solidMoldVisuals({ axis, from, to, fixedCoord, y0: values[4], y1: values[4], profile })
    : openBarVisuals({ axis, from, to, fixedCoord, y0: values[4], y1: values[4], profile });
  return Object.freeze({
    schema: GUARDRAIL_AUTHORITY_SCHEMA,
    id, family: profile.family, construction: profile.construction,
    axis, from, to, fixedCoord, y0: values[4], y1: values[4], run,
    profile,
    collision: Object.freeze({
      x1: values[0], z1: values[1], x2: values[2], z2: values[3],
      yMin: values[4], yMax: values[4] + profile.height,
      thickness: profile.collisionThickness,
    }),
    visual: Object.freeze(visual),
  });
}

export function planFlightGuardPair({
  id, axis, from, to, fixedCoord, halfWidth, y0, y1,
  family = 'residential-civic-bar',
} = {}) {
  if (!id) throw new Error('flight guard pair requires id');
  if (!['x', 'z'].includes(axis)) throw new Error(`${id}: flight guard axis must be x or z`);
  const nums = [from, to, fixedCoord, halfWidth, y0, y1].map(Number);
  if (!nums.every(Number.isFinite) || !(nums[3] > 0) || Math.abs(nums[1] - nums[0]) <= EPS) {
    throw new Error(`${id}: invalid flight guard geometry`);
  }
  const profile = guardProfile(family);
  const sides = [-1, 1].map(side => {
    const sideFixed = nums[2] + side * nums[3];
    const xz0 = point(axis, nums[0], sideFixed, nums[4]);
    const xz1 = point(axis, nums[1], sideFixed, nums[5]);
    const visual = profile.construction === 'solid-mold'
      ? solidMoldVisuals({ axis, from: nums[0], to: nums[1], fixedCoord: sideFixed, y0: nums[4], y1: nums[5], profile })
      : openBarVisuals({ axis, from: nums[0], to: nums[1], fixedCoord: sideFixed, y0: nums[4], y1: nums[5], profile });
    return Object.freeze({
      schema: GUARDRAIL_AUTHORITY_SCHEMA,
      id: `${id}:side:${side < 0 ? 'left' : 'right'}`,
      family: profile.family, construction: profile.construction,
      role: 'flight-side', side,
      axis, from: nums[0], to: nums[1], fixedCoord: sideFixed,
      y0: nums[4], y1: nums[5], run: Math.abs(nums[1] - nums[0]), profile,
      collision: Object.freeze({
        x1: xz0.x, z1: xz0.z, x2: xz1.x, z2: xz1.z,
        yMin: Math.min(nums[4], nums[5]),
        yMax: Math.max(nums[4], nums[5]) + profile.height,
        thickness: profile.collisionThickness,
      }),
      visual: Object.freeze(visual),
    });
  });
  return Object.freeze(sides);
}

export function splitHorizontalGuardSpan({ span, point: cutPoint, width } = {}) {
  if (!span || span.schema !== GUARDRAIL_AUTHORITY_SCHEMA || span.role === 'flight-side') {
    throw new Error('splitHorizontalGuardSpan requires a horizontal guard plan');
  }
  const axis = span.axis;
  const at = axis === 'x' ? Number(cutPoint?.x) : Number(cutPoint?.z);
  const fixed = axis === 'x' ? Number(cutPoint?.z) : Number(cutPoint?.x);
  if (!Number.isFinite(at) || !Number.isFinite(fixed)) throw new Error(`${span.id}: guard cut point must be finite`);
  if (Math.abs(fixed - span.fixedCoord) > Math.max(0.20, Number(width) * 0.30)) return [span];
  const lo = Math.min(span.from, span.to);
  const hi = Math.max(span.from, span.to);
  const half = Math.max(0, Number(width) * 0.5);
  const gap0 = Math.max(lo, at - half);
  const gap1 = Math.min(hi, at + half);
  if (!(gap1 > gap0 + 0.04)) return [span];
  const direction = Math.sign(span.to - span.from) || 1;
  const raw = direction > 0 ? [[lo, gap0], [gap1, hi]] : [[hi, gap1], [gap0, lo]];
  return raw
    .filter(([a, b]) => Math.abs(b - a) > 0.05)
    .map(([a, b], index) => planHorizontalGuardSpan({
      id: `${span.id}:cut:${index}`,
      x1: axis === 'x' ? a : span.fixedCoord,
      z1: axis === 'x' ? span.fixedCoord : a,
      x2: axis === 'x' ? b : span.fixedCoord,
      z2: axis === 'x' ? span.fixedCoord : b,
      y: span.y0,
      family: span.family,
    }));
}
