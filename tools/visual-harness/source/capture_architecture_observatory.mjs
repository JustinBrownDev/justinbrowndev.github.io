#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARCHITECTURE_OBSERVATORY_SCHEMA = 'jweb.architecture-observatory.v1';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}
function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
function parseChunks(text) {
  return String(text ?? '').split(/[;\s]+/).map(token => token.trim()).filter(Boolean).map(token => {
    const match = token.match(/^(-?\d+),(-?\d+)$/);
    if (!match) throw new Error(`invalid chunk coordinate: ${token}`);
    return { x: Number(match[1]), z: Number(match[2]) };
  });
}
function increment(target, key, amount = 1) {
  const normalized = String(key ?? 'unknown') || 'unknown';
  target[normalized] = (target[normalized] ?? 0) + amount;
}
function orderedCounts(counts) {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}
function pct(value) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }
function tableRows(counts) {
  const rows = Object.entries(counts);
  if (!rows.length) return '| — | 0 |';
  return rows.map(([key, count]) => `| ${String(key).replaceAll('|', '\\|')} | ${count} |`).join('\n');
}
function renderMarkdown(report) {
  const t = report.totals;
  return `# JWEB Architecture Observatory\n\n` +
    `Seed **${report.seed}** across **${report.chunks.length}** chunks. The report reads the real runtime \`physics.buildingConstructionEngine\` registry produced by KowloonFabricEngine; it is not a parallel planner simulation.\n\n` +
    `## Runtime construction health\n\n` +
    `- Buildings with construction truth: **${t.buildings}**\n` +
    `- Construction parts: **${t.parts}** (avg **${t.averagePartsPerBuilding.toFixed(1)}** / building)\n` +
    `- Exposed construction faces: **${t.faces}**\n` +
    `- Story/facade directives: **${t.facadeDirectives}**\n` +
    `- Semantically directed facade slots: **${t.semanticFaceFloors}**\n` +
    `- Non-ordinary facade language share: **${pct(t.nonOrdinaryFacadeShare)}**\n` +
    `- Unique architecture families / flavors / structural systems: **${t.uniqueFamilies} / ${t.uniqueFlavors} / ${t.uniqueStructuralSystems}**\n` +
    `- Total build time for sampled chunks: **${t.buildMs.toFixed(1)} ms**\n\n` +
    `## Architecture families\n\n| Family | Buildings |\n| --- | ---: |\n${tableRows(report.counts.architectureFamilies)}\n\n` +
    `## Construction flavors\n\n| Flavor | Buildings |\n| --- | ---: |\n${tableRows(report.counts.constructionFlavors)}\n\n` +
    `## Structural systems\n\n| System | Buildings |\n| --- | ---: |\n${tableRows(report.counts.structuralSystems)}\n\n` +
    `## Facade languages\n\n| Language | Story-face slots |\n| --- | ---: |\n${tableRows(report.counts.facadeLanguages)}\n\n` +
    `## Programs actually realized\n\n| Program architecture | Buildings |\n| --- | ---: |\n${tableRows(report.counts.programArchitectures)}\n\n` +
    `## Program-governed behaviors\n\n` +
    `**Mezzanine**\n\n| Policy | Buildings |\n| --- | ---: |\n${tableRows(report.counts.mezzaninePolicies)}\n\n` +
    `**Interior enrichment**\n\n| Policy | Buildings |\n| --- | ---: |\n${tableRows(report.counts.interiorClutterPolicies)}\n\n` +
    `**Rooftop mechanical**\n\n| Policy | Buildings |\n| --- | ---: |\n${tableRows(report.counts.rooftopMechanicalPolicies)}\n\n` +
    `## Chunk samples\n\n| Chunk | Buildings | Families | Flavors | Parts | Directives | Semantic facade share | Build ms |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
    report.chunks.map(row => `| ${row.chunk} | ${row.buildings} | ${row.uniqueFamilies} | ${row.uniqueFlavors} | ${row.parts} | ${row.facadeDirectives} | ${pct(row.nonOrdinaryFacadeShare)} | ${row.buildMs.toFixed(1)} |`).join('\n') +
    `\n\n## Warnings\n\n` +
    (report.warnings.length ? report.warnings.map(item => `- **${item.code}** — ${item.message}`).join('\n') : '- None in this sample.') +
    `\n\n## Probe queries for the art pass\n\n` +
    `The visual harness now retains exact construction-instance ownership. Useful searches: \`building-construction\`, \`construction-bay-pier\`, \`domestic-cellular\`, \`large-operational-bay\`, \`technical-service\`, or a flavor such as \`service-megastructure\`.\n`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepo = path.resolve(here, '../../..');
const repo = path.resolve(arg('--repo', defaultRepo));
const out = path.resolve(arg('--out', path.join(repo, '.visual-probe-output', 'architecture-observatory')));
const seed = intArg('--seed', 671278205);
const chunkSize = Math.max(16, intArg('--chunk-size', 64));
const landmarkSpacingChunks = Math.max(1, intArg('--landmark-spacing-chunks', 3));
const chunks = parseChunks(arg('--chunks', '0,0;4,3;-5,2;8,8'));
if (!chunks.length) throw new Error('at least one chunk is required');
for (const rel of ['vendor/three/three.module.js', 'kowloon-fabric-engine.js', 'world-contract.js']) {
  if (!fs.existsSync(path.join(repo, rel))) throw new Error(`JWEB repo missing ${rel}: ${repo}`);
}

const THREE = await import(pathToFileURL(path.join(repo, 'vendor/three/three.module.js')));
const { createKowloonFabricEngine } = await import(pathToFileURL(path.join(repo, 'kowloon-fabric-engine.js')));
const { deterministicChunkSeed, worldWeirdnessAt } = await import(pathToFileURL(path.join(repo, 'world-contract.js')));
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld() { return { activationState: 'active' }; }, unregisterOwnedWorld() { return true; } };
const worldSeed = Number(seed) | 0;
const engine = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize, landmarkSpacingChunks, yieldControl: null });

const countBuckets = {
  programArchitectures: {}, architectureFamilies: {}, constructionFlavors: {}, structuralSystems: {}, budgetClasses: {}, throughputClasses: {},
  roofEdgeCharacters: {}, facadeLanguages: {}, semanticRoles: {}, mezzaninePolicies: {}, interiorClutterPolicies: {}, rooftopMechanicalPolicies: {}, crownPolicies: {},
};
const rows = [];
const warnings = [];
let totalParts = 0, totalFaces = 0, totalDirectives = 0, totalSemantic = 0, totalBuildMs = 0, totalBuildings = 0, nonOrdinary = 0;

for (const { x, z } of chunks) {
  const chunk = { key: `${x},${z}`, x, z, centerX: x * chunkSize, centerZ: z * chunkSize, seed: deterministicChunkSeed(worldSeed, x, z), weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }) };
  let payload = null;
  const started = performance.now();
  try {
    payload = await engine.build(chunk);
    const buildMs = performance.now() - started;
    totalBuildMs += buildMs;
    const constructions = Array.isArray(payload?.physics?.buildingConstructionEngine) ? payload.physics.buildingConstructionEngine : [];
    const localFamilies = new Set(), localFlavors = new Set();
    let localParts = 0, localDirectives = 0, localNonOrdinary = 0;
    if (!constructions.length) warnings.push({ code: 'NO_CONSTRUCTION_REGISTRY', chunk: chunk.key, message: `Chunk ${chunk.key} built without buildingConstructionEngine records.` });
    for (const construction of constructions) {
      totalBuildings += 1;
      localFamilies.add(String(construction.architectureFamily ?? 'unknown'));
      localFlavors.add(String(construction.constructionFlavor ?? 'unknown'));
      increment(countBuckets.programArchitectures, construction.programArchitectureId);
      increment(countBuckets.architectureFamilies, construction.architectureFamily);
      increment(countBuckets.constructionFlavors, construction.constructionFlavor);
      increment(countBuckets.structuralSystems, construction.structuralSystem);
      increment(countBuckets.budgetClasses, construction.budgetClass);
      increment(countBuckets.throughputClasses, construction.throughputClass);
      increment(countBuckets.roofEdgeCharacters, construction.roofEdgeCharacter);
      increment(countBuckets.mezzaninePolicies, construction.allowedBehaviors?.mezzanine);
      increment(countBuckets.interiorClutterPolicies, construction.allowedBehaviors?.interiorClutter);
      increment(countBuckets.rooftopMechanicalPolicies, construction.allowedBehaviors?.rooftopMechanical);
      increment(countBuckets.crownPolicies, construction.allowedBehaviors?.crown);
      const parts = Math.max(0, Number(construction.parts) || 0);
      const faces = Math.max(0, Number(construction.faceCount) || 0);
      const semantic = Math.max(0, Number(construction.semanticFaceFloorCount) || 0);
      const directives = Array.isArray(construction.facadeDirectives) ? construction.facadeDirectives : [];
      totalParts += parts; localParts += parts; totalFaces += faces; totalSemantic += semantic; totalDirectives += directives.length; localDirectives += directives.length;
      if (!directives.length) warnings.push({ code: 'NO_FACADE_DIRECTIVES', chunk: chunk.key, constructionId: construction.id, message: `${construction.id} has no facade directives.` });
      if (!semantic && directives.length) warnings.push({ code: 'NO_SEMANTIC_FACADE_OWNERSHIP', chunk: chunk.key, constructionId: construction.id, message: `${construction.id} has facade directives but no semantic story-face ownership.` });
      if (parts > 1800) warnings.push({ code: 'HEAVY_CONSTRUCTION_ASSEMBLY', chunk: chunk.key, constructionId: construction.id, message: `${construction.id} emits ${parts} construction parts; inspect for unnecessary density.` });
      let constructionNonOrdinary = 0;
      for (const directive of directives) {
        increment(countBuckets.facadeLanguages, directive.facadeLanguage);
        increment(countBuckets.semanticRoles, directive.semanticRole ?? 'unowned');
        if (String(directive.facadeLanguage ?? 'ordinary') !== 'ordinary') { nonOrdinary += 1; localNonOrdinary += 1; constructionNonOrdinary += 1; }
      }
      if (directives.length >= 8 && constructionNonOrdinary === 0) warnings.push({ code: 'SEMANTIC_FACADE_COLLAPSE', chunk: chunk.key, constructionId: construction.id, message: `${construction.id} has ${directives.length} story-face directives but all resolved to ordinary facade language.` });
    }
    rows.push({
      chunk: chunk.key, buildings: constructions.length, uniqueFamilies: localFamilies.size, uniqueFlavors: localFlavors.size,
      parts: localParts, facadeDirectives: localDirectives, nonOrdinaryFacadeShare: localDirectives ? localNonOrdinary / localDirectives : 0, buildMs,
    });
    process.stdout.write(`chunk ${chunk.key} buildings=${constructions.length} families=${localFamilies.size} flavors=${localFlavors.size} parts=${localParts} semanticFacade=${pct(localDirectives ? localNonOrdinary / localDirectives : 0)} build=${buildMs.toFixed(1)}ms\n`);
  } catch (error) {
    warnings.push({ code: 'CHUNK_BUILD_FAILED', chunk: chunk.key, message: `${chunk.key}: ${error?.stack ?? error}` });
    rows.push({ chunk: chunk.key, buildings: 0, uniqueFamilies: 0, uniqueFlavors: 0, parts: 0, facadeDirectives: 0, nonOrdinaryFacadeShare: 0, buildMs: performance.now() - started, failed: true });
  } finally {
    if (payload) { try { await engine.unload?.(chunk, payload); } catch {} }
  }
}
engine.disposeShared?.();

for (const key of Object.keys(countBuckets)) countBuckets[key] = orderedCounts(countBuckets[key]);
const report = {
  schema: ARCHITECTURE_OBSERVATORY_SCHEMA,
  seed: worldSeed,
  source: { repo, chunkSize, landmarkSpacingChunks, registry: 'physics.buildingConstructionEngine' },
  chunks: rows,
  totals: {
    buildings: totalBuildings, parts: totalParts, faces: totalFaces, facadeDirectives: totalDirectives, semanticFaceFloors: totalSemantic,
    nonOrdinaryFacadeShare: totalDirectives ? nonOrdinary / totalDirectives : 0,
    uniqueFamilies: Object.keys(countBuckets.architectureFamilies).length,
    uniqueFlavors: Object.keys(countBuckets.constructionFlavors).length,
    uniqueStructuralSystems: Object.keys(countBuckets.structuralSystems).length,
    averagePartsPerBuilding: totalBuildings ? totalParts / totalBuildings : 0,
    buildMs: totalBuildMs,
  },
  counts: countBuckets,
  warnings,
};
if (totalBuildings >= 8 && report.totals.uniqueFamilies < 3) warnings.push({ code: 'LOW_FAMILY_DIVERSITY', message: `${totalBuildings} sampled buildings collapsed to only ${report.totals.uniqueFamilies} architecture families.` });
if (totalBuildings >= 8 && report.totals.uniqueFlavors < 4) warnings.push({ code: 'LOW_FLAVOR_DIVERSITY', message: `${totalBuildings} sampled buildings collapsed to only ${report.totals.uniqueFlavors} construction flavors.` });

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'architecture-observatory.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(out, 'ARCHITECTURE-OBSERVATORY.md'), renderMarkdown(report));
console.log(JSON.stringify({ pass: !warnings.some(item => item.code === 'CHUNK_BUILD_FAILED'), out, totals: report.totals, warnings: warnings.length }, null, 2));
if (warnings.some(item => item.code === 'CHUNK_BUILD_FAILED')) process.exitCode = 2;
