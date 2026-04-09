#!/usr/bin/env node
/**
 * fix-all-pages.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Run from your frontend/ folder:  node fix-all-pages.js
 *
 * What it does to every .js/.jsx file under src/app/:
 *
 *  1. Fixes hardcoded localhost:5000 → process.env.NEXT_PUBLIC_API_URL
 *  2. Removes the old inline `function Sidebar({ active }) { ... }` definition
 *  3. Adds the correct PatientSidebar or DoctorSidebar import
 *  4. Replaces <Sidebar active="..." /> with <PatientSidebar active="..." />
 *     or <DoctorSidebar active="..." />
 *  5. Adds missing auth utility imports (getToken, getUser, clearSession)
 *  6. Replaces raw localStorage.getItem('mc_token') with getToken('PATIENT')
 *     or getToken('DOCTOR') depending on the page path
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const FRONTEND_SRC = path.join(__dirname, 'src', 'app');

// ── Collect all JS/JSX files under src/app ───────────────────────────────────
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ── Determine role from file path ─────────────────────────────────────────────
function roleOf(filePath) {
  const rel = filePath.replace(FRONTEND_SRC, '');
  if (rel.startsWith('/doctor'))  return 'DOCTOR';
  if (rel.startsWith('/patient')) return 'PATIENT';
  return null;
}

// ── Remove the entire inline Sidebar function ─────────────────────────────────
// Handles both `function Sidebar(` and `const Sidebar =` patterns
function removeInlineSidebar(src) {
  // Match:  // ── Sidebar ... function Sidebar({ active }) { ... }
  // We find the function and remove it by counting braces
  const startPatterns = [
    /\n\/\/[^\n]*[Ss]idebar[^\n]*\n(function Sidebar\s*\(\s*\{)/,
    /(function Sidebar\s*\(\s*\{)/,
    /(const Sidebar\s*=\s*\([^)]*\)\s*=>?\s*\{)/,
  ];

  for (const pat of startPatterns) {
    const m = src.match(pat);
    if (!m) continue;

    const startIdx = src.indexOf(m[0]);
    if (startIdx === -1) continue;

    // Find the matching closing brace
    let depth = 0;
    let i = startIdx;
    let foundOpen = false;

    while (i < src.length) {
      if (src[i] === '{') { depth++; foundOpen = true; }
      if (src[i] === '}') { depth--; }
      if (foundOpen && depth === 0) {
        // Remove from startIdx to i+1
        src = src.slice(0, startIdx) + src.slice(i + 1);
        // Also remove a trailing blank line
        src = src.replace(/\n{3,}/g, '\n\n');
        break;
      }
      i++;
    }
    break;
  }
  return src;
}

// ── Add import after the last import line ─────────────────────────────────────
function addImportAfterLast(src, importLine) {
  // Find position of last import statement
  const lines = src.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImportIdx = i;
  }
  if (lastImportIdx === -1) {
    // No imports — add at top after 'use client'
    return src.replace(/'use client';?\n/, `'use client';\n${importLine}\n`);
  }
  lines.splice(lastImportIdx + 1, 0, importLine);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
let totalFixed = 0;

for (const file of walk(FRONTEND_SRC)) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  const role = roleOf(file);
  const rel  = file.replace(path.join(__dirname, 'src'), 'src');

  // Skip login pages and layout files
  if (/login|layout|loading|error|not-found/.test(path.basename(file))) continue;

  // ── 1. Fix localhost:5000 ──────────────────────────────────────────────────
  if (src.includes("'http://localhost:5000/api'") && !src.includes('NEXT_PUBLIC_API_URL')) {
    src = src.replace(
      /const API\s*=\s*'http:\/\/localhost:5000\/api'/g,
      "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'"
    );
    console.log(`  🔧 Fixed API URL: ${rel}`);
    changed = true;
  }

  // ── 2. Remove inline Sidebar function and add shared component ─────────────
  const hasSidebarDef = /function Sidebar\s*\(/.test(src) || /const Sidebar\s*=/.test(src);
  const hasSidebarUse = /<Sidebar\s+active=/.test(src) || src.includes('Sidebar is not defined');

  if ((hasSidebarDef || hasSidebarUse) && role) {
    const componentName = role === 'PATIENT' ? 'PatientSidebar' : 'DoctorSidebar';
    const importPath    = role === 'PATIENT'
      ? "@/components/PatientSidebar"
      : "@/components/DoctorSidebar";

    // Remove inline definition
    if (hasSidebarDef) {
      src = removeInlineSidebar(src);
      console.log(`  🗑  Removed inline Sidebar: ${rel}`);
    }

    // Add import if missing
    if (!src.includes(importPath)) {
      src = addImportAfterLast(src, `import ${componentName} from '${importPath}';`);
      console.log(`  ➕ Added ${componentName} import: ${rel}`);
    }

    // Replace JSX usage
    src = src.replace(/<Sidebar\s+active=/g, `<${componentName} active=`);
    src = src.replace(/<Sidebar\s*\/>/g, `<${componentName} />`);

    changed = true;
  }

  // ── 3. Add auth import if missing ─────────────────────────────────────────
  const usedFns = ['saveSession','getToken','getUser','clearSession']
    .filter(fn => src.includes(fn) && !src.includes(`function ${fn}`));

  if (usedFns.length > 0 && !src.includes("from '@/lib/auth'")) {
    src = addImportAfterLast(src, `import { ${usedFns.join(', ')} } from '@/lib/auth';`);
    console.log(`  ➕ Added auth import { ${usedFns.join(', ')} }: ${rel}`);
    changed = true;
  }

  // ── 4. Fix raw localStorage auth calls ────────────────────────────────────
  if (role && src.includes("localStorage.getItem('mc_token')")) {
    const r = role === 'PATIENT' ? "'PATIENT'" : "'DOCTOR'";
    src = src.replace(/localStorage\.getItem\('mc_token'\)\s*\|\|\s*''/g, `getToken(${r})`);
    src = src.replace(/localStorage\.getItem\('mc_token'\)/g, `getToken(${r})`);
    console.log(`  🔧 Fixed localStorage token reads: ${rel}`);
    changed = true;
  }

  if (role && src.includes("localStorage.getItem('mc_user')")) {
    const r = role === 'PATIENT' ? "'PATIENT'" : "'DOCTOR'";
    src = src.replace(/JSON\.parse\(localStorage\.getItem\('mc_user'\)\s*\|\|\s*'{}'\)/g, `getUser(${r})`);
    src = src.replace(/localStorage\.getItem\('mc_user'\)/g, `JSON.stringify(getUser(${r}))`);
    console.log(`  🔧 Fixed localStorage user reads: ${rel}`);
    changed = true;
  }

  if (role && src.includes("localStorage.removeItem('mc_token')")) {
    const r = role === 'PATIENT' ? "'PATIENT'" : "'DOCTOR'";
    // Replace both removeItem lines with single clearSession call
    src = src.replace(
      /localStorage\.removeItem\('mc_token'\);\s*\n?\s*localStorage\.removeItem\('mc_user'\);/g,
      `clearSession(${r});`
    );
    src = src.replace(/localStorage\.removeItem\('mc_token'\);/g, `clearSession(${r});`);
    src = src.replace(/localStorage\.removeItem\('mc_user'\);/g, '');
    console.log(`  🔧 Fixed localStorage signout: ${rel}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, src, 'utf8');
    totalFixed++;
  }
}

console.log(`\n✅ Done. Fixed ${totalFixed} file(s).`);
console.log('\nNext steps:');
console.log('  1. Make sure src/components/PatientSidebar.jsx exists');
console.log('  2. Make sure src/components/DoctorSidebar.jsx exists');
console.log('  3. Make sure src/lib/auth.js exists');
console.log('  4. Redeploy to Vercel: git add . && git commit -m "fix: sidebar imports" && git push');
