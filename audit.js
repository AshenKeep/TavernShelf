#!/usr/bin/env node
/**
 * TavernShelf full project audit
 * Run before EVERY zip/push — no exceptions
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const base = '/home/claude/tavernshelf';
let allOk = true;
const fail = (msg) => { console.log('❌ ' + msg); allOk = false; };
const pass = (msg) => console.log('✓  ' + msg);

// ── 1. Backend syntax check (node --check) ──────────────────────────────────
console.log('\n── Backend syntax ──────────────────────────────────────');
const beFiles = [];
const walkDir = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walkDir(full);
    else if (f.endsWith('.js') && !full.includes('node_modules')) beFiles.push(full);
  }
};
walkDir(path.join(base, 'backend/src'));

for (const f of beFiles) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
    pass(path.relative(base, f));
  } catch (e) {
    fail(path.relative(base, f) + '\n    ' + e.stderr?.toString().trim().split('\n')[0]);
  }
}

// ── 2. Backend import/export consistency ────────────────────────────────────
console.log('\n── Backend import/export consistency ───────────────────');

// Build export map: for each backend file, what does it export?
const exportMap = {};
for (const f of beFiles) {
  const code = fs.readFileSync(f, 'utf8');
  const exports = [
    ...[...code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(m => m[1]),
    ...[...code.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)].map(m => m[1]),
    ...[...code.matchAll(/^export\s+\{([^}]+)\}/gm)].flatMap(m => m[1].split(',').map(s => s.trim().split(' as ')[0].trim())),
  ];
  exportMap[f] = exports;
}

// For each backend file, check every named import resolves to an actual export
for (const f of beFiles) {
  const code = fs.readFileSync(f, 'utf8');
  const rel  = path.relative(base, f);
  const fileIssues = [];

  const importLines = [...code.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm)];
  for (const match of importLines) {
    const names   = match[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean);
    const fromRaw = match[2];
    if (!fromRaw.startsWith('.')) continue; // skip node_modules

    const fromAbs = path.resolve(path.dirname(f), fromRaw.replace(/\.js$/, '') + '.js');
    if (!fs.existsSync(fromAbs)) {
      fileIssues.push(`IMPORT NOT FOUND: ${fromRaw}`);
      continue;
    }

    const available = exportMap[fromAbs] || [];
    for (const name of names) {
      if (available.length > 0 && !available.includes(name)) {
        fileIssues.push(`'${name}' imported from ${path.basename(fromAbs)} but NOT exported there`);
      }
    }
  }

  if (fileIssues.length) fileIssues.forEach(i => fail(rel + ': ' + i));
  else pass(rel);
}


// ── 3. Frontend JSX checks ───────────────────────────────────────────────────
console.log('\n── Frontend JSX ────────────────────────────────────────');
const jsxDirs   = ['frontend/src/pages', 'frontend/src/components'];
const jsxExtras = ['frontend/src/App.jsx','frontend/src/main.jsx','frontend/src/hooks/useApi.js','frontend/src/context/AuthContext.jsx'];
let jsxFiles = jsxExtras.map(f => path.join(base, f));
for (const dir of jsxDirs) {
  const full = path.join(base, dir);
  jsxFiles.push(...fs.readdirSync(full).filter(f => f.endsWith('.jsx') || f.endsWith('.js')).map(f => path.join(full, f)));
}

for (const file of jsxFiles) {
  if (!fs.existsSync(file)) continue;
  const code   = fs.readFileSync(file, 'utf8');
  const name   = path.relative(base, file);
  const issues = [];

  // Duplicate top-level function names
  const fns   = [...code.matchAll(/^function (\w+)/gm)].map(m => m[1]);
  const dupes = fns.filter((f, i) => fns.indexOf(f) !== i);
  if (dupes.length) issues.push('DUPLICATE FUNCTIONS: ' + dupes.join(', '));

  // useState setter declared vs used
  const declared  = new Set([...code.matchAll(/\[\s*\w+\s*,\s*(set[A-Z]\w+)\s*\]\s*=\s*useState/g)].map(m => m[1]));
  const builtins  = new Set(['setSearchParams','setTimeout','setInterval','setRequestHeader','setItem']);
  const used      = [...new Set([...code.matchAll(/\b(set[A-Z]\w+)\b/g)].map(m => m[1]))];
  const undeclared = used.filter(s => !declared.has(s) && !builtins.has(s));
  if (undeclared.length) issues.push('UNDECLARED SETTERS: ' + undeclared.join(', '));

  // Stale patterns
  if (code.includes('setModulePrompt'))  issues.push('STALE: setModulePrompt');
  if (/\bvar\(--purple\)/.test(code))    issues.push('STALE: var(--purple)');
  if (code.includes("'badge-purple'") && !file.includes('index.css')) issues.push('STALE: badge-purple');

  // Duplicate imports
  const imports    = [...code.matchAll(/^import .+ from ['"](.+)['"]/gm)].map(m => m[1]);
  const dupImports = imports.filter((f, i) => imports.indexOf(f) !== i);
  if (dupImports.length) issues.push('DUPLICATE IMPORTS: ' + dupImports.join(', '));

  // Fragment balance
  if (code.includes('return (')) {
    const opens  = (code.match(/<>/g)  || []).length;
    const closes = (code.match(/<\/>/g) || []).length;
    if (opens !== closes) issues.push(`FRAGMENT MISMATCH: ${opens} <> vs ${closes} </>`);
  }

  // Duplicate tab renders
  const tabRenders = [...code.matchAll(/\{tab === '(\w+)'/g)].map(m => m[1]);
  const dupTabs    = tabRenders.filter((t, i) => tabRenders.indexOf(t) !== i);
  if (dupTabs.length) issues.push('DUPLICATE TAB RENDERS: ' + dupTabs.join(', '));

  // Ternary branch siblings without fragment (bare { and JSX siblings inside `( ... )` branch)
  const ternaryBranchBadSiblings = /\) : \(\s*\n\s*\{[^\n]*\}\s*\n\s*</.test(code);
  if (ternaryBranchBadSiblings) issues.push('POSSIBLE: sibling JSX in ternary branch without fragment');

  if (issues.length) { issues.forEach(i => fail(name + ': ' + i)); }
  else pass(name);
}

// ── 4. Version consistency ───────────────────────────────────────────────────
console.log('\n── Version consistency ─────────────────────────────────');
const pkgVersion = JSON.parse(fs.readFileSync(path.join(base, 'backend/package.json'), 'utf8')).version;
const layoutCode = fs.readFileSync(path.join(base, 'frontend/src/components/Layout.jsx'), 'utf8');
const indexCode  = fs.readFileSync(path.join(base, 'backend/src/index.js'), 'utf8');
const dcCode     = fs.readFileSync(path.join(base, 'docker-compose.yml'), 'utf8');

const layoutVer  = (layoutCode.match(/const VERSION = '([^']+)'/)  || [])[1];
const indexVer   = (indexCode.match(/TavernShelf v([0-9.]+) starting/) || [])[1];
const dcVer      = (dcCode.match(/tavernshelf:([0-9.]+)/) || [])[1];

if (layoutVer !== pkgVersion) fail(`Layout VERSION '${layoutVer}' ≠ package.json '${pkgVersion}'`);
else pass(`Layout version: v${layoutVer}`);
if (indexVer !== pkgVersion)  fail(`index.js version '${indexVer}' ≠ package.json '${pkgVersion}'`);
else pass(`index.js version: v${indexVer}`);
if (dcVer !== pkgVersion)     fail(`docker-compose version '${dcVer}' ≠ package.json '${pkgVersion}'`);
else pass(`docker-compose version: v${dcVer}`);

// ── 5. Docs updated ─────────────────────────────────────────────────────────
console.log('\n── Docs ────────────────────────────────────────────────');
const changelog = fs.readFileSync(path.join(base, 'CHANGELOG.md'), 'utf8');
const readme    = fs.readFileSync(path.join(base, 'README.md'), 'utf8');
if (!changelog.includes(`## [${pkgVersion}]`)) fail(`CHANGELOG missing ## [${pkgVersion}]`);
else pass(`CHANGELOG has [${pkgVersion}]`);
if (!readme.includes(pkgVersion)) fail(`README missing version ${pkgVersion}`);
else pass(`README has ${pkgVersion}`);

// ── Result ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(55));
if (allOk) {
  console.log('✅  ALL CLEAR — safe to push');
} else {
  console.log('❌  ISSUES FOUND — DO NOT PUSH');
  process.exit(1);
}
