const API_ROOT = 'https://api.dvidshub.net';

function jsonUrl(path, params) {
    const url = new URL(`${API_ROOT}${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
}

export async function resolveDvidsLive(channel, { fetchImpl = globalThis.fetch, dvidsApiKey, nowMs = Date.now() } = {}) {
    if (typeof fetchImpl !== 'function' || !dvidsApiKey) return null;
    const nowIso = new Date(nowMs).toISOString();
    const listResponse = await fetchImpl(jsonUrl('/live/list', {
        api_key: dvidsApiKey,
        max_results: 50,
        from_date: new Date(nowMs - 6 * 60 * 60 * 1000).toISOString(),
        to_date: new Date(nowMs + 12 * 60 * 60 * 1000).toISOString(),
        sort: 'begin',
        sortdir: 'asc',
    }));
    if (!listResponse.ok) return null;
    const listJson = await listResponse.json();
    const events = Array.isArray(listJson?.results) ? listJson.results : [];
    const active = events.filter((event) => {
        const begin = Date.parse(event.begin);
        const end = Date.parse(event.end);
        return Number.isFinite(begin) && Number.isFinite(end) && begin <= nowMs && end >= nowMs;
    });
    const candidate = active[0] ?? events.find((event) => Date.parse(event.begin) >= nowMs) ?? null;
    if (!candidate?.id) return null;

    const detailResponse = await fetchImpl(jsonUrl('/live/get', { api_key: dvidsApiKey, id: candidate.id }));
    if (!detailResponse.ok) return null;
    const detailJson = await detailResponse.json();
    const detail = detailJson?.results;
    if (!detail?.hls_url) return Object.freeze({ pending: true, sourceKey: channel.sourceKey, event: detail ?? candidate, checkedAt: nowIso });

    return Object.freeze({
        schema: 'jweb.media-source.v1',
        sourceKey: channel.sourceKey,
        kind: 'hls',
        label: detail.title ?? channel.label,
        provider: 'DVIDS',
        officialPageUrl: detail.url ?? channel.officialPageUrl,
        streams: Object.freeze([{ url: detail.hls_url, transport: 'hls', role: 'primary' }]),
        defaultMuted: true,
        crossOrigin: 'anonymous',
        attribution: 'DVIDS',
        event: Object.freeze({ id: detail.id, begin: detail.begin, end: detail.end, title: detail.title }),
    });
}
