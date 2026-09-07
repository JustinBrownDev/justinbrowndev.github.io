// Example only: a future authored place can use this without knowing providers.
import { createMediaIntent, resolveJwebMediaChannel } from '../index.mjs';

export async function planPlaceTelevision({ placeSeed, genre, baseResolver, dvidsApiKey, fetchImpl = fetch }) {
    const mediaIntent = createMediaIntent({
        seed: placeSeed,
        salt: 'main-room-tv',
        genre,
        defaultAudio: 'proximity',
    });
    if (!mediaIntent) return null;
    return resolveJwebMediaChannel(mediaIntent, {
        baseResolver,
        dvidsApiKey,
        fetchImpl,
    });
}

export async function planPlaceRadio({ placeSeed, baseResolver, dvidsApiKey, fetchImpl = fetch }) {
    const mediaIntent = createMediaIntent({
        seed: placeSeed,
        salt: 'counter-radio',
        radioEligible: true,
        defaultAudio: 'audible',
    });
    if (!mediaIntent) return null;
    return resolveJwebMediaChannel(mediaIntent, {
        baseResolver,
        dvidsApiKey,
        fetchImpl,
    });
}
