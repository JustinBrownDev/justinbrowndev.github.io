import { pickMassiveNoisePair, pickPoetryTag } from '../noise-data-bootstrap.js';

export const LANGUAGE_SIDECAR_SCHEMA = 'jweb.language-sidecar.v1';

let fullSidecar = null;
let hydrationPromise = null;
let hydrationScheduled = false;

export function installLanguageSidecar(module) {
  if (!module?.LANGUAGE_COMPONENTS) return false;
  const total = Number(module?.LANGUAGE_CORPUS_META?.total)
    || Object.values(module.LANGUAGE_COMPONENTS).reduce((sum, pool) => sum + (Array.isArray(pool) ? pool.length : 0), 0);
  if (!(total > 0)) return false;
  fullSidecar = module;
  return true;
}

export function hydrateLanguageSidecar() {
  if (fullSidecar) return Promise.resolve(fullSidecar);
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = import('../noise-data-language.js')
    .then(module => { installLanguageSidecar(module); return fullSidecar; })
    .catch(() => null);
  return hydrationPromise;
}

function scheduleLanguageSidecarHydration() {
  if (fullSidecar || hydrationPromise || hydrationScheduled) return;
  hydrationScheduled = true;
  const start = () => { hydrationScheduled = false; void hydrateLanguageSidecar(); };
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(start, { timeout: 6000 });
  } else if (typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(start, 1200);
  }
}

function pickFrom(rng, component) {
  const pool = fullSidecar?.LANGUAGE_COMPONENTS?.[component];
  if (!Array.isArray(pool) || !pool.length) return '';
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

const SURFACE_COMPONENTS = Object.freeze({
  graffiti: ['graffiti', 'aphorisms', 'slogans', 'personal_fragments', 'poetry'],
  flyer: ['notices', 'advertisements', 'propaganda', 'classifieds', 'statements'],
  storefront: ['advertisements', 'commercial_names', 'products_models', 'slogans', 'names'],
  technical: ['technical', 'industrial', 'warnings', 'instructions', 'network', 'scientific'],
  institutional: ['bureaucratic', 'notices', 'instructions', 'propaganda', 'statements'],
  poetry: ['poetry', 'personal_fragments', 'aphorisms', 'association_chains'],
  default: ['statements', 'headlines', 'notices', 'association_chains'],
});

export function pickSurfaceLanguageText(rng, family = 'default') {
  if (!fullSidecar) {
    scheduleLanguageSidecarHydration();
    if (family === 'graffiti' || family === 'poetry') return pickPoetryTag(rng);
    return pickMassiveNoisePair(rng)?.[0] ?? pickPoetryTag(rng);
  }
  const components = SURFACE_COMPONENTS[family] ?? SURFACE_COMPONENTS.default;
  for (let attempt = 0; attempt < components.length; attempt++) {
    const component = components[Math.min(components.length - 1, Math.floor(rng() * components.length))];
    const text = pickFrom(rng, component);
    if (text) return text;
  }
  return pickPoetryTag(rng);
}

export function pickSurfaceLanguagePair(rng, family = 'default') {
  if (!fullSidecar) {
    scheduleLanguageSidecarHydration();
    if (family === 'graffiti' || family === 'poetry') return [pickPoetryTag(rng), pickPoetryTag(rng)];
    return pickMassiveNoisePair(rng);
  }
  const title = pickSurfaceLanguageText(rng, family);
  let subtitle = pickSurfaceLanguageText(rng, family);
  if (subtitle === title) subtitle = pickSurfaceLanguageText(rng, family);
  return [title, subtitle];
}
