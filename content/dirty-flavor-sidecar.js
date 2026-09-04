import { pickSurfaceLanguagePair } from './language-sidecar.js';

export const DIRTY_FLAVOR_SIDECAR_SCHEMA = 'jweb.dirty-flavor-sidecar.v1';
export const MOUNTAIN_GOATS_FLYER_CHANCE = 0.004;

const SURFACE_LANES = Object.freeze({
  sign: 'storefront',
  flyer: 'flyer',
  'plaza-newsstand': 'institutional',
  'plaza-phone-booth': 'background',
  'plaza-atm-kiosk': 'technical',
  'plaza-park': 'institutional',
  megascreen: 'spectacle',
});

const FALLBACK_LANGUAGE_FAMILY = Object.freeze({
  background: 'institutional',
  storefront: 'storefront',
  flyer: 'flyer',
  technical: 'technical',
  institutional: 'institutional',
  spectacle: 'technical',
});

let fullSidecar = null;
let hydrationPromise = null;
let hydrationScheduled = false;

export function dirtyFlavorLaneForSurface(surfaceKind = '') {
  return SURFACE_LANES[String(surfaceKind)] ?? 'background';
}

export function installDirtyFlavorSidecar(module) {
  if (!module?.DIRTY_FLAVOR_LANES || !module?.DIRTY_FLAVOR_META) return false;
  const total = Number(module.DIRTY_FLAVOR_META.ordinaryRuntimeRows)
    || Object.values(module.DIRTY_FLAVOR_LANES).reduce((sum, pool) => sum + (Array.isArray(pool) ? pool.length : 0), 0);
  if (!(total > 0)) return false;
  fullSidecar = module;
  return true;
}

export function hydrateDirtyFlavorSidecar() {
  if (fullSidecar) return Promise.resolve(fullSidecar);
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = import('../noise-data-dirty-flavor.js')
    .then(module => {
      installDirtyFlavorSidecar(module);
      return fullSidecar;
    })
    .catch(error => {
      hydrationPromise = null;
      console.warn('[dirty-flavor] lazy corpus hydration failed; language sidecar fallback remains active', error);
      return null;
    });
  return hydrationPromise;
}

function scheduleHydration() {
  if (fullSidecar || hydrationPromise || hydrationScheduled) return;
  hydrationScheduled = true;
  const start = () => {
    hydrationScheduled = false;
    void hydrateDirtyFlavorSidecar();
  };
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(start, { timeout: 7000 });
  } else if (typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(start, 1500);
  }
}

function pickFrom(rng, values) {
  if (!Array.isArray(values) || !values.length) return '';
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))] ?? '';
}

function fallbackPair(rng, lane) {
  return pickSurfaceLanguagePair(rng, FALLBACK_LANGUAGE_FAMILY[lane] ?? 'default');
}

export function pickDirtyFlavorPair(rng, lane = 'background') {
  if (!fullSidecar) {
    scheduleHydration();
    return fallbackPair(rng, lane);
  }

  const pool = fullSidecar.DIRTY_FLAVOR_LANES?.[lane];
  if (!Array.isArray(pool) || !pool.length) return fallbackPair(rng, lane);

  // Mountain Goats metadata is allowed only as extremely rare flyer ephemera.
  // The runtime build has already stripped the repetitive "is a recording"
  // wrapper; no music row is eligible for signs, directories, or megascreens.
  if (lane === 'flyer'
      && Array.isArray(fullSidecar.MOUNTAIN_GOATS_RARE_TITLES)
      && fullSidecar.MOUNTAIN_GOATS_RARE_TITLES.length
      && rng() < MOUNTAIN_GOATS_FLYER_CHANCE) {
    const title = pickFrom(rng, fullSidecar.MOUNTAIN_GOATS_RARE_TITLES);
    const subtitle = pickFrom(rng, pool);
    return [title || subtitle, subtitle || title];
  }

  const title = pickFrom(rng, pool);
  let subtitle = pickFrom(rng, pool);
  if (subtitle === title && pool.length > 1) subtitle = pickFrom(rng, pool);
  if (!title) return fallbackPair(rng, lane);
  return [title, subtitle || title];
}

export function pickDirtyFlavorPairForSurface(rng, surfaceKind) {
  return pickDirtyFlavorPair(rng, dirtyFlavorLaneForSurface(surfaceKind));
}
