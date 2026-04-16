#!/usr/bin/env node
/**
 * TavernShelf full project audit
 * Run before EVERY zip/push — no exceptions
 *
 * Checks:
 * 1. Backend syntax (node --check every .js file)
 * 2. Backend static import/export consistency
 * 3. Backend route presence (16 critical routes)
 * 4. Backend route ordering (specific before wildcard)
 * 5. Frontend API call paths vs backend routes
 * 6. Frontend JSX structural checks
 * 7. Frontend state checks (undeclared setters, missing useApi exports)
 * 8. Cross-file: every useApi() call verified against useApi exports
 * 9. Version consistency across 4 files
 * 10. Docs updated
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const base = '/home/claude/tavernshelf';
let allOk  = true;
const fail = (msg) => { console.log('❌  ' + msg); allOk = false; };
const pass = (msg) => console.log('✓   ' + msg);
const warn = (msg) => console.log('⚠   ' + msg);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Backend syntax
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 1. Backend syntax ───────────────────────────────────');
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
    fail(path.relative(base, f) + '\n      ' + e.stderr?.toString().trim().split('\n')[0]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Backend static import/export consistency
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 2. Backend import/export consistency ────────────────');
const exportMap = {};
for (const f of beFiles) {
  const code = fs.readFileSync(f, 'utf8');
  exportMap[f] = [
    ...[...code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(m => m[1]),
    ...[...code.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)].map(m => m[1]),
    ...[...code.matchAll(/^export\s+\{([^}]+)\}/gm)].flatMap(m => m[1].split(',').map(s => s.trim().split(' as ')[0].trim())),
  ];
}

for (const f of beFiles) {
  const code = fs.readFileSync(f, 'utf8');
  const rel  = path.relative(base, f);
  const issues = [];
  for (const match of [...code.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm)]) {
    const names   = match[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean);
    const fromRaw = match[2];
    if (!fromRaw.startsWith('.')) continue;
    const fromAbs = path.resolve(path.dirname(f), fromRaw.replace(/\.js$/, '') + '.js');
    if (!fs.existsSync(fromAbs)) { issues.push(`IMPORT FILE NOT FOUND: ${fromRaw}`); continue; }
    const available = exportMap[fromAbs] || [];
    for (const name of names) {
      if (available.length > 0 && !available.includes(name))
        issues.push(`'${name}' NOT exported by ${path.basename(fromAbs)}`);
    }
  }
  if (issues.length) issues.forEach(i => fail(rel + ': ' + i));
  else pass(rel);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backend route presence
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 3. Backend route presence ───────────────────────────');
const routeChecks = [
  ['backend/src/routes/uploads.js', "PUT /:id",           "router.put('/:id'"],
  ['backend/src/routes/uploads.js', "POST /bulk",          "router.post('/bulk'"],
  ['backend/src/routes/uploads.js', "POST /bulk-approve",  "router.post('/bulk-approve'"],
  ['backend/src/routes/uploads.js', "POST /:id/approve",   "router.post('/:id/approve'"],
  ['backend/src/routes/uploads.js', "POST /:id/reject",    "router.post('/:id/reject'"],
  ['backend/src/routes/library.js', "GET /items",          "router.get('/items'"],
  ['backend/src/routes/library.js', "GET /overview",       "router.get('/overview'"],
  ['backend/src/routes/library.js', "GET /folders",        "router.get('/folders'"],
  ['backend/src/routes/library.js', "PUT /items/:id/metadata",         "router.put('/items/:id/metadata'"],
  ['backend/src/routes/library.js', "POST /items/:id/cover/extract",   "router.post('/items/:id/cover/extract'"],
  ['backend/src/routes/library.js', "POST /items/:id/move",            "router.post('/items/:id/move'"],
  ['backend/src/routes/library.js', "GET /items/:id/modules",          "router.get('/items/:id/modules'"],
  ['backend/src/routes/library.js', "PUT /items/:id/modules",          "router.put('/items/:id/modules'"],
  ['backend/src/routes/library.js', "POST /items/:id/metadata/search", "router.post('/items/:id/metadata/search'"],
  ['backend/src/routes/admin.js',   "GET /logs/stream",   "router.get('/logs/stream'"],
  ['backend/src/routes/admin.js',   "GET /logs/recent",   "router.get('/logs/recent'"],
  ['backend/src/routes/admin.js',   "PUT /settings",      "router.put('/settings'"],
  ['backend/src/routes/auth.js',    "POST /login",        "router.post('/login'"],
];
for (const [file, desc, pattern] of routeChecks) {
  const code = fs.readFileSync(path.join(base, file), 'utf8');
  if (!code.includes(pattern)) fail(`${path.basename(file)}: MISSING — ${desc}`);
  else pass(`${path.basename(file)}: ${desc}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Backend route ordering (specific routes must come before wildcards)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 4. Backend route ordering ───────────────────────────');
const orderChecks = [
  // [file, specific pattern must appear BEFORE wildcard pattern]
  ['backend/src/routes/uploads.js', "router.post('/bulk'",         "router.post('/:id/approve'",   "POST /bulk before POST /:id/approve"],
  ['backend/src/routes/uploads.js', "router.post('/bulk-approve'", "router.post('/:id/approve'",   "POST /bulk-approve before POST /:id/approve"],
  ['backend/src/routes/uploads.js', "router.put('/:id'",           "router.post('/:id/approve'",   "PUT /:id before POST /:id/approve (ordering sanity)"],
  ['backend/src/routes/admin.js',   "router.get('/logs/recent'",   "router.get('/logs/:filename'", "GET /logs/recent before GET /logs/:filename"],
  ['backend/src/routes/admin.js',   "router.get('/logs/stream'",   "router.get('/logs/:filename'", "GET /logs/stream before GET /logs/:filename"],
];
for (const [file, specificPat, wildcardPat, desc] of orderChecks) {
  const code = fs.readFileSync(path.join(base, file), 'utf8');
  const specificIdx = code.indexOf(specificPat);
  const wildcardIdx = code.indexOf(wildcardPat);
  if (specificIdx === -1) { fail(`${path.basename(file)}: missing '${specificPat}' (ordering check)`); }
  else if (wildcardIdx === -1) { pass(`${path.basename(file)}: ${desc} (wildcard not present)`); }
  else if (specificIdx < wildcardIdx) { pass(`${path.basename(file)}: ${desc}`); }
  else { fail(`${path.basename(file)}: WRONG ORDER — ${desc} (specific route appears AFTER wildcard — will be shadowed)`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Frontend API calls vs backend routes
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 5. Frontend API calls vs backend routes ─────────────');

// Build a map of all backend routes by prefix
const routeFiles = {
  '/library': fs.readFileSync(path.join(base, 'backend/src/routes/library.js'), 'utf8'),
  '/uploads': fs.readFileSync(path.join(base, 'backend/src/routes/uploads.js'), 'utf8'),
  '/admin':   fs.readFileSync(path.join(base, 'backend/src/routes/admin.js'), 'utf8'),
  '/auth':    fs.readFileSync(path.join(base, 'backend/src/routes/auth.js'), 'utf8'),
  '/campaigns': fs.readFileSync(path.join(base, 'backend/src/routes/campaigns.js'), 'utf8'),
};

// Extract all frontend API calls
const jsxDirs = ['frontend/src/pages', 'frontend/src/components'];
const jsxExtras = ['frontend/src/App.jsx','frontend/src/hooks/useApi.js','frontend/src/context/AuthContext.jsx'];
let jsxFiles = jsxExtras.map(f => path.join(base, f));
for (const dir of jsxDirs) {
  const full = path.join(base, dir);
  jsxFiles.push(...fs.readdirSync(full).filter(f => f.endsWith('.jsx') || f.endsWith('.js')).map(f => path.join(full, f)));
}

// Known dynamic path segments that can't be statically resolved
const dynamicOk = new Set([
  '/library/items',     // :id variants
  '/uploads',           // :id variants
  '/admin/logs',        // :filename variants
  '/auth/invites',      // :token variants
  '/campaigns',         // :id variants
]);

let apiCallIssues = 0;
for (const file of jsxFiles) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const rel  = path.relative(base, file);

  // Extract API calls: get('/path'), post('/path'), put('/path'), del('/path')
  // Only match literal path strings starting with / (not query params or template literals)
  const apiCalls = [...code.matchAll(/\b(?:get|post|put|del)\('(\/[a-zA-Z][^']*)'\)/g)].map(m => m[1])
    .filter(p => p.startsWith('/') && !p.includes('${') && p.split('/').length >= 2)
    .filter(p => p !== '/health'); // registered directly in index.js not a route file

  for (const apiPath of apiCalls) {
    // Determine which route file handles this
    let matched = false;
    for (const [prefix, routeCode] of Object.entries(routeFiles)) {
      if (!apiPath.startsWith(prefix.replace('/api', ''))) continue;
      // Specific static paths: check the route file contains a pattern
      const subPath = apiPath.slice(prefix.length) || '/';
      // Dynamic segments - skip deep checking
      if (subPath.includes('${') || subPath.includes('`')) { matched = true; break; }
      // Check if something resembling this path exists
      const pathParts = subPath.split('/').filter(Boolean);
      if (pathParts.length === 0) { matched = true; break; }
      // Look for the literal path or a parameterized version
      const escaped = pathParts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`router\\.(?:get|post|put|delete)\\(['"]/${escaped}`);
      if (re.test(routeCode)) { matched = true; break; }
      // Dynamic param match e.g. /:id
      if (routeCode.includes(`router.get('/:`) || routeCode.includes(`router.post('/:`)) { matched = true; break; }
    }
    if (!matched) {
      // Suppress known dynamic paths
      const isDynamic = [...dynamicOk].some(d => apiPath.startsWith(d));
      if (!isDynamic) {
        warn(`${rel}: API call '${apiPath}' — no matching backend route found`);
        apiCallIssues++;
      }
    }
  }
}
if (apiCallIssues === 0) pass('All static frontend API calls have matching backend routes');

// ─────────────────────────────────────────────────────────────────────────────
// 6. Frontend JSX structural checks
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 6. Frontend JSX structure ───────────────────────────');

// useApi exports
const useApiCode = fs.readFileSync(path.join(base, 'frontend/src/hooks/useApi.js'), 'utf8');
const useApiExports = new Set((useApiCode.match(/return \{([^}]+)\}/) || ['',''])[1]
  .split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean));

for (const file of jsxFiles) {
  if (!fs.existsSync(file)) continue;
  const code   = fs.readFileSync(file, 'utf8');
  const name   = path.relative(base, file);
  const issues = [];

  // Duplicate top-level function names
  const fns   = [...code.matchAll(/^function (\w+)/gm)].map(m => m[1]);
  const dupes = fns.filter((f, i) => fns.indexOf(f) !== i);
  if (dupes.length) issues.push('DUPLICATE FUNCTIONS: ' + dupes.join(', '));

  // Duplicate imports from same source
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

  // Ternary branch siblings without fragment
  if (/\) : \(\s*\n\s*\{[^\n]*\}\s*\n\s*</.test(code))
    issues.push('POSSIBLE: sibling JSX in ternary branch without fragment');

  // Stale patterns
  if (code.includes('setModulePrompt'))  issues.push('STALE: setModulePrompt');
  if (/\bvar\(--purple\)/.test(code))    issues.push('STALE: var(--purple)');

  if (issues.length) { issues.forEach(i => fail(name + ': ' + i)); }
  else pass(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Frontend state integrity
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 7. Frontend state integrity ─────────────────────────');
for (const file of jsxFiles) {
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const name = path.relative(base, file);
  const issues = [];

  // useState setters: every setter used must be declared in same file
  const declared  = new Set([...code.matchAll(/\[\s*\w+\s*,\s*(set[A-Z]\w+)\s*\]\s*=\s*useState/g)].map(m => m[1]));
  const builtins  = new Set(['setSearchParams','setTimeout','setInterval','setRequestHeader','setItem']);
  const used      = [...new Set([...code.matchAll(/\b(set[A-Z]\w+)\b/g)].map(m => m[1]))];
  const undeclared = used.filter(s => !declared.has(s) && !builtins.has(s));
  if (undeclared.length) issues.push('UNDECLARED SETTERS: ' + undeclared.join(', '));

  // useApi destructuring: every name must exist in useApi return
  const apiDestructures = [...code.matchAll(/const\s+\{([^}]+)\}\s*=\s*useApi\(\)/g)];
  for (const match of apiDestructures) {
    const names = match[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
    for (const n of names) {
      if (!useApiExports.has(n)) issues.push(`useApi() destructures '${n}' but useApi doesn't export it`);
    }
  }

  if (issues.length) { issues.forEach(i => fail(name + ': ' + i)); }
  else pass(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Cross-file: key UI state references
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 8. Cross-file references ────────────────────────────');

// Check that components imported in App.jsx actually exist as files
const appCode = fs.readFileSync(path.join(base, 'frontend/src/App.jsx'), 'utf8');
const pageImports = [...appCode.matchAll(/import\s+\w+\s+from\s+'([^']+)'/g)].map(m => m[1]);
for (const imp of pageImports) {
  const candidates = [
    path.resolve(path.join(base, 'frontend/src'), imp),
    path.resolve(path.join(base, 'frontend/src'), imp + '.jsx'),
    path.resolve(path.join(base, 'frontend/src'), imp + '.js'),
  ];
  if (!candidates.some(fs.existsSync)) {
    fail(`App.jsx imports '${imp}' — file not found`);
  } else {
    pass(`App.jsx: ${imp}`);
  }
}

// Check backend config exports are used consistently
const configCode    = fs.readFileSync(path.join(base, 'backend/src/config.js'), 'utf8');
const configExports = [...configCode.matchAll(/^export const (\w+)/gm)].map(m => m[1]);
pass(`config.js exports: ${configExports.join(', ')}`);

// ─────────────────────────────────────────────────────────────────────────────
// 9. Version consistency
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 9. Version consistency ──────────────────────────────');
const pkgVersion = JSON.parse(fs.readFileSync(path.join(base, 'backend/package.json'), 'utf8')).version;
const layoutCode = fs.readFileSync(path.join(base, 'frontend/src/components/Layout.jsx'), 'utf8');
const indexCode  = fs.readFileSync(path.join(base, 'backend/src/index.js'), 'utf8');
const dcCode     = fs.readFileSync(path.join(base, 'docker-compose.yml'), 'utf8');
const layoutVer  = (layoutCode.match(/const VERSION = '([^']+)'/)    || [])[1];
const indexVer   = (indexCode.match(/TavernShelf v([0-9.]+) starting/) || [])[1];
const dcVer      = (dcCode.match(/tavernshelf:([0-9.]+)/)             || [])[1];
if (layoutVer !== pkgVersion) fail(`Layout VERSION '${layoutVer}' ≠ package.json '${pkgVersion}'`);
else pass(`Layout: v${layoutVer}`);
if (indexVer !== pkgVersion)  fail(`index.js version '${indexVer}' ≠ package.json '${pkgVersion}'`);
else pass(`index.js: v${indexVer}`);
if (dcVer !== pkgVersion)     fail(`docker-compose '${dcVer}' ≠ package.json '${pkgVersion}'`);
else pass(`docker-compose: v${dcVer}`);

// ─────────────────────────────────────────────────────────────────────────────
// 10. Docs
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── 10. Docs ─────────────────────────────────────────────');
const changelog = fs.readFileSync(path.join(base, 'CHANGELOG.md'), 'utf8');
const readme    = fs.readFileSync(path.join(base, 'README.md'), 'utf8');
if (!changelog.includes(`## [${pkgVersion}]`)) fail(`CHANGELOG missing ## [${pkgVersion}]`);
else pass(`CHANGELOG has [${pkgVersion}]`);
if (!readme.includes(pkgVersion)) fail(`README missing ${pkgVersion}`);
else pass(`README has ${pkgVersion}`);

// ─────────────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(55));
if (allOk) {
  console.log('✅  ALL CLEAR — safe to push');
} else {
  console.log('❌  ISSUES FOUND — DO NOT PUSH');
  process.exit(1);
}
