#!/usr/bin/env node
/**
 * fix-sidebar-imports.js
 * Run from your frontend folder: node fix-sidebar-imports.js
 *
 * Finds every .js/.jsx file that USES PatientSidebar or DoctorSidebar
 * but doesn't import it, and adds the missing import automatically.
 * Also fixes missing auth imports and localhost:5000 API URLs.
 */

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(js|jsx|ts|tsx)$/.test(f)) files.push(full);
  }
  return files;
}

let fixed = 0;

for (const file of walk(SRC)) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  // ── 1. Fix missing PatientSidebar import ──────────────────────────────────
  if (src.includes('PatientSidebar') && !src.includes("import PatientSidebar")) {
    // Add import after the last existing import line
    src = src.replace(
      /^(import .+\n)(?!import)/m,
      `$1import PatientSidebar from '@/components/PatientSidebar';\n`
    );
    changed = true;
    console.log(`✅ Added PatientSidebar import: ${file.replace(SRC, 'src')}`);
  }

  // ── 2. Fix missing DoctorSidebar import ───────────────────────────────────
  if (src.includes('DoctorSidebar') && !src.includes("import DoctorSidebar")) {
    src = src.replace(
      /^(import .+\n)(?!import)/m,
      `$1import DoctorSidebar from '@/components/DoctorSidebar';\n`
    );
    changed = true;
    console.log(`✅ Added DoctorSidebar import: ${file.replace(SRC, 'src')}`);
  }

  // ── 3. Fix missing auth import ────────────────────────────────────────────
  const usesAuth = src.includes('getToken') || src.includes('getUser') ||
                   src.includes('clearSession') || src.includes('saveSession');
  if (usesAuth && !src.includes("from '@/lib/auth'")) {
    // Collect which functions are used
    const fns = ['saveSession','getToken','getUser','clearSession','hasSession','getRole']
      .filter(fn => src.includes(fn));
    if (fns.length > 0) {
      src = src.replace(
        /^(import .+\n)(?!import)/m,
        `$1import { ${fns.join(', ')} } from '@/lib/auth';\n`
      );
      changed = true;
      console.log(`✅ Added auth import (${fns.join(', ')}): ${file.replace(SRC, 'src')}`);
    }
  }

  // ── 4. Fix hardcoded localhost:5000 ───────────────────────────────────────
  if (src.includes("'http://localhost:5000/api'") &&
      !src.includes('NEXT_PUBLIC_API_URL')) {
    src = src.replace(
      /const API\s*=\s*'http:\/\/localhost:5000\/api'/g,
      "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'"
    );
    changed = true;
    console.log(`✅ Fixed localhost API URL: ${file.replace(SRC, 'src')}`);
  }

  if (changed) {
    fs.writeFileSync(file, src, 'utf8');
    fixed++;
  }
}

console.log(`\nDone. Fixed ${fixed} file(s).`);
