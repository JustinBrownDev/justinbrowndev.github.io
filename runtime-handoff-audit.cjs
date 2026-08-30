const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const fs = require('fs');
const file = process.argv[2] || 'main.js';
const source = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const options = { allowJs: true, checkJs: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, noResolve: true };
const host = ts.createCompilerHost(options, true);
host.getSourceFile = (name, lang) => name === file ? ts.createSourceFile(name, source, lang, true, ts.ScriptKind.JS) : undefined;
host.readFile = name => name === file ? source : undefined;
host.fileExists = name => name === file;
const program = ts.createProgram([file], options, host);
const psf = program.getSourceFile(file);
const checker = program.getTypeChecker();
const line = node => psf.getLineAndCharacterOfPosition(node.getStart(psf)).line + 1;

const lexical = new Map();
const fnBySymbol = new Map();
const fnLabel = new Map();
for (const st of psf.statements) {
  if (ts.isVariableStatement(st)) {
    const lexicalKind = (st.declarationList.flags & ts.NodeFlags.Const) ? 'const'
      : (st.declarationList.flags & ts.NodeFlags.Let) ? 'let' : null;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) continue;
      const sym = checker.getSymbolAtLocation(d.name);
      if (!sym) continue;
      if (lexicalKind) lexical.set(sym, { name: d.name.text, pos: st.getStart(psf), line: line(d), kind: lexicalKind });
      if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
        fnBySymbol.set(sym, d.initializer);
        fnLabel.set(d.initializer, d.name.text);
      }
    }
  }
  if (ts.isFunctionDeclaration(st) && st.name) {
    const sym = checker.getSymbolAtLocation(st.name);
    if (sym) { fnBySymbol.set(sym, st); fnLabel.set(st, st.name.text); }
  }
}

function resolveFn(expr) {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  const sym = checker.getSymbolAtLocation(expr);
  if (!sym) return null;
  return fnBySymbol.get(sym) || null;
}

let handoffCall = null;
for (const st of psf.statements) {
  if (!ts.isExpressionStatement(st) || !ts.isCallExpression(st.expression)) continue;
  const expr = st.expression.expression;
  if (ts.isIdentifier(expr) && expr.text === 'animate') { handoffCall = st; break; }
}
if (!handoffCall) throw new Error('animate() handoff call not found');
const handoffPos = handoffCall.getStart(psf);
const animateFn = [...fnLabel.entries()].find(([, name]) => name === 'animate')?.[0];
if (!animateFn) throw new Error('animate function not found');

const hazards = [];
const seenHazards = new Set();
function inspectFunction(fn, stack, visited) {
  if (!fn || visited.has(fn)) return;
  visited.add(fn);
  const label = fnLabel.get(fn) || `<anon@${line(fn)}>`;
  const path = [...stack, label];
  function walk(node) {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isIdentifier(node)) {
      const sym = checker.getSymbolAtLocation(node);
      const decl = lexical.get(sym);
      if (decl && decl.pos > handoffPos) {
        const key = `${label}:${node.text}:${line(node)}:${decl.line}`;
        if (!seenHazards.has(key)) {
          seenHazards.add(key);
          hazards.push({ callPath: path.join(' -> '), ref: node.text, refLine: line(node), declLine: decl.line, kind: decl.kind });
        }
      }
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const child = resolveFn(node.expression);
      if (child) inspectFunction(child, path, visited);
    }
    ts.forEachChild(node, walk);
  }
  walk(fn);
}
inspectFunction(animateFn, [], new Set());
console.log(JSON.stringify({ handoffLine: line(handoffCall), hazards }, null, 2));
process.exitCode = hazards.length ? 2 : 0;
