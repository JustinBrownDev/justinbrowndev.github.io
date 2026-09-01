// Cheap Canvas2D renderer for jweb display recipes.
// Fixed-count primitive drawing only: rectangles, rules, text, arcs, stripes.

import { hashDisplaySeed, rngForDisplaySeed } from '../content/sign-visual-language.js';

export const DISPLAY_RENDER_SCHEMA = 'jweb.display-render.v1';

export function renderDisplayCanvas(ctx, width, height, {
  recipe,
  title = 'PUBLIC SIGNAL',
  subtitle = 'INDEX TRANSMISSION',
  family = 'JWEB',
  value = null,
  serial = null,
  segment = null,
} = {}) {
  if (!ctx || !recipe) return null;
  const viewport = makeViewport(width, height, segment);
  const rng = rngForDisplaySeed(hashDisplaySeed(`${recipe.seed}:${title}:${subtitle}:render`));
  const content = normalizeContent(recipe, { title, subtitle, family, value, serial });

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  drawBackground(ctx, viewport, recipe, rng);
  drawMotif(ctx, viewport, recipe, rng);
  drawLayout(ctx, viewport, recipe, content, rng);
  drawBorder(ctx, viewport, recipe);
  ctx.restore();

  return {
    schema: DISPLAY_RENDER_SCHEMA,
    recipeId: recipe.id,
    segment: viewport.segment,
    dialect: recipe.dialect,
    layout: recipe.layout,
  };
}

export function renderSemanticMediaCanvas(ctx, width, height, placement, overrides = {}) {
  const media = placement?.media ?? overrides.media ?? {};
  const recipe = overrides.recipe;
  if (!recipe) throw new Error('renderSemanticMediaCanvas requires a resolved recipe');
  return renderDisplayCanvas(ctx, width, height, {
    recipe,
    title: overrides.title ?? media.title,
    subtitle: overrides.subtitle ?? media.subtitle,
    family: overrides.family ?? media.family,
    value: overrides.value ?? media.value?.label,
    serial: overrides.serial ?? media.id,
    segment: overrides.segment ?? placement?.mediaSegment ?? null,
  });
}

function drawBackground(ctx, v, r, rng) {
  fill(ctx, r.palette.background, v.X(0), v.Y(0), v.W(1), v.H(1));
  if (r.inversePanel) {
    const side = r.alignment === 'right' ? 0 : r.alignment === 'center' ? .68 : .58;
    const x = r.alignment === 'right' ? .48 : r.alignment === 'center' ? .16 : 0;
    fill(ctx, r.palette.foreground, v.X(x), v.Y(.08), v.W(side), v.H(.84));
  }
  if (r.density === 'dense') {
    ctx.globalAlpha = .09;
    ctx.strokeStyle = r.palette.secondary;
    ctx.lineWidth = Math.max(1, v.S(.0015));
    for (let i = 1; i < 8; i++) line(ctx, v.X(i / 8), v.Y(0), v.X(i / 8), v.Y(1));
    for (let i = 1; i < 5; i++) line(ctx, v.X(0), v.Y(i / 5), v.X(1), v.Y(i / 5));
    ctx.globalAlpha = 1;
  }
  // One deterministic accent slab is much cheaper than imagery but changes silhouette strongly.
  if (rng() < .62) fill(ctx, r.palette.accent, v.X(.0), v.Y(rng() < .5 ? 0 : .92), v.W(1), v.H(.08));
}

function drawMotif(ctx, v, r, rng) {
  const fg = r.inversePanel ? r.palette.background : r.palette.foreground;
  const accent = r.palette.accent;
  ctx.save();
  switch (r.motif) {
    case 'hazard-stripe':
      ctx.globalAlpha = .82;
      ctx.strokeStyle = fg;
      ctx.lineWidth = Math.max(2, v.S(.014));
      for (let i = -2; i < r.stripeCount + 2; i++) line(ctx, v.X(.02 + i * .06), v.Y(.02), v.X(.08 + i * .06), v.Y(.12));
      break;
    case 'packet-grid':
    case 'instrument-grid':
    case 'scan-lines':
      ctx.globalAlpha = .34;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, v.S(.002));
      for (let i = 0; i < r.ruleCount + 2; i++) {
        const y = .14 + i * .13;
        line(ctx, v.X(.05), v.Y(y), v.X(.18 + rng() * .18), v.Y(y));
      }
      break;
    case 'route-band':
      fill(ctx, accent, v.X(.055), v.Y(.08), v.W(.055), v.H(.84));
      for (let i = 0; i < 5; i++) circle(ctx, r.palette.background, v.X(.0825), v.Y(.17 + i * .15), v.S(.012));
      break;
    case 'price-burst':
      circle(ctx, accent, v.X(.84), v.Y(.22), v.S(.09));
      break;
    case 'seal-grid':
      circleStroke(ctx, accent, v.X(.88), v.Y(.18), v.S(.055), Math.max(2, v.S(.006)));
      circleStroke(ctx, accent, v.X(.88), v.Y(.18), v.S(.034), Math.max(1, v.S(.003)));
      break;
    case 'broadcast-bars':
      fill(ctx, accent, v.X(.74), v.Y(.09), v.W(.20), v.H(.035));
      fill(ctx, r.palette.secondary, v.X(.81), v.Y(.14), v.W(.13), v.H(.018));
      break;
    case 'tape-marks':
      ctx.save();
      ctx.globalAlpha = .48;
      fill(ctx, r.palette.secondary, v.X(.03), v.Y(.04), v.W(.12), v.H(.045));
      fill(ctx, r.palette.secondary, v.X(.82), v.Y(.90), v.W(.13), v.H(.045));
      ctx.restore();
      break;
    case 'archive-stamp':
      ctx.save();
      ctx.translate(v.X(.85), v.Y(.18));
      ctx.rotate(-.12);
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, v.S(.004));
      ctx.strokeRect(-v.W(.09), -v.H(.04), v.W(.18), v.H(.08));
      ctx.restore();
      break;
    case 'fine-rule':
    case 'editorial-rule':
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, v.S(.003));
      line(ctx, v.X(.07), v.Y(.18), v.X(.93), v.Y(.18));
      break;
  }
  ctx.restore();
}

function drawLayout(ctx, v, r, c, rng) {
  switch (r.layout) {
    case 'hero-word': return heroWord(ctx, v, r, c, rng);
    case 'hero-number': return heroNumber(ctx, v, r, c, rng);
    case 'split-rail': return splitRail(ctx, v, r, c, rng);
    case 'stacked-index': return stackedIndex(ctx, v, r, c, rng);
    case 'terminal-grid': return terminalGrid(ctx, v, r, c, rng);
    case 'boxed-notice': return boxedNotice(ctx, v, r, c, rng);
    case 'poster-editorial': return posterEditorial(ctx, v, r, c, rng);
    case 'warning-field': return warningField(ctx, v, r, c, rng);
    case 'broadcast-ticker': return broadcastTicker(ctx, v, r, c, rng);
    case 'ledger-cells': return ledgerCells(ctx, v, r, c, rng);
    case 'quiet-mark': return quietMark(ctx, v, r, c, rng);
    case 'vertical-code': return verticalCode(ctx, v, r, c, rng);
    default: return heroWord(ctx, v, r, c, rng);
  }
}

function heroWord(ctx, v, r, c) {
  const color = mainTextColor(r);
  text(ctx, v, c.title, .055, .59, .118, r.fonts.primary, '900', color, r.alignment, .88);
  text(ctx, v, c.subtitle, .06, .73, .032, r.fonts.secondary, '600', color, 'left', .68);
  microHeader(ctx, v, r, c);
  if (c.value && r.showValue) text(ctx, v, c.value, .76, .82, .055, r.fonts.secondary, '800', r.palette.accent, 'right', .18);
}

function heroNumber(ctx, v, r, c) {
  const color = mainTextColor(r);
  const number = c.value || shortCode(c.serial);
  text(ctx, v, number, .06, .64, .22, r.fonts.primary, '900', color, 'left', .56);
  text(ctx, v, c.title, .63, .40, .055, r.fonts.primary, '800', color, 'left', .30);
  text(ctx, v, c.subtitle, .63, .53, .026, r.fonts.secondary, '500', color, 'left', .30);
  microHeader(ctx, v, r, c);
}

function splitRail(ctx, v, r, c) {
  const color = mainTextColor(r);
  fill(ctx, r.palette.accent, v.X(.04), v.Y(.10), v.W(.018), v.H(.80));
  text(ctx, v, c.family, .085, .18, .025, r.fonts.secondary, '700', color, 'left', .28);
  text(ctx, v, c.title, .085, .54, .082, r.fonts.primary, '850', color, 'left', .76);
  text(ctx, v, c.subtitle, .085, .70, .030, r.fonts.secondary, '500', color, 'left', .70);
  if (r.showSerial) verticalLabel(ctx, v, c.serial, .965, .52, .018, r.fonts.secondary, color);
}

function stackedIndex(ctx, v, r, c) {
  const color = mainTextColor(r);
  microHeader(ctx, v, r, c);
  text(ctx, v, c.title, .06, .38, .065, r.fonts.primary, '800', color, 'left', .82);
  lineStyled(ctx, v, r.palette.accent, .06, .48, .94, .48, .006);
  text(ctx, v, c.subtitle, .06, .60, .034, r.fonts.secondary, '500', color, 'left', .82);
  const rows = ['SOURCE / PUBLIC', `FAMILY / ${c.family}`, `INDEX / ${shortCode(c.serial)}`];
  rows.forEach((row, i) => text(ctx, v, row, .06, .72 + i * .065, .018, r.fonts.secondary, '600', color, 'left', .64));
}

function terminalGrid(ctx, v, r, c) {
  const color = mainTextColor(r);
  text(ctx, v, `> ${c.title}`, .055, .30, .046, r.fonts.secondary, '700', color, 'left', .82);
  text(ctx, v, `  ${c.subtitle}`, .055, .42, .026, r.fonts.secondary, '500', color, 'left', .82);
  text(ctx, v, `_`, .055, .54, .030, r.fonts.secondary, '700', r.palette.accent, 'left', .10);
  const rows = [`FAMILY=${c.family}`, `SERIAL=${shortCode(c.serial)}`, `MODE=${r.dialect.toUpperCase()}`];
  rows.forEach((row, i) => text(ctx, v, row, .055, .72 + i * .065, .016, r.fonts.secondary, '500', color, 'left', .60));
}

function boxedNotice(ctx, v, r, c) {
  const color = mainTextColor(r);
  strokeRect(ctx, r.palette.accent, v.X(.055), v.Y(.12), v.W(.89), v.H(.70), Math.max(1, v.S(.006)));
  fill(ctx, r.palette.accent, v.X(.055), v.Y(.12), v.W(.89), v.H(.11));
  text(ctx, v, c.family, .075, .193, .027, r.fonts.secondary, '800', r.palette.background, 'left', .70);
  text(ctx, v, c.title, .075, .43, .068, r.fonts.primary, '850', color, 'left', .80);
  text(ctx, v, c.subtitle, .075, .59, .030, r.fonts.secondary, '500', color, 'left', .76);
  text(ctx, v, shortCode(c.serial), .075, .75, .019, r.fonts.secondary, '600', color, 'left', .35);
}

function posterEditorial(ctx, v, r, c) {
  const color = mainTextColor(r);
  text(ctx, v, c.family, .06, .12, .018, r.fonts.secondary, '700', r.palette.accent, 'left', .55);
  text(ctx, v, c.title, .06, .36, .072, r.fonts.primary, '700', color, 'left', .84);
  lineStyled(ctx, v, r.palette.accent, .06, .47, .45, .47, .004);
  wrapText(ctx, v, c.subtitle, .06, .57, .026, r.fonts.primary, '400', color, .72, 3);
  text(ctx, v, shortCode(c.serial), .74, .90, .016, r.fonts.secondary, '600', color, 'right', .20);
}

function warningField(ctx, v, r, c) {
  const color = mainTextColor(r);
  fill(ctx, r.palette.accent, v.X(.05), v.Y(.15), v.W(.90), v.H(.18));
  text(ctx, v, c.family, .075, .275, .048, r.fonts.primary, '900', r.palette.background, 'left', .72);
  text(ctx, v, c.title, .075, .52, .082, r.fonts.primary, '900', color, 'left', .80);
  text(ctx, v, c.subtitle, .075, .68, .026, r.fonts.secondary, '700', color, 'left', .72);
  text(ctx, v, shortCode(c.serial), .075, .84, .020, r.fonts.secondary, '700', color, 'left', .32);
}

function broadcastTicker(ctx, v, r, c) {
  const color = mainTextColor(r);
  text(ctx, v, c.title, .05, .48, .095, r.fonts.primary, '900', color, 'center', .90);
  fill(ctx, r.palette.accent, v.X(0), v.Y(.78), v.W(1), v.H(.14));
  text(ctx, v, `${c.family}  /  ${c.subtitle}  /  ${c.value || shortCode(c.serial)}`, .04, .87, .027, r.fonts.secondary, '700', r.palette.background, 'left', .92);
  microHeader(ctx, v, r, c);
}

function ledgerCells(ctx, v, r, c) {
  const color = mainTextColor(r);
  microHeader(ctx, v, r, c);
  const cells = [
    ['TITLE', c.title], ['FAMILY', c.family],
    ['STATE', c.subtitle], ['VALUE', c.value || shortCode(c.serial)],
  ];
  cells.forEach(([label, val], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = .06 + col * .45, y = .27 + row * .31;
    strokeRect(ctx, r.palette.secondary, v.X(x), v.Y(y), v.W(.40), v.H(.24), Math.max(1, v.S(.002)));
    text(ctx, v, label, x + .02, y + .06, .014, r.fonts.secondary, '700', r.palette.accent, 'left', .30);
    text(ctx, v, val, x + .02, y + .16, .027, r.fonts.primary, '700', color, 'left', .34);
  });
}

function quietMark(ctx, v, r, c) {
  const color = mainTextColor(r);
  proceduralMark(ctx, v, r, .12, .24, .055);
  text(ctx, v, c.title, .12, .57, .066, r.fonts.primary, '600', color, r.alignment, .76);
  text(ctx, v, c.subtitle, .12, .69, .021, r.fonts.secondary, '400', color, r.alignment, .64);
  text(ctx, v, c.family, .12, .83, .014, r.fonts.secondary, '700', r.palette.accent, r.alignment, .38);
}

function verticalCode(ctx, v, r, c) {
  const color = mainTextColor(r);
  fill(ctx, r.palette.accent, v.X(.04), v.Y(.06), v.W(.10), v.H(.88));
  verticalLabel(ctx, v, c.family, .09, .50, .027, r.fonts.secondary, r.palette.background);
  text(ctx, v, c.title, .20, .43, .072, r.fonts.primary, '800', color, 'left', .72);
  text(ctx, v, c.subtitle, .20, .57, .027, r.fonts.secondary, '500', color, 'left', .70);
  text(ctx, v, shortCode(c.serial), .20, .76, .018, r.fonts.secondary, '600', color, 'left', .36);
}

function microHeader(ctx, v, r, c) {
  const color = mainTextColor(r);
  text(ctx, v, c.family, .055, .105, .015, r.fonts.secondary, '700', r.palette.accent, 'left', .32);
  if (r.showSerial) text(ctx, v, shortCode(c.serial), .945, .105, .014, r.fonts.secondary, '600', color, 'right', .26);
}

function proceduralMark(ctx, v, r, x, y, s) {
  circleStroke(ctx, r.palette.accent, v.X(x), v.Y(y), v.S(s), Math.max(1, v.S(.006)));
  const variant = r.markVariant % 4;
  if (variant === 0) lineStyled(ctx, v, r.palette.accent, x - s, y, x + s, y, .004);
  if (variant === 1) lineStyled(ctx, v, r.palette.accent, x, y - s, x, y + s, .004);
  if (variant === 2) fill(ctx, r.palette.accent, v.X(x - s*.18), v.Y(y - s*.75), v.W(s*.36), v.H(s*1.5));
  if (variant === 3) circle(ctx, r.palette.accent, v.X(x), v.Y(y), v.S(s*.24));
}

function drawBorder(ctx, v, r) {
  if (!r.border || r.border.style === 'none') return;
  const inset = r.border.inset;
  const width = Math.max(1, v.S(r.border.width));
  ctx.strokeStyle = r.palette.accent;
  ctx.lineWidth = width;
  if (r.border.style === 'cut') {
    const c = .04;
    ctx.beginPath();
    ctx.moveTo(v.X(inset + c), v.Y(inset));
    ctx.lineTo(v.X(1 - inset - c), v.Y(inset));
    ctx.lineTo(v.X(1 - inset), v.Y(inset + c));
    ctx.lineTo(v.X(1 - inset), v.Y(1 - inset - c));
    ctx.lineTo(v.X(1 - inset - c), v.Y(1 - inset));
    ctx.lineTo(v.X(inset + c), v.Y(1 - inset));
    ctx.lineTo(v.X(inset), v.Y(1 - inset - c));
    ctx.lineTo(v.X(inset), v.Y(inset + c));
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.strokeRect(v.X(inset), v.Y(inset), v.W(1 - inset*2), v.H(1 - inset*2));
    if (r.border.style === 'double') {
      const d = inset + .018;
      ctx.lineWidth = Math.max(1, width * .45);
      ctx.strokeRect(v.X(d), v.Y(d), v.W(1 - d*2), v.H(1 - d*2));
    }
  }
}

function makeViewport(width, height, segment) {
  const u0 = clamp01(Number(segment?.u0 ?? 0));
  const u1 = clamp01(Number(segment?.u1 ?? 1));
  const safeU1 = u1 > u0 ? u1 : 1;
  const span = Math.max(.0001, safeU1 - u0);
  return {
    segment: { u0, u1: safeU1, index: segment?.index ?? 0, count: segment?.count ?? 1 },
    X(u) { return ((u - u0) / span) * width; },
    Y(v) { return v * height; },
    W(du) { return (du / span) * width; },
    H(dv) { return dv * height; },
    S(ds) { return (ds / span) * width; },
  };
}

function normalizeContent(recipe, input) {
  const casing = recipe.casing;
  const transform = value => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (casing === 'upper') return text.toUpperCase();
    if (casing === 'lower') return text.toLowerCase();
    return text;
  };
  const serial = String(input.serial ?? `${recipe.id}:${recipe.seed.toString(16)}`);
  return {
    title: transform(input.title || 'PUBLIC SIGNAL'),
    subtitle: transform(input.subtitle || 'INDEX TRANSMISSION'),
    family: transform(input.family || recipe.dialect),
    value: input.value == null ? null : transform(typeof input.value === 'object' ? input.value.label : input.value),
    serial,
  };
}

function mainTextColor(r) {
  return r.inversePanel ? r.palette.background : r.palette.foreground;
}

function shortCode(value) {
  const h = hashDisplaySeed(value ?? 'jweb').toString(16).padStart(8, '0').toUpperCase();
  return `${h.slice(0,4)}-${h.slice(4,8)}`;
}

function text(ctx, v, value, x, y, size, font, weight, color, align = 'left', maxWidthNorm = .8) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  let px = Math.max(6, v.S(size));
  const maxWidth = Math.max(8, v.W(maxWidthNorm));
  const str = String(value ?? '');
  for (let i = 0; i < 7; i++) {
    ctx.font = `${weight} ${px}px ${font}`;
    if (!ctx.measureText || ctx.measureText(str).width <= maxWidth) break;
    px *= .84;
  }
  ctx.fillText(str, v.X(x), v.Y(y), maxWidth);
  ctx.restore();
}

function wrapText(ctx, v, value, x, y, size, font, weight, color, maxWidthNorm, maxLines) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let lineText = '';
  const px = Math.max(6, v.S(size));
  const maxWidth = v.W(maxWidthNorm);
  ctx.save();
  ctx.font = `${weight} ${px}px ${font}`;
  for (const word of words) {
    const test = lineText ? `${lineText} ${word}` : word;
    if (lineText && ctx.measureText(test).width > maxWidth) {
      lines.push(lineText); lineText = word;
      if (lines.length >= maxLines - 1) break;
    } else lineText = test;
  }
  if (lineText && lines.length < maxLines) lines.push(lineText);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((lineValue, i) => ctx.fillText(lineValue, v.X(x), v.Y(y + i * size * 1.45), maxWidth));
  ctx.restore();
}

function verticalLabel(ctx, v, value, x, y, size, font, color) {
  ctx.save();
  ctx.translate(v.X(x), v.Y(y));
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(6, v.S(size))}px ${font}`;
  ctx.fillText(String(value ?? ''), 0, 0, v.H(.72));
  ctx.restore();
}

function fill(ctx, color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function strokeRect(ctx, color, x, y, w, h, lineWidth) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.strokeRect(x, y, w, h); }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function lineStyled(ctx, v, color, x1, y1, x2, y2, width) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, v.S(width)); line(ctx, v.X(x1), v.Y(y1), v.X(x2), v.Y(y2)); ctx.restore(); }
function circle(ctx, color, x, y, radius) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
function circleStroke(ctx, color, x, y, radius, lineWidth) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
