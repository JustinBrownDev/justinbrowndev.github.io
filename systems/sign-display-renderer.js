// Creation-time Canvas2D renderer for deterministic JWEB display recipes.
// No timers, RAF, animation loops, THREE, or runtime texture churn.

import { hashDisplaySeed } from '../content/sign-visual-language.js';

export const DISPLAY_RENDER_SCHEMA = 'jweb.display-render.v2';

export function renderDisplayCanvas(ctx, width, height, {
    recipe,
    title = 'PUBLIC SIGNAL',
    subtitle = 'INDEX TRANSMISSION',
    family = null,
    value = null,
    serial = null,
} = {}) {
    if (!ctx || !recipe) return null;
    const c = normalizeContent(recipe, { title, subtitle, family, value, serial });
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    fill(ctx, recipe.palette.background, 0, 0, width, height);
    switch (recipe.layout) {
        case 'market-stack': drawMarketStack(ctx, width, height, recipe, c); break;
        case 'market-rail': drawMarketRail(ctx, width, height, recipe, c); break;
        case 'service-grid': drawServiceGrid(ctx, width, height, recipe, c); break;
        case 'service-warning': drawServiceWarning(ctx, width, height, recipe, c); break;
        case 'public-wayfinding': drawPublicWayfinding(ctx, width, height, recipe, c); break;
        case 'public-notice': drawPublicNotice(ctx, width, height, recipe, c); break;
        case 'spectacle-ribbon': drawSpectacleRibbon(ctx, width, height, recipe, c); break;
        case 'spectacle-hero': drawSpectacleHero(ctx, width, height, recipe, c); break;
        case 'local-mark': drawLocalMark(ctx, width, height, recipe, c); break;
        default: drawLocalIndex(ctx, width, height, recipe, c); break;
    }
    drawFrame(ctx, width, height, recipe);
    ctx.restore();
    return { schema: DISPLAY_RENDER_SCHEMA, recipeId: recipe.id, family: recipe.family, layout: recipe.layout };
}

function normalizeContent(recipe, input) {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const serial = clean(input.serial) || hashDisplaySeed(`${recipe.id}:${input.title}:${input.subtitle}`).toString(16).padStart(8, '0').toUpperCase();
    return {
        title: clean(input.title) || 'PUBLIC SIGNAL',
        subtitle: clean(input.subtitle) || 'INDEX TRANSMISSION',
        family: clean(input.family) || recipe.family.replace(/[-_]+/g, ' ').toUpperCase(),
        value: clean(typeof input.value === 'object' ? input.value?.label : input.value),
        serial,
    };
}

function drawMarketStack(ctx, w, h, r, c) {
    fill(ctx, r.palette.accent, w * .04, h * .08, w * .12, h * .84);
    drawText(ctx, c.family, w * .20, h * .20, h * .10, r.fonts.secondary, '800', r.palette.foreground, 'left', w * .72);
    drawText(ctx, c.title, w * .20, h * .56, h * .28, r.fonts.primary, '900', r.palette.foreground, 'left', w * .74);
    drawText(ctx, c.subtitle, w * .20, h * .74, h * .095, r.fonts.secondary, '700', r.palette.foreground, 'left', w * .67);
    if (c.value) drawText(ctx, c.value, w * .94, h * .90, h * .13, r.fonts.primary, '900', r.palette.accent, 'right', w * .34);
}

function drawMarketRail(ctx, w, h, r, c) {
    fill(ctx, r.palette.accent, 0, h * .74, w, h * .18);
    drawText(ctx, c.title, w * .06, h * .50, h * .30, r.fonts.primary, '900', r.palette.foreground, 'left', w * .86);
    drawText(ctx, `${c.family}  /  ${c.subtitle}`, w * .06, h * .86, h * .085, r.fonts.secondary, '800', r.palette.background, 'left', w * .84);
    if (c.value) drawText(ctx, c.value, w * .94, h * .20, h * .10, r.fonts.secondary, '800', r.palette.accent, 'right', w * .28);
}

function drawServiceGrid(ctx, w, h, r, c) {
    ctx.save();
    ctx.globalAlpha = .24;
    ctx.strokeStyle = r.palette.secondary;
    ctx.lineWidth = Math.max(1, h * .006);
    for (let i = 1; i < 8; i++) line(ctx, w * i / 8, 0, w * i / 8, h);
    for (let i = 1; i < 5; i++) line(ctx, 0, h * i / 5, w, h * i / 5);
    ctx.restore();
    fill(ctx, r.palette.accent, w * .04, h * .08, w * .92, h * .10);
    drawText(ctx, `STATUS / ${c.family}`, w * .06, h * .16, h * .055, r.fonts.secondary, '800', r.palette.background, 'left', w * .80);
    drawText(ctx, `> ${c.title}`, w * .06, h * .43, h * .15, r.fonts.primary, '800', r.palette.foreground, 'left', w * .85);
    drawText(ctx, c.subtitle, w * .06, h * .61, h * .075, r.fonts.secondary, '600', r.palette.foreground, 'left', w * .82);
    drawText(ctx, `SERIAL=${shortCode(c.serial)}`, w * .06, h * .88, h * .052, r.fonts.secondary, '600', r.palette.secondary, 'left', w * .48);
    if (c.value) drawText(ctx, c.value, w * .94, h * .88, h * .068, r.fonts.secondary, '800', r.palette.accent, 'right', w * .32);
}

function drawServiceWarning(ctx, w, h, r, c) {
    fill(ctx, r.palette.accent, 0, 0, w, h * .22);
    drawText(ctx, c.family, w * .06, h * .16, h * .10, r.fonts.primary, '900', r.palette.background, 'left', w * .82);
    drawText(ctx, c.title, w * .06, h * .52, h * .20, r.fonts.primary, '900', r.palette.foreground, 'left', w * .86);
    drawText(ctx, c.subtitle, w * .06, h * .70, h * .08, r.fonts.secondary, '700', r.palette.foreground, 'left', w * .82);
    drawText(ctx, shortCode(c.serial), w * .06, h * .90, h * .055, r.fonts.secondary, '700', r.palette.secondary, 'left', w * .38);
}

function drawPublicWayfinding(ctx, w, h, r, c) {
    fill(ctx, r.palette.accent, w * .055, h * .06, w * .075, h * .88);
    for (let i = 0; i < 5; i++) circle(ctx, r.palette.background, w * .0925, h * (.16 + i * .16), Math.max(3, h * .018));
    drawText(ctx, c.family, w * .17, h * .19, h * .08, r.fonts.secondary, '800', r.palette.foreground, 'left', w * .70);
    drawText(ctx, c.title, w * .17, h * .54, h * .22, r.fonts.primary, '900', r.palette.foreground, 'left', w * .75);
    drawText(ctx, c.subtitle, w * .17, h * .72, h * .085, r.fonts.secondary, '600', r.palette.foreground, 'left', w * .70);
    drawText(ctx, shortCode(c.serial), w * .94, h * .91, h * .055, r.fonts.secondary, '700', r.palette.secondary, 'right', w * .30);
}

function drawPublicNotice(ctx, w, h, r, c) {
    strokeRect(ctx, r.palette.accent, w * .05, h * .07, w * .90, h * .84, Math.max(2, h * .012));
    fill(ctx, r.palette.accent, w * .05, h * .07, w * .90, h * .18);
    drawText(ctx, c.family, w * .09, h * .21, h * .10, r.fonts.secondary, '800', r.palette.background, 'left', w * .76);
    drawText(ctx, c.title, w * .09, h * .49, h * .17, r.fonts.primary, '900', r.palette.foreground, 'left', w * .76);
    drawText(ctx, c.subtitle, w * .09, h * .68, h * .075, r.fonts.secondary, '600', r.palette.foreground, 'left', w * .76);
    drawText(ctx, shortCode(c.serial), w * .09, h * .85, h * .052, r.fonts.secondary, '700', r.palette.secondary, 'left', w * .38);
}

function drawSpectacleRibbon(ctx, w, h, r, c) {
    fill(ctx, r.palette.secondary, w * .74, h * .07, w * .21, h * .055);
    fill(ctx, r.palette.accent, w * .82, h * .14, w * .13, h * .028);
    drawText(ctx, c.title, w * .50, h * .50, h * .28, r.fonts.primary, '900', r.palette.foreground, 'center', w * .90);
    fill(ctx, r.palette.accent, 0, h * .74, w, h * .18);
    drawText(ctx, `${c.family}  /  ${c.subtitle}  /  ${c.value || shortCode(c.serial)}`, w * .04, h * .86, h * .08, r.fonts.secondary, '800', r.palette.background, 'left', w * .92);
}

function drawSpectacleHero(ctx, w, h, r, c) {
    ctx.save();
    ctx.globalAlpha = .22;
    fill(ctx, r.palette.accent, w * .58, 0, w * .42, h);
    ctx.restore();
    drawText(ctx, c.family, w * .055, h * .16, h * .075, r.fonts.secondary, '800', r.palette.accent, 'left', w * .50);
    drawText(ctx, c.title, w * .055, h * .59, h * .33, r.fonts.primary, '900', r.palette.foreground, 'left', w * .86);
    drawText(ctx, c.subtitle, w * .06, h * .75, h * .075, r.fonts.secondary, '700', r.palette.foreground, 'left', w * .70);
    if (c.value) drawText(ctx, c.value, w * .94, h * .91, h * .11, r.fonts.primary, '900', r.palette.accent, 'right', w * .35);
}

function drawLocalIndex(ctx, w, h, r, c) {
    drawText(ctx, c.family, w * .06, h * .18, h * .075, r.fonts.secondary, '800', r.palette.accent, 'left', w * .70);
    drawText(ctx, c.title, w * .06, h * .52, h * .22, r.fonts.primary, '900', r.palette.foreground, 'left', w * .82);
    lineStyled(ctx, r.palette.accent, w * .06, h * .61, w * .48, h * .61, Math.max(2, h * .009));
    drawText(ctx, c.subtitle, w * .06, h * .75, h * .078, r.fonts.secondary, '600', r.palette.foreground, 'left', w * .78);
    drawText(ctx, shortCode(c.serial), w * .94, h * .90, h * .052, r.fonts.secondary, '700', r.palette.secondary, 'right', w * .30);
}

function drawLocalMark(ctx, w, h, r, c) {
    circle(ctx, r.palette.accent, w * .16, h * .30, Math.max(5, h * .10));
    drawText(ctx, c.title, w * .08, h * .62, h * .23, r.fonts.primary, '900', r.palette.foreground, 'left', w * .84);
    drawText(ctx, c.subtitle, w * .08, h * .78, h * .072, r.fonts.secondary, '600', r.palette.foreground, 'left', w * .72);
}

function drawFrame(ctx, w, h, r) {
    ctx.save();
    ctx.strokeStyle = r.palette.foreground;
    ctx.globalAlpha = .72;
    ctx.lineWidth = Math.max(2, Math.min(w, h) * .018);
    ctx.strokeRect(ctx.lineWidth * .5, ctx.lineWidth * .5, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.restore();
}

function drawText(ctx, value, x, y, startPx, font, weight, color, align, maxWidth) {
    const textValue = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!textValue) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';

    // Sign copy is a single-line display contract. Fit font size to the box instead
    // of using Canvas2D maxWidth, which horizontally crushes glyphs and makes short
    // phrases look tiny while long phrases become visibly raster-stretched.
    const nominalPx = Math.max(7, startPx);
    const growth = textValue.length <= 12 ? 1.26 : textValue.length <= 24 ? 1.12 : 1;
    const maxPx = nominalPx * growth;
    const minPx = Math.max(7, nominalPx * .42);
    let lo = minPx;
    let hi = maxPx;
    let fittedPx = minPx;
    for (let i = 0; i < 12; i++) {
        const px = (lo + hi) * .5;
        ctx.font = `${weight} ${px}px ${font}`;
        const measured = ctx.measureText ? ctx.measureText(textValue).width : 0;
        if (!ctx.measureText || measured <= maxWidth * .97) {
            fittedPx = px;
            lo = px;
        } else {
            hi = px;
        }
    }
    ctx.font = `${weight} ${fittedPx}px ${font}`;
    const rendered = singleLineEllipsis(ctx, textValue, maxWidth);
    ctx.fillText(rendered, x, y);
    ctx.restore();
}

function singleLineEllipsis(ctx, value, maxWidth) {
    if (!ctx.measureText || ctx.measureText(value).width <= maxWidth) return value;
    const words = value.split(' ').filter(Boolean);
    while (words.length > 1) {
        words.pop();
        const candidate = `${words.join(' ')}…`;
        if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
    let text = words[0] ?? value;
    while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
    return `${text}…`;
}

function shortCode(value) {
    const h = hashDisplaySeed(value ?? 'jweb').toString(16).padStart(8, '0').toUpperCase();
    return `${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

function fill(ctx, color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function strokeRect(ctx, color, x, y, w, h, width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.strokeRect(x, y, w, h); }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function lineStyled(ctx, color, x1, y1, x2, y2, width) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; line(ctx, x1, y1, x2, y2); ctx.restore(); }
function circle(ctx, color, x, y, radius) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
