import os, re

base = r"C:\Users\REWKV\OneDrive - Bayer\Documents\mediconnect app\frontend\src"
count = 0

CORRECT_API = "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';"
CORRECT_STATIC = "const STATIC = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '');"

for root, dirs, files in os.walk(base):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git')]
    for fname in files:
        if not fname.endswith(('.js', '.jsx', '.ts', '.tsx')):
            continue
        path = os.path.join(root, fname)
        try:
            text = open(path, encoding='utf-8').read()
        except:
            continue

        original = text

        # ── STEP 1: Fix any broken double-wrapped patterns first ──────────────
        # Pattern: NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_API_URL || '...')
        text = re.sub(
            r"process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*\(process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http://localhost:5000/api'\)",
            "process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'",
            text
        )
        # Fix trailing quote issues: ...'http://localhost:5000/api')';  → clean
        text = re.sub(
            r"process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http://localhost:5000/api'\)';",
            "process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';",
            text
        )
        # Fix any other mangled patterns with extra quotes/parens
        text = re.sub(
            r"''\s*\+\s*\(\s*process\.env\.NEXT_PUBLIC_API_URL\s*\|\|[^)]+\)\s*\+\s*''",
            "process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'",
            text
        )

        # ── STEP 2: Replace clean localhost patterns ──────────────────────────
        # const API = 'http://localhost:5000/api';   (single or double quotes)
        text = re.sub(
            r"const API\s*=\s*['\"]http://localhost:5000/api['\"];?",
            CORRECT_API,
            text
        )
        # const STATIC = 'http://localhost:5000';
        text = re.sub(
            r"const STATIC\s*=\s*['\"]http://localhost:5000['\"];?",
            CORRECT_STATIC,
            text
        )

        # ── STEP 3: Fix any remaining bare localhost strings in fetch() calls ─
        # fetch('http://localhost:5000/api/...')  → fetch(`${API}/...`)
        # These are harder to fix automatically so just flag them
        remaining = re.findall(r"['\"]http://localhost:5000[^'\"]*['\"]", text)
        if remaining:
            print(f"  WARNING - manual fix needed in {fname}: {remaining[:2]}")

        if text != original:
            open(path, 'w', encoding='utf-8').write(text)
            count += 1
            print(f"Fixed: {os.path.relpath(path, base)}")

