# JWEB Media Channel Pack R1

Additive media-source inventory and resolver layer for future JWEB televisions, radios, public screens and authored places.

This directory does not activate new screens and does not edit the current world. It gives future place code a stable vocabulary for asking for a genre or source without knowing provider details.

## Current JWEB compatibility

Current main already owns `live-news.al-jazeera-english` in `world/media-source-resolver.js`. This pack deliberately delegates that key back to the existing resolver. Al Jazeera remains the only news channel.

The pack uses the same `jweb.media-source.v1` shape for sources that can resolve to actual media.

## Important policy

- No YouTube URLs are stored or selected by this pack.
- No Wikipedia or Internet Archive sources.
- No proxying or scraping merely because a stream is public to watch.
- Rights/transport uncertainty fails closed: the source stays cataloged but `selectable: false`.
- FilmOn is deliberately disabled pending unambiguous permission.
- Owncast, public-access and ambient-camera pools are empty allowlists until explicit provider/creator permission is recorded.
- Network failure is never world-generation-fatal. A TV can be dark/static/no-signal and the city still works.

## Ready paths

Immediately resolvable:

- Al Jazeera English through JWEB's existing resolver.
- JWEB Cartoons through Blender's official PeerTube API. The runtime discovers allowlisted Open Movies, picks the same program for everybody by wall clock, and resolves an HLS or MP4 source.
- DVIDS Live through JWEB's credential-free runtime bridge. GitHub Actions discovers the current DVIDS event with repository secret `DVIDS_API_KEY`; browser/spawn code receives only sanitized metadata and the validated DVIDS HLS URL.

Structurally ready but intentionally gated:

- Classic Arts Showcase: broadcast-friendly, web transport still needs confirmation.
- NASA / ISS: media rights are friendly, non-YouTube web transport still needs a dedicated resolver.
- NIH VideoCast: use only unrestricted events; event discovery/embed resolver still needed.
- NOAA Ocean Exploration: archived media is public domain, but the current live page uses YouTube embeds, so this pack refuses it under the no-YouTube rule.
- USGS Kilauea: official camera source is cataloged; direct reusable transport still needs confirmation.
- Library of Congress old-movie channel: deterministic lineup exists, direct item-resolution remains deliberately unguessed.
- Public access / Owncast / ambient cams: add exact permissioned endpoints to `data/allowlists.mjs`.

## API

```js
import {
  createMediaIntent,
  pickMediaChannel,
  resolveJwebMediaChannel,
} from './world/jweb-media-channel-pack/index.mjs';

const intent = createMediaIntent({
  seed: placeId,
  salt: 'lobby-tv',
  genre: 'cartoons',
  defaultAudio: 'proximity',
});

const source = await resolveJwebMediaChannel(intent, {
  fetchImpl: fetch,
  baseResolver: resolveMediaSource, // current JWEB resolver, needed for Al Jazeera
});
```

For radios, select `radioEligible: true` and render only the audio path. The semantic source stays the same; the furniture decides whether it owns a video surface.

## Architectural intent

Places should store semantic source keys or genre intent, never copied provider URLs. Provider endpoints can change without changing world identity. Live pixels are nondeterministic; world geometry and source selection can remain deterministic.
