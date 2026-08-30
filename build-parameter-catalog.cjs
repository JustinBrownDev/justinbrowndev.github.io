#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const root = __dirname;
const targets = [
  { file: 'main.js', scope: 'main', importPath: './numeric-parameters.js', hasParamImport: true },
  { file: 'player-physics.js', scope: 'physics', importPath: './numeric-parameters.js' },
  { file: 'city-performance.js', scope: 'perf', importPath: './numeric-parameters.js' },
  { file: 'vendor/city-pack/asset-catalog.js', scope: 'assets', importPath: '../../numeric-parameters.js' },
];
const catalog = [];
const usedKeys = new Set();

function propertyNameNode(parent, node) {
  return !!parent && parent.name === node && (
    ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) ||
    ts.isPropertyDeclaration(parent)
  );
}
function functionContext(node, sf) {
  let p = node.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p)) return p.name?.getText(sf) || '<function>';
    if (ts.isMethodDeclaration(p)) return p.name?.getText(sf) || '<method>';
    if (ts.isConstructorDeclaration(p)) return 'constructor';
    if (ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) return p.name?.getText(sf) || '<accessor>';
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      const q = p.parent;
      if (ts.isVariableDeclaration(q)) return q.name.getText(sf);
      if (ts.isPropertyAssignment(q)) return q.name.getText(sf);
      return '<callback>';
    }
    p = p.parent;
  }
  return null;
}
function assetContext(node, sf) {
  let p = node.parent, propName = null;
  while (p) {
    if (!propName && ts.isPropertyAssignment(p)) propName = p.name.getText(sf).replace(/^['"]|['"]$/g, '');
    if (ts.isObjectLiteralExpression(p)) {
      let id = null;
      for (const prop of p.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sf).replace(/^['"]|['"]$/g, '') === 'id' && ts.isStringLiteral(prop.initializer)) {
          id = prop.initializer.text; break;
        }
      }
      if (id) return `${id}${propName ? ' · ' + propName : ''}`;
    }
    p = p.parent;
  }
  return null;
}
function nearestNamedContext(node, sf) {
  const fn = functionContext(node, sf); if (fn) return fn;
  let p = node.parent;
  while (p) {
    if (ts.isVariableDeclaration(p)) return p.name.getText(sf);
    if (ts.isPropertyAssignment(p)) return p.name.getText(sf);
    p = p.parent;
  }
  return '<top-level>';
}
function snippetAt(source, start) {
  let a = source.lastIndexOf('\n', start - 1) + 1;
  let b = source.indexOf('\n', start); if (b < 0) b = source.length;
  const whole = source.slice(a, b).trim();
  if (whole.length <= 180) return whole;
  const rel = Math.max(0, start - a);
  const lo = Math.max(0, rel - 80), hi = Math.min(whole.length, rel + 100);
  return (lo ? '…' : '') + whole.slice(lo, hi) + (hi < whole.length ? '…' : '');
}
function stableKey(scope, descriptor) {
  let salt = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(descriptor + (salt ? `|collision:${salt}` : '')).digest('hex').slice(0, 12);
    const key = `n.${scope}.${hash}`;
    if (!usedKeys.has(key)) { usedKeys.add(key); return key; }
    salt++;
  }
}

function transformTarget(target) {
  const filePath = path.join(root, target.file);
  let source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('// @quantitative-parameterized')) throw new Error(`${target.file} already parameterized`);
  const sf = ts.createSourceFile(target.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let configInit = null;
  if (target.scope === 'main') {
    for (const st of sf.statements) if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (d.name.getText(sf) === 'CONFIG') configInit = d.initializer;
  }
  const candidates = [], signedOperands = new Set();
  function visit(node) {
    if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) && ts.isNumericLiteral(node.operand)) {
      const inside = configInit && node.pos >= configInit.pos && node.end <= configInit.end;
      if (!inside) { candidates.push({ node, isPropertyName: false }); signedOperands.add(node.operand); }
      return;
    }
    if (ts.isNumericLiteral(node) && !signedOperands.has(node)) {
      const inside = configInit && node.pos >= configInit.pos && node.end <= configInit.end;
      const prop = propertyNameNode(node.parent, node);
      if (!inside || prop) candidates.push({ node, isPropertyName: prop });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  candidates.sort((a,b)=>a.node.getStart(sf)-b.node.getStart(sf));
  const signatureCounts = new Map(), edits = [], declarations = [], liveCases = [];
  candidates.forEach((c,index)=>{
    const start=c.node.getStart(sf), end=c.node.end, raw=source.slice(start,end);
    const context=target.scope==='assets' ? (assetContext(c.node,sf)||nearestNamedContext(c.node,sf)) : nearestNamedContext(c.node,sf);
    const snippet=snippetAt(source,start);
    const baseSig=`${target.file}|${context}|${snippet}|${raw}`;
    const occ=signatureCounts.get(baseSig)||0; signatureCounts.set(baseSig,occ+1);
    const key=stableKey(target.scope,`${baseSig}|occ:${occ}`);
    const varName=`__qp${index}`;
    const runtimeMutable=!!functionContext(c.node,sf);
    const loc=sf.getLineAndCharacterOfPosition(start);
    const format=/^[-+]?0x/i.test(raw)?'hex':'number';
    catalog.push([key,target.scope,target.file,loc.line+1,loc.character+1,context,snippet,format,runtimeMutable?1:0]);
    declarations.push(`let ${varName}=parameterNumber(${JSON.stringify(key)},${raw},${runtimeMutable?'true':'false'},${JSON.stringify(target.scope)},${index});`);
    if(runtimeMutable) liveCases.push(`case ${index}:${varName}=value;return true;`);
    edits.push({start,end,replacement:c.isPropertyName?`[${varName}]`:varName});
  });
  for(let i=edits.length-1;i>=0;i--){const e=edits[i];source=source.slice(0,e.start)+e.replacement+source.slice(e.end);}
  let insertAt=0; for(const st of sf.statements){if(ts.isImportDeclaration(st))insertAt=st.end;else break;}
  const importText=target.hasParamImport?'':`\nimport { parameterNumber${liveCases.length?', registerLiteralScope':''} } from ${JSON.stringify(target.importPath)};`;
  const setter=liveCases.length?`\nfunction __setQuantitativeLiteral(index,value){switch(index){${liveCases.join('')}default:return false;}}\nregisterLiteralScope(${JSON.stringify(target.scope)},__setQuantitativeLiteral);`:'';
  const block=`${importText}\n// @quantitative-parameterized -- generated; edit build-parameter-catalog.cjs to rebuild\n${declarations.join('\n')}${setter}\n`;
  source=source.slice(0,insertAt)+block+source.slice(insertAt);
  fs.writeFileSync(filePath,source);
  return {count:candidates.length,live:liveCases.length};
}
const results={}; for(const target of targets) results[target.file]=transformTarget(target);
const catalogPath=path.join(root,'parameter-catalog.js');
fs.writeFileSync(catalogPath,`// Generated, lazy-loaded only when P opens.\n// Row: [key, scope, file, authoredLine, column, context, snippet, format, runtimeMutable]\nexport const LITERAL_PARAMETER_CATALOG=${JSON.stringify(catalog)};\n`);
const schemaHash=crypto.createHash('sha256').update(catalog.map(r=>r[0]).join('\n')).digest('hex').slice(0,16);
fs.writeFileSync(path.join(root,'parameter-schema.js'),`export const PARAMETER_SCHEMA=${JSON.stringify(schemaHash)};\nexport const PARAMETER_LITERAL_COUNT=${catalog.length};\n`);
console.log(JSON.stringify({results,catalogEntries:catalog.length,catalogBytes:fs.statSync(catalogPath).size,schemaHash},null,2));
