export const CODE_LORE_WORLD_CHUNK_STREAMER_SELFTEST_MJS = Object.freeze([
    "CODELORE|world-chunk-streamer-selftest.mjs|0001|Teleporting reprioritizes around the current player, and old non-singular",
    "CODELORE|world-chunk-streamer-selftest.mjs|0002|chunks beyond retention are unloaded rather than accumulating forever.",
    "CODELORE|world-chunk-streamer-selftest.mjs|0003|Walk for a long time. Scheduler bookkeeping must remain local to the",
    "CODELORE|world-chunk-streamer-selftest.mjs|0004|player rather than retaining every queued/unloaded coordinate ever seen.",
    "CODELORE|world-chunk-streamer-selftest.mjs|0005|Visibility is part of the streamer's ownership contract, not a side effect",
    "CODELORE|world-chunk-streamer-selftest.mjs|0006|of an unrelated render optimizer. Prefetched READY chunks may be hidden, but",
    "CODELORE|world-chunk-streamer-selftest.mjs|0007|entering their render ring must flip them visible immediately without a",
    "CODELORE|world-chunk-streamer-selftest.mjs|0008|rebuild or another spatial authority."
]);
