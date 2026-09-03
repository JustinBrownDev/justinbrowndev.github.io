import { createPlayerPhysics } from '../player-physics.js';

// Cut 16 compatibility shim.  The dual-gravity experiment is retired: downward
// architectural growth never changes player gravity, camera-up, or controller
// coordinates.  Keep the old export temporarily so stale imports outside the live
// runtime fail safe into ordinary physics instead of resurrecting inversion.
export function createDualPolarityPlayerPhysics(options = {}) {
  return createPlayerPhysics(options);
}
