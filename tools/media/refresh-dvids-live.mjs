#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const API_ROOT = 'https://api.dvidshub.net';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CLIENT_ORIGIN = 'https://jweb.dev';
const DVIDS_API_HLS_HOST = 'api.dvidshub.net';
const DVIDS_CLOUDFRONT_HOST = /^d[a-z0-9]{8,}\.cloudfront\.net$/i;

function fail(message) {
    console.error(`[dvids-live-refresh] ${message}`);
    process.exitCode = 1;
}

function argValue(name, fallback = null) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function first(value, ...fallbacks) {
    if (value != null && value !== '') return value;
    for (const item of fallbacks) if (item != null && item !== '') return item;
    return null;
}

function parseTime(value) {
    if (value == null || value === '') return null;
    if (Number.isFinite(value)) {
        const n = Number(value);
        return n > 1e12 ? n : n * 1000;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEvent(raw) {
    if (!raw || raw.id == null) return null;
    const id = String(raw.id);
    const startRaw = first(raw.start_date, raw.begin, raw.start, raw.start_time, raw.startDate);
    const endRaw = first(raw.end_date, raw.end, raw.stop, raw.end_time, raw.endDate);
    const startMs = parseTime(startRaw);
    const endMs = parseTime(endRaw);
    const hlsUrl = first(raw.hls_url, raw.hlsUrl, raw.hls);
    const pageUrl = first(raw.page_url, raw.url, raw.web_url, `https://www.dvidshub.net/webcast/${encodeURIComponent(id)}`);
    return {
        id,
        title: String(first(raw.title, raw.name, `DVIDS Webcast ${id}`)),
        description: raw.description ? String(raw.description) : null,
        classification: raw.classification ? String(raw.classification) : null,
        status: raw.status ? String(raw.status).toLowerCase() : null,
        startMs,
        endMs,
        start: startMs == null ? null : new Date(startMs).toISOString(),
        end: endMs == null ? null : new Date(endMs).toISOString(),
        hlsUrl: hlsUrl ? String(hlsUrl) : null,
        pageUrl: pageUrl ? String(pageUrl) : null,
        embedUrl: `https://www.dvidshub.net/webcast/embed/${encodeURIComponent(id)}`,
        imageUrl: first(raw.image_url, raw.imageUrl, raw.thumbnail_url),
        attribution: 'DVIDS',
    };
}

function validateDvidsHls(urlText) {
    if (!urlText) return null;
    let url;
    try { url = new URL(urlText); }
    catch { return null; }
    if (url.protocol !== 'https:') return null;
    const apiPlaylist = url.hostname === DVIDS_API_HLS_HOST
        && /^\/v\d+\/playlist\/[A-Za-z0-9._~-]+\/stream\/?$/.test(url.pathname);
    const cloudfrontMaster = DVIDS_CLOUDFRONT_HOST.test(url.hostname)
        && /^\/out\/v\d+\/[0-9a-f]{16,}\/index\.m3u8$/i.test(url.pathname);
    return apiPlaylist || cloudfrontMaster ? url.toString() : null;
}

function eventScore(event, nowMs) {
    const activeByTime = event.startMs != null && event.startMs <= nowMs && (event.endMs == null || event.endMs >= nowMs);
    const statusLive = /live|streaming|active|on.?air/.test(event.status ?? '');
    const ready = /ready|scheduled|standby/.test(event.status ?? '');
    const futureDistance = event.startMs == null ? 9e15 : Math.max(0, event.startMs - nowMs);
    if (statusLive && activeByTime) return -4e15 + futureDistance;
    if (activeByTime) return -3e15 + futureDistance;
    if (ready) return -2e15 + futureDistance;
    return -1e15 + futureDistance;
}

function chooseEvent(events, nowMs) {
    return events
        .filter(Boolean)
        .filter((event) => event.endMs == null || event.endMs >= nowMs - 15 * 60 * 1000)
        .sort((a, b) => eventScore(a, nowMs) - eventScore(b, nowMs))[0] ?? null;
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'JWEB-DVIDS-Live-Bridge/1.0',
            Referer: `${CLIENT_ORIGIN}/`,
            Origin: CLIENT_ORIGIN,
        },
        redirect: 'follow',
    });
    if (!response.ok) throw new Error(`DVIDS API returned HTTP ${response.status}`);
    return response.json();
}

function apiUrl(pathname, apiKey, params = {}) {
    const url = new URL(pathname, API_ROOT);
    url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries(params)) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
}

async function main() {
    const outDir = path.resolve(argValue('--out', 'dvids-runtime'));
    const apiKey = process.env.DVIDS_API_KEY?.trim();
    if (!apiKey) throw new Error('DVIDS_API_KEY secret is not configured');

    const nowMs = Date.now();
    const listUrl = apiUrl('/live/list', apiKey, {
        max_results: 50,
        from_date: new Date(nowMs - 12 * HOUR_MS).toISOString(),
        to_date: new Date(nowMs + 7 * DAY_MS).toISOString(),
        sort: 'begin',
        sortdir: 'asc',
    });
    const listJson = await fetchJson(listUrl);
    const rawEvents = Array.isArray(listJson?.results)
        ? listJson.results
        : Array.isArray(listJson?.results?.items)
            ? listJson.results.items
            : [];
    const events = rawEvents.map(normalizeEvent).filter(Boolean);
    let selected = chooseEvent(events, nowMs);

    // The list endpoint does not always include the HLS field. Resolve exactly one
    // selected event through /live/get instead of fanning out API calls.
    if (selected?.id && !selected.hlsUrl) {
        const detailJson = await fetchJson(apiUrl('/live/get', apiKey, { id: selected.id }));
        const detailRaw = Array.isArray(detailJson?.results) ? detailJson.results[0] : detailJson?.results;
        const detail = normalizeEvent(detailRaw);
        if (detail) selected = { ...selected, ...detail };
    }

    let safeHlsUrl = validateDvidsHls(selected?.hlsUrl);
    if (!safeHlsUrl) {
        // A scheduled/active entry can briefly exist before its feed is published.
        // Prefer another playable current/nearby event over emitting a dead choice.
        const playableFallback = chooseEvent(events.filter((event) => validateDvidsHls(event.hlsUrl)), nowMs);
        if (playableFallback && playableFallback.id !== selected?.id) {
            selected = playableFallback;
            safeHlsUrl = validateDvidsHls(selected.hlsUrl);
        }
    }
    if (selected) selected = { ...selected, hlsUrl: safeHlsUrl };

    const sanitizedEvents = events.slice(0, 24).map((event) => ({
        id: event.id,
        title: event.title,
        classification: event.classification,
        status: event.status,
        start: event.start,
        end: event.end,
        pageUrl: event.pageUrl,
        embedUrl: event.embedUrl,
        attribution: 'DVIDS',
    }));

    const manifest = {
        schema: 'jweb.dvids-live-bridge.v1',
        refreshCadenceSec: 600,
        sourceKey: 'live-public-affairs.dvids',
        provider: 'DVIDS',
        attribution: 'DVIDS',
        officialPageUrl: 'https://www.dvidshub.net/webcast/',
        state: safeHlsUrl ? 'ready' : (selected ? 'event-without-hls' : 'no-event'),
        selectedEvent: selected ? {
            id: selected.id,
            title: selected.title,
            classification: selected.classification,
            status: selected.status,
            start: selected.start,
            end: selected.end,
            hlsUrl: safeHlsUrl,
            pageUrl: selected.pageUrl,
            embedUrl: selected.embedUrl,
            attribution: 'DVIDS',
        } : null,
        upcoming: sanitizedEvents,
    };

    // Never serialize the credential. This check is intentionally broad so a
    // future refactor cannot accidentally expose it through metadata.
    const jsonText = `${JSON.stringify(manifest, null, 2)}\n`;
    if (jsonText.includes(apiKey) || /[?&]api_key=/i.test(jsonText)) {
        throw new Error('refusing to publish a manifest containing DVIDS credentials');
    }

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'dvids-live.json'), jsonText, 'utf8');
    console.log('[dvids-live-refresh] sanitized bridge generated', {
        state: manifest.state,
        eventId: manifest.selectedEvent?.id ?? null,
        upcoming: sanitizedEvents.length,
    });
}

function selftest() {
    const nowMs = Date.parse('2026-09-06T12:00:00Z');
    const live = normalizeEvent({
        id: 38403,
        title: 'Fixture webcast',
        begin: '2026-09-06T11:00:00Z',
        end: '2026-09-06T13:00:00Z',
        status: 'live',
        hls_url: 'https://api.dvidshub.net/v2/playlist/38403/stream',
    });
    const future = normalizeEvent({
        id: 38404,
        title: 'Future fixture',
        start_date: '2026-09-07T11:00:00Z',
        end_date: '2026-09-07T13:00:00Z',
        status: 'ready',
    });
    if (chooseEvent([future, live], nowMs)?.id !== '38403') throw new Error('selftest active-event selection failed');
    if (!validateDvidsHls(live.hlsUrl)) throw new Error('selftest valid DVIDS API HLS rejected');
    if (!validateDvidsHls('https://d1b55jk78a7el0.cloudfront.net/out/v1/1d4a1a50b52b4333894d00ce0c4c7ca5/index.m3u8')) throw new Error('selftest documented DVIDS CloudFront HLS rejected');
    if (validateDvidsHls('https://evil.example/v2/playlist/38403/stream')) throw new Error('selftest foreign HLS host accepted');
    if (validateDvidsHls('https://api.dvidshub.net/not-a-playlist')) throw new Error('selftest invalid DVIDS HLS path accepted');
    console.log('[dvids-live-refresh] SELFTEST PASS', { selected: live.id, credentialFreeOutput: true });
}

if (process.argv.includes('--selftest')) selftest();
else main().catch((error) => fail(error?.message ?? String(error)));
