export const SYSTEMS_VOICE = Object.freeze({
    nouns: Object.freeze([
        'INDEX', 'CACHE', 'QUERY', 'SESSION', 'MIRROR', 'CRAWLER', 'SHARD', 'QUEUE', 'WORKER', 'SOCKET', 'PORT', 'ROUTE', 'TABLE', 'SCHEMA', 'LOCK',
        'TOKEN', 'BUFFER', 'STREAM', 'BATCH', 'CHECKPOINT', 'SNAPSHOT', 'REPLICA', 'LOG', 'TRACE', 'HEAP', 'STACK', 'THREAD', 'PROCESS', 'DAEMON', 'WATCHDOG',
        'BACKPRESSURE', 'RETRY WINDOW', 'CIRCUIT BREAKER', 'HEALTH CHECK', 'CACHE LINE', 'MESSAGE BUS', 'EVENT LOOP', 'FILE DESCRIPTOR'
    ]),
    verbs: Object.freeze([
        'STALE', 'WAITING', 'RETRYING', 'DROPPED', 'DUPLICATED', 'THROTTLED', 'UNVERIFIED', 'STILL INDEXING', 'BLOCKED', 'BACKED UP', 'REPLICATING',
        'CHECKPOINTING', 'FLUSHING', 'PAGING', 'SWAPPING', 'RECONNECTING', 'REBUILDING', 'INVALIDATING', 'DRAINING', 'WARMING', 'LISTENING', 'POLLING'
    ]),
    joints: Object.freeze(['AFTER', 'BEFORE', 'WITHOUT', 'BEYOND', 'AGAINST', 'THROUGH', 'INSIDE', 'BETWEEN', 'UNDER'])
});

export const SYSTEMS_PAIRS = Object.freeze([
    ['CACHE MISS', 'go all the way down'], ['BACKPRESSURE', 'the queue is telling you something'], ['EVENT LOOP', 'one thing at a time, very quickly'], ['RETRY WINDOW', 'not yet, not never'],
    ['CIRCUIT BREAKER', 'failure can be bounded'], ['CHECKPOINT', 'remember enough to continue'], ['REPLICA', 'same story, another machine'], ['SHARD', 'only part of the answer lives here'],
    ['STREAM', 'data that has not finished becoming'], ['WATCHDOG', 'somebody watches the watcher'], ['HEALTH CHECK', 'alive is not the same as useful'], ['FILE DESCRIPTOR', 'everything becomes a handle'],
    ['QUEUE DEPTH', 'latency with a shape'], ['INVALIDATE', 'the hard part of caching'], ['TRACE', 'follow the thing that actually happened']
]);
