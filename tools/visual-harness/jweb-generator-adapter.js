// Narrow JWEB-specific adapter for generator specimens.
// If Kowloon/world-contract APIs move, this is the only specimen file that should need editing.

export async function buildJwebGeneratorSpecimen({
  THREE,
  scene,
  seed,
  chunkX = 0,
  chunkZ = 0,
  chunkSize = 64,
  landmarkSpacingChunks = 3,
} = {}) {
  if (!THREE || !scene) throw new Error('buildJwebGeneratorSpecimen requires THREE and scene');
  const [{ createKowloonFabricEngine }, { deterministicChunkSeed, worldWeirdnessAt }] = await Promise.all([
    import('../../kowloon-fabric-engine.js'),
    import('../../world-contract.js'),
  ]);

  const playerPhysics = {
    registerOwnedWorld() { return { activationState: 'active' }; },
    unregisterOwnedWorld() { return true; },
  };
  const worldSeed = Number(seed) | 0;
  const x = Number(chunkX) | 0;
  const z = Number(chunkZ) | 0;
  const size = Math.max(1, Number(chunkSize) || 64);
  const engine = createKowloonFabricEngine({
    THREE,
    scene,
    playerPhysics,
    directSceneAdd: scene.add.bind(scene),
    worldSeed,
    chunkSize: size,
    landmarkSpacingChunks,
    yieldControl: null,
  });
  const chunk = {
    key: `${x},${z}`,
    x,
    z,
    centerX: x * size,
    centerZ: z * size,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
  const payload = await engine.build(chunk);
  if (!payload?.root) throw new Error(`Kowloon generator returned no root for chunk ${chunk.key}`);
  if (!payload.root.parent) scene.add(payload.root);
  payload.root.visible = true;
  return { payload, engine, chunk };
}
