import { getLinearProgramAt } from '../linear-scheduler.mjs';

const INSTANCE = 'https://video.blender.org';
const CHANNEL = 'blender_open_movies';

const TITLE_ALLOWLIST = Object.freeze([
    'agent 327: operation barbershop',
    'big buck bunny',
    'caminandes 2: gran dillama',
    'caminandes 3: llamigos - funny 3d animated short',
    'coffee run',
    'cosmos laundromat - first cycle. official blender foundation release.',
    'elephants dream',
    'glass half - blender animated cartoon',
    'hero - blender grease pencil showcase',
    'sintel - third open movie by blender foundation',
    'sprite fright',
    'tears of steel - blender vfx open movie',
    'wing it!',
    'singularity - painterly space adventure',
]);

const normalize = (text) => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function fetchJson(fetchImpl, url) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`PeerTube request failed: ${response.status}`);
    return response.json();
}

function choosePlayable(detail) {
    for (const playlist of detail?.streamingPlaylists ?? []) {
        if (playlist?.playlistUrl) return { kind: 'hls', url: playlist.playlistUrl, transport: 'hls' };
    }
    const files = [...(detail?.files ?? []), ...((detail?.streamingPlaylists ?? []).flatMap((playlist) => playlist?.files ?? []))];
    const file = files
        .filter((item) => item?.fileUrl)
        .sort((a, b) => (b?.resolution?.id ?? 0) - (a?.resolution?.id ?? 0))[0];
    if (file) return { kind: 'video-file', url: file.fileUrl, transport: 'mp4' };
    return null;
}

export async function resolveBlenderOpenMovies(channel, { fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
    if (typeof fetchImpl !== 'function') return null;
    const listUrl = `${INSTANCE}/api/v1/video-channels/${CHANNEL}/videos?count=100&sort=-publishedAt`;
    const listJson = await fetchJson(fetchImpl, listUrl);
    const rows = (listJson?.data ?? [])
        .filter((video) => TITLE_ALLOWLIST.includes(normalize(video.name)))
        .filter((video) => Number.isFinite(video.duration) && video.duration > 0)
        .map((video) => ({
            id: video.uuid ?? video.id,
            title: video.name,
            durationSec: video.duration,
            url: video.url ? new URL(video.url, INSTANCE).toString() : null,
            raw: video,
        }));
    if (!rows.length) return null;
    rows.sort((a, b) => a.title.localeCompare(b.title));
    const slot = getLinearProgramAt(rows, nowMs);
    if (!slot?.program?.id) return null;
    const detail = await fetchJson(fetchImpl, `${INSTANCE}/api/v1/videos/${encodeURIComponent(slot.program.id)}`);
    const playable = choosePlayable(detail);
    if (!playable) return null;
    return Object.freeze({
        schema: 'jweb.media-source.v1',
        sourceKey: channel.sourceKey,
        kind: playable.kind,
        label: `JWEB Cartoons: ${detail?.name ?? slot.program.title}`,
        provider: 'Blender Open Movies',
        officialPageUrl: detail?.url ? new URL(detail.url, INSTANCE).toString() : slot.program.url ?? channel.officialPageUrl,
        streams: Object.freeze([{ url: playable.url, transport: playable.transport, role: 'primary' }]),
        defaultMuted: true,
        crossOrigin: 'anonymous',
        seekSec: slot.seekSec,
        linear: Object.freeze({
            wallClockSynchronized: true,
            programIndex: slot.index,
            cycleSec: slot.cycleSec,
            remainingSec: slot.remainingSec,
        }),
        attribution: detail?.account?.displayName ?? detail?.channel?.displayName ?? 'Blender Open Movies',
        license: detail?.licence?.label ?? detail?.licence?.id ?? null,
    });
}
