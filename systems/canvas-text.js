import { QP } from '../runtime/main-quantitative-literals.js';

export function wrapCanvasLines(ctx, text, maxWidth, maxLines) {
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    for (const word0 of words) {
        let word = word0;
        while (ctx.measureText(word).width > maxWidth && word.length > QP[2864]) {
            let cut = word.length - QP[2865];
            while (cut > QP[2866] && ctx.measureText(word.slice(QP[2867], cut) + '-').width > maxWidth) cut--;
            const piece = word.slice(QP[2868], cut) + '-';
            if (line) { lines.push(line); line = ''; }
            lines.push(piece);
            word = word.slice(cut);
            if (lines.length >= maxLines) return lines.slice(QP[2869], maxLines);
        }
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !line) line = test;
        else { lines.push(line); line = word; }
        if (lines.length >= maxLines) return lines.slice(QP[2870], maxLines);
    }
    if (line && lines.length < maxLines) lines.push(line);
    return lines;
}

export function fitCanvasText(ctx, text, maxWidth, maxLines, maxPx, minPx, font, weight = '') {
    const loPx = Math.max(1, Math.floor(minPx));
    const hiPx = Math.max(loPx, Math.floor(maxPx));
    const tested = new Map();
    const test = (px) => {
        let value = tested.get(px);
        if (value) return value;
        ctx.font = `${weight ? weight + ' ' : ''}${px}px ${font}`;
        const lines = wrapCanvasLines(ctx, text, maxWidth, maxLines);
        value = { px, lines, fits: lines.length <= maxLines && lines.every(line => ctx.measureText(line).width <= maxWidth + QP[2871]) };
        tested.set(px, value);
        return value;
    };
    let low = loPx;
    let high = hiPx;
    let best = null;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const value = test(mid);
        if (value.fits) {
            best = value;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    if (!best) best = test(loPx);
    ctx.font = `${weight ? weight + ' ' : ''}${best.px}px ${font}`;
    return { px: best.px, lines: best.lines };
}

export function drawCanvasLines(ctx, fit, centerX, centerY, lineHeightMul = QP[2872]) {
    const lineH = fit.px * lineHeightMul;
    const startY = centerY - ((fit.lines.length - QP[2873]) * lineH) / QP[2874];
    for (let i = QP[2875]; i < fit.lines.length; i++) ctx.fillText(fit.lines[i], centerX, startY + i * lineH);
}
