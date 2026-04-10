#!/usr/bin/env python3
"""
fix_doctor_pages.py — NexMedicon AI
====================================
Run this once from your project root to fix all broken auth patterns
across every doctor page simultaneously.

Usage:
    python3 fix_doctor_pages.py

What it fixes in each file:
  1. localStorage.getItem('mc_token')  → getToken('DOCTOR')
  2. localStorage.getItem('mc_user')   → getUser('DOCTOR')   (auth guard)
  3. localStorage.setItem('mc_user')   → saveSession(tok, updated)
  4. JSON.stringify(getUser('DOCTOR')) double-stringify bug   (chat page)
  5. Inlined DoctorProfileModal mc_user reads in useEffect
  6. Inlined DoctorProfileModal mc_user read+write in saveProfile

Files patched:
  src/app/doctor/reports/page.js
  src/app/doctor/patients/page.js
  src/app/doctor/chat/page.js
  src/app/doctor/appointments/page.js
  src/components/DoctorProfileModal.js   (if you still use the standalone version)
"""

import re, os, sys

TARGET_FILES = [
    "src/app/doctor/reports/page.js",
    "src/app/doctor/patients/page.js",
    "src/app/doctor/chat/page.js",
    "src/app/doctor/appointments/page.js",
    "src/components/DoctorProfileModal.js",
]

def patch(content):
    original = content

    # ── 1. Token useCallback reading localStorage ─────────────────────────────
    content = re.sub(
        r"const token\s*=\s*useCallback\(\s*\(\)\s*=>\s*localStorage\.getItem\(['\"]mc_token['\"]\)\s*\|\|\s*''\s*,\s*\[\]\s*\)",
        "const token = useCallback(() => getToken('DOCTOR') || '', [])",
        content,
    )
    # Arrow fn variant (appointments page)
    content = re.sub(
        r"const token\s*=\s*\(\)\s*=>\s*localStorage\.getItem\(['\"]mc_token['\"]\)\s*\|\|\s*''\s*;",
        "const token = () => getToken('DOCTOR') || '';",
        content,
    )

    # ── 2. Auth guard: mc_user + JSON.parse role check ────────────────────────
    content = re.sub(
        r"const u\s*=\s*localStorage\.getItem\(['\"]mc_user['\"]\);\s*\n(\s*)if\s*\(\s*!u\s*\)\s*\{\s*router\.push\([^)]+\);\s*return;\s*\}\s*\n(\s*)if\s*\(\s*JSON\.parse\(u\)\.role\s*!==\s*'DOCTOR'\s*\)\s*\{\s*router\.push\([^)]+\);\s*return;\s*\}",
        "const tok = getToken('DOCTOR');\n    if (!tok) { window.location.href = '/login'; return; }\n    const u = getUser('DOCTOR');\n    if (u?.role && u.role !== 'DOCTOR') { window.location.href = '/'; return; }",
        content,
    )

    # ── 3. Simple mc_token check only (appointments page) ─────────────────────
    content = re.sub(
        r"if\s*\(\s*!localStorage\.getItem\(['\"]mc_token['\"]\)\s*\)\s*\{\s*router\.push\([^)]+\);\s*return;\s*\}",
        "if (!getToken('DOCTOR')) { window.location.href = '/login'; return; }",
        content,
    )

    # ── 4. Chat page double-stringify (compact one-liner) ─────────────────────
    content = re.sub(
        r"const tok=localStorage\.getItem\('mc_token'\);const u=JSON\.stringify\(getUser\('DOCTOR'\)\);\s*\n\s*if\(!tok\)\{router\.push\([^)]+\);return;\}\s*\n\s*if\(u\)\{try\{const p=JSON\.parse\(u\);if\(p\.role!=='DOCTOR'\)\{router\.push\([^)]+\);return;\}\}catch\{\}\}",
        "const tok = getToken('DOCTOR');\n    if(!tok){window.location.href='/login';return;}\n    const u = getUser('DOCTOR');\n    if(u?.role && u.role!=='DOCTOR'){window.location.href='/';return;}",
        content,
    )

    # ── 5a. Inlined modal useEffect: JSON.stringify(getUser) variant ──────────
    content = re.sub(
        r"try \{\s*\n\s*const u = JSON\.parse\(JSON\.stringify\(getUser\('DOCTOR'\)\) \|\| '\{\}'\);\s*\n\s*setAppEmail\(u\.email \|\| ''\);\s*\n\s*\} catch \{\}",
        "const _ue = getUser('DOCTOR'); setAppEmail(_ue.email || '');",
        content,
    )

    # ── 5b. Inlined modal useEffect: localStorage.getItem mc_user variant ─────
    content = re.sub(
        r"try \{\s*\n\s*const u = JSON\.parse\(localStorage\.getItem\('mc_user'\) \|\| '\{\}'\);\s*\n\s*setAppEmail\(u\.email \|\| ''\);\s*\n\s*\} catch \{\}",
        "const _ue = getUser('DOCTOR'); setAppEmail(_ue.email || '');",
        content,
    )

    # ── 6. Inlined saveProfile: localStorage mc_user read+write block ─────────
    # Find and replace the entire "// Update localStorage user" try block
    pattern_start = "// Update localStorage user"
    replacement = (
        "// Update session via auth system\n"
        "        try {\n"
        "          const _u = getUser('DOCTOR'); const _t = getToken('DOCTOR');\n"
        "          if (_u && _t) saveSession(_t, { ..._u, doctor: { ...(_u.doctor||{}), ...d.data } });\n"
        "        } catch {}"
    )
    while pattern_start in content:
        idx = content.find(pattern_start)
        # Find the "} catch {}" or "} catch { }" that closes this try block
        end = -1
        for closing in ["} catch { }", "} catch {}", "} catch (e) {}"]:
            pos = content.find(closing, idx)
            if pos != -1 and (end == -1 or pos < end):
                end = pos + len(closing)
        if end == -1:
            break  # safety: don't loop forever
        content = content[:idx] + replacement + content[end:]

    # ── 7. mc_doctor_app_email display key (safe, just add SSR guard) ─────────
    content = content.replace(
        "const ae = localStorage.getItem('mc_doctor_app_email') || '';",
        "const ae = (typeof window !== 'undefined' ? localStorage.getItem('mc_doctor_app_email') : '') || '';",
    )

    return content, content != original


def main():
    patched = 0
    errors = []

    for rel_path in TARGET_FILES:
        if not os.path.exists(rel_path):
            print(f"  SKIP (not found): {rel_path}")
            continue
        try:
            with open(rel_path, "r", encoding="utf-8") as f:
                original = f.read()
            fixed, changed = patch(original)

            # Verify no broken patterns remain
            remaining = (
                fixed.count("localStorage.getItem('mc_token')")
                + fixed.count("localStorage.getItem('mc_user')")
                + fixed.count("localStorage.setItem('mc_user")
            )

            if changed:
                with open(rel_path, "w", encoding="utf-8") as f:
                    f.write(fixed)
                status = f"✅ PATCHED (remaining broken={remaining})"
                patched += 1
            else:
                status = f"  -- no changes needed (remaining broken={remaining})"

            print(f"{status}: {rel_path}")

        except Exception as e:
            errors.append((rel_path, str(e)))
            print(f"  ❌ ERROR: {rel_path}: {e}")

    print(f"\nDone. {patched} file(s) patched. {len(errors)} error(s).")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
