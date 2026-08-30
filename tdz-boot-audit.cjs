const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const fs = require('fs');
const path = process.argv[2];
if (!path) throw new Error('usage: node tdz-boot-audit.cjs main.js');
const source = fs.readFileSync(path, 'utf8');
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const options = { allowJs: true, checkJs: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, noResolve: true };
const host = ts.createCompilerHost(options, true);
host.getSourceFile = (fileName, lang) => fileName === path ? ts.createSourceFile(fileName, source, lang, true, ts.ScriptKind.JS) : undefined;
host.readFile = f => f === path ? source : undefined;
host.fileExists = f => f === path;
const program = ts.createProgram([path], options, host);
const psf = program.getSourceFile(path);
const checker = program.getTypeChecker();
const line = node => psf.getLineAndCharacterOfPosition(node.getStart(psf)).line + 1;

// Top-level lexical declarations and their actual initialization positions.
const lexical = new Map();
for (const st of psf.statements) {
  if (!ts.isVariableStatement(st)) continue;
  const isConst = !!(st.declarationList.flags & ts.NodeFlags.Const);
  const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
  if (!isConst && !isLet) continue;
  for (const d of st.declarationList.declarations) {
    if (!ts.isIdentifier(d.name)) continue;
    const sym = checker.getSymbolAtLocation(d.name);
    if (sym) lexical.set(sym, { name: d.name.text, pos: st.getStart(psf), line: line(d), kind: isConst ? 'const' : 'let' });
  }
}

// Resolve top-level function declarations / function-valued variables.
const fnBySymbol = new Map();
const fnLabel = new Map();
function register(symNode, fnNode, label) {
  const sym = checker.getSymbolAtLocation(symNode);
  if (sym) { fnBySymbol.set(sym, fnNode); fnLabel.set(fnNode, label || sym.name); }
}
for (const st of psf.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) register(st.name, st, st.name.text);
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
    if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
      register(d.name, d.initializer, d.name.text);
    }
  }
}
function resolveFn(expr) {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  const sym = checker.getSymbolAtLocation(expr);
  if (!sym) return null;
  if (fnBySymbol.has(sym)) return fnBySymbol.get(sym);
  for (const d of sym.declarations || []) {
    if (ts.isFunctionDeclaration(d)) return d;
    if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
  }
  return null;
}

// Find the first render-loop scheduling point. Top-level statements before this are boot-time.
let bootEndPos = source.length;
for (const st of psf.statements) {
  const text = st.getText(psf);
  if (/requestAnimationFrame\s*\(/.test(text) && !ts.isFunctionDeclaration(st)) {
    bootEndPos = st.getStart(psf);
    break;
  }
}

// For each executable top-level statement during boot, follow synchronous local calls transitively.
// A function body is inspected, but nested function bodies are only entered if called separately.
const hazards = [];
const hazardKeys = new Set();
const rootsAudited = [];
function inspectFunction(fn, rootPos, rootLine, stack, visited) {
  if (!fn || visited.has(fn)) return;
  visited.add(fn);
  const label = fnLabel.get(fn) || `<anon@${line(fn)}>`;
  const nextStack = [...stack, label];
  function walk(n) {
    if (n !== fn && ts.isFunctionLike(n)) return;
    if (ts.isIdentifier(n)) {
      const sym = checker.getSymbolAtLocation(n);
      const decl = lexical.get(sym);
      if (decl && decl.pos > rootPos) {
        const key = `${rootLine}|${label}|${n.text}|${line(n)}|${decl.line}`;
        if (!hazardKeys.has(key)) {
          hazardKeys.add(key);
          hazards.push({ rootLine, callPath: nextStack.join(' -> '), function: label, ref: n.text, refLine: line(n), declLine: decl.line, kind: decl.kind });
        }
      }
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const callee = resolveFn(n.expression);
      if (callee) inspectFunction(callee, rootPos, rootLine, nextStack, visited);
    }
    ts.forEachChild(n, walk);
  }
  walk(fn);
}
function inspectRootStatement(st) {
  const rootPos = st.getStart(psf);
  const rootLine = line(st);
  const visited = new Set();
  let localCalls = 0;
  function walk(n) {
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) return;
    // Function-valued declarations are definitions, not executions.
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n !== st) return;
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const callee = resolveFn(n.expression);
      if (callee) { localCalls++; inspectFunction(callee, rootPos, rootLine, [], visited); }
    }
    ts.forEachChild(n, walk);
  }
  walk(st);
  if (localCalls) rootsAudited.push({ line: rootLine, calls: localCalls });
}
for (const st of psf.statements) {
  if (st.getStart(psf) >= bootEndPos) break;
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) continue;
  // Variable initializers execute at their own declaration and are safe with respect to themselves.
  inspectRootStatement(st);
}

hazards.sort((a,b) => a.rootLine-b.rootLine || a.declLine-b.declLine || a.refLine-b.refLine);
console.log(JSON.stringify({ bootEndLine: psf.getLineAndCharacterOfPosition(Math.min(bootEndPos, source.length-1)).line+1, executableRootsWithLocalCalls: rootsAudited.length, hazards }, null, 2));
process.exitCode = hazards.length ? 2 : 0;
