import assert from 'node:assert/strict';
import { createPrefetchPressureGate } from '../world/player-centered-streaming.js';

const gate = createPrefetchPressureGate({ frameBudgetMs: 22, motionDistance: 0.035, cooldownMs: 100 });

let state = gate.observe({ now: 0, position: { x: 0, z: 0 } });
assert.equal(state.pressured, false, 'first observation establishes the baseline');

state = gate.observe({ now: 16, position: { x: 0.01, z: 0 } });
assert.equal(state.pressured, false, 'healthy stationary-ish frames leave surplus prefetch open');

state = gate.observe({ now: 32, position: { x: 0.08, z: 0 } });
assert.equal(state.motionPressured, true, 'meaningful player motion must close distant prefetch');
assert.equal(state.pressured, true);
assert.equal(state.pressureUntil, 132);

state = gate.observe({ now: 80, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true, 'motion pressure must persist through its cooldown');

state = gate.observe({ now: 133, position: { x: 0.08, z: 0 } });
assert.equal(state.framePressured, true, 'a long frame itself is pressure and renews the cooldown');
assert.equal(state.pressured, true);

state = gate.observe({ now: 149, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 165, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 181, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 197, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 213, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 229, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, true);
state = gate.observe({ now: 245, position: { x: 0.08, z: 0 } });
assert.equal(state.pressured, false, 'healthy stationary frames eventually reopen surplus prefetch');

state = gate.observe({ now: 285, position: { x: 0.08, z: 0 } });
assert.equal(state.framePressured, true, 'a hitch must immediately close the gate again');
assert.equal(state.pressured, true);

gate.reset();
assert.equal(gate.snapshot(300).pressured, false, 'reset clears pressure history');

console.log('[prefetch-pressure-gate-selftest] PASS');
