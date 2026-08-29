import assert from 'node:assert/strict';

globalThis.location = {
    search: '?n.test.0=7&cfg.demo.live=12&cfg.demo.reload=18',
    href: 'http://localhost:8000/?n.test.0=7&cfg.demo.live=12&cfg.demo.reload=18&seed=44',
};

const p = await import('./numeric-parameters.js?selftest=' + Date.now());
const literal = p.parameterNumber('n.test.0', 5, true);
assert.equal(literal, 7, 'literal URL override must apply during module initialization');
let liveLiteral = literal;
p.registerLiteralScope('test', (index, value) => {
    if (index !== 0) return false;
    liveLiteral = value;
    return true;
});

const config = { demo: { live: 3, reload: 4, color: 0xff00aa } };
p.registerConfigRoot(config);
assert.equal(config.demo.live, 12, 'cfg.* final override must apply');
assert.equal(config.demo.reload, 18, 'reload-only cfg override must still apply at boot');
p.registerConfigLiveParameter('cfg.demo.live', value => { config.demo.live = value; });

let r = p.setDesiredParameter('n.test.0', '9');
assert.equal(r.appliedLive, true);
assert.equal(liveLiteral, 9);
r = p.setDesiredParameter('cfg.demo.live', '21');
assert.equal(r.appliedLive, true);
assert.equal(config.demo.live, 21);
r = p.setDesiredParameter('cfg.demo.reload', '22');
assert.equal(r.appliedLive, false);
assert.equal(config.demo.reload, 18, 'reload-only edits must not partially mutate the live world');

p.resetDesiredParameter('cfg.demo.live');
assert.equal(config.demo.live, 3, 'live reset returns to this seed/load baseline');

const url = p.buildParameterizedReloadUrl('99');
const u = new URL(url);
assert.equal(u.searchParams.get('seed'), '99');
assert.equal(u.searchParams.get('n.test.0'), '9');
assert.equal(u.searchParams.get('cfg.demo.reload'), '22');
assert.equal(u.searchParams.has('cfg.demo.live'), false, 'reset-to-baseline override should be removed');

console.log('[parameter-selftest] PASS', p.getParameterRuntimeCounts(), url);
