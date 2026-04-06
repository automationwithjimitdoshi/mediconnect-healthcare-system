import os, re

base = r"C:\Users\REWKV\OneDrive - Bayer\Documents\mediconnect app\frontend\src"
count = 0

for root, dirs, files in os.walk(base):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next')]
    for fname in files:
        if not fname.endswith(('.js', '.jsx', '.ts', '.tsx')):
            continue
        path = os.path.join(root, fname)
        try:
            text = open(path, encoding='utf-8').read()
        except:
            continue
        if 'localhost:5000' not in text:
            continue
        new = re.sub(
            r"const API\s*=\s*['\"]http://localhost:5000/api['\"]",
            "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'",
            text
        )
        new = re.sub(
            r"const STATIC\s*=\s*['\"]http://localhost:5000['\"]",
            "const STATIC = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api','')",
            new
        )
        new = re.sub(
            r"(?<!['\(])http://localhost:5000/api(?!['\)])",
            "'+( process.env.NEXT_PUBLIC_API_URL||'http://localhost:5000/api')+'",
            new
        )
        if new != text:
            open(path, 'w', encoding='utf-8').write(new)
            count += 1
            print(f"Fixed: {fname}")

print(f"\nTotal fixed: {count} files")