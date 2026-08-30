import assert from 'node:assert/strict';
import { createPriorityLoadQueue } from './priority-load-queue.js';

let running = 0;
let peak = 0;
const starts = [];
const deferred = [];
const queue = createPriorityLoadQueue({ concurrency: 2, paused: true });

function gate(name, priority, shouldFail = false) {
    return queue.enqueue({
        key: name,
        priority,
        run: () => new Promise((resolve, reject) => {
            starts.push(name);
            running++;
            peak = Math.max(peak, running);
            deferred.push(() => {
                running--;
                if (shouldFail) reject(new Error(name));
                else resolve(name);
            });
        }),
    });
}

const low = gate('low', 100);
const high = gate('high', 1);
const mid = gate('mid', 10, true).catch(error => error.message);
await Promise.resolve();
assert.equal(starts.length, 0, 'paused queue must not start network/decode work');
queue.resume();
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(starts, ['high', 'mid'], 'queued work must start in priority order');
assert.equal(peak, 2, 'queue must honor concurrency cap');
deferred.shift()();
deferred.shift()();
await new Promise(resolve => setImmediate(resolve));
assert.equal(starts[2], 'low', 'next task starts only after capacity returns');
deferred.shift()();
assert.equal(await high, 'high');
assert.equal(await mid, 'mid');
assert.equal(await low, 'low');
await queue.whenIdle();
const stats = queue.stats();
assert.equal(stats.active, 0);
assert.equal(stats.pending, 0);
assert.equal(stats.completed, 2);
assert.equal(stats.failed, 1);
assert.equal(stats.concurrency, 2);
console.log('[priority-load-queue-selftest] PASS', { starts, peak, stats });
