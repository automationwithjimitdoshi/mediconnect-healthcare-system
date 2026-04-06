import os, re

frontend = r"C:\Users\REWKV\OneDrive - Bayer\Documents\mediconnect app\frontend\src"

for root, dirs, files in os.walk(frontend):
    # Skip node_modules and .next
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git')]
    for fname in files:
        if not fname.endswith(('.js', '.jsx', '.ts', '.tsx')):
            continue
        path = os.path.join(root, fname)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
        except:
            continue

        if 'localhost:5000' not in content:
            continue

        updated = content

        # Fix: const API = 'http://localhost:5000/api'
        updated = re.sub(
            r"const API\s*=\s*['\"]http://localhost:5000/api['\"]",
            "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'",
            updated
        )
        # Fix: const STATIC = 'http://localhost:5000'
        updated = re.sub(
            r"const STATIC\s*=\s*['\"]http://localhost:5000['\"]",
            "const STATIC = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '')",
            updated
        )
        # Fix any remaining bare localhost:5000/api strings
        updated = re.sub(
            r"['\"]http://localhost:5000/api['\"]",
            "(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api')",
            updated
        )
        # Fix bare localhost:5000 (without /api)
        updated = re.sub(
            r"['\"]http://localhost:5000['\"]",
            "(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '')",
            updated
        )

        if updated != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f"Fixed: {os.path.relpath(path, frontend)}")

print("\nAll done.")