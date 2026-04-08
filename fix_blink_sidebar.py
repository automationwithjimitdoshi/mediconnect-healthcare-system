"""
MediConnect AI — Fix Blink & Collapsible Sidebar
Run from your project root:
  python fix_blink_sidebar.py
"""
import os, re, sys

ROOT = r"C:\Users\REWKV\OneDrive - Bayer\Documents\mediconnect app\frontend"

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓ {os.path.relpath(path, ROOT)}")

# ─────────────────────────────────────────────────────────────────────────────
# 1. PATCH layout.js — add background colors to prevent white flash
# ─────────────────────────────────────────────────────────────────────────────
layout_path = os.path.join(ROOT, 'src', 'app', 'layout.js')
print("\n[1] Patching layout.js...")
layout = read(layout_path)

NEW_LAYOUT = """import './globals.css';

export const metadata = {
  title: 'MediConnect AI',
  description: 'AI-powered healthcare platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ background: '#0c1a2e' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#f7f9fc', backgroundImage: 'linear-gradient(90deg, #0c1a2e 60px, #f7f9fc 60px)', margin: 0 }}>
        <div id="__mc_page">{children}</div>
      </body>
    </html>
  );
}
"""
write(layout_path, NEW_LAYOUT)

# ─────────────────────────────────────────────────────────────────────────────
# 2. PATCH globals.css — append transition + sidebar CSS
# ─────────────────────────────────────────────────────────────────────────────
css_path = os.path.join(ROOT, 'src', 'app', 'globals.css')
print("\n[2] Patching globals.css...")

EXTRA_CSS = """

/* ═══════════════════════════════════════════════════════════════
   MEDICONNECT — PAGE TRANSITIONS & COLLAPSIBLE SIDEBAR
   ═══════════════════════════════════════════════════════════════ */

/* 1. Prevent white flash — html and body always have background */
html {
  background: #0c1a2e !important;
}
body {
  background: #f7f9fc !important;
  background-image: linear-gradient(90deg, #0c1a2e 60px, #f7f9fc 60px) !important;
  margin: 0 !important;
}

/* 2. Page fade-in on every navigation */
#__mc_page {
  animation: mc-fade 0.13s ease-out both;
}
@keyframes mc-fade {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0);   }
}

/* 3. Collapsible sidebar — collapsed by default (60px), expands on hover */
.mc-sidebar {
  width: 60px !important;
  min-width: 60px !important;
  max-width: 60px !important;
  transition: width 0.22s cubic-bezier(0.4,0,0.2,1),
              min-width 0.22s cubic-bezier(0.4,0,0.2,1),
              max-width 0.22s cubic-bezier(0.4,0,0.2,1) !important;
  overflow: hidden !important;
  will-change: width !important;
}
.mc-sidebar:hover {
  width: 220px !important;
  min-width: 220px !important;
  max-width: 220px !important;
}

/* 4. Hide text until expanded */
.mc-nav-label,
.mc-logo-text,
.mc-user-info,
.mc-section-label,
.mc-signout-text {
  opacity: 0 !important;
  width: 0 !important;
  overflow: hidden !important;
  transition: opacity 0.15s ease 0.05s !important;
  white-space: nowrap !important;
  pointer-events: none !important;
}
.mc-sidebar:hover .mc-nav-label,
.mc-sidebar:hover .mc-logo-text,
.mc-sidebar:hover .mc-user-info,
.mc-sidebar:hover .mc-section-label,
.mc-sidebar:hover .mc-signout-text {
  opacity: 1 !important;
  width: auto !important;
  pointer-events: auto !important;
}

/* 5. Keep icons always visible and centered */
.mc-nav-icon {
  flex-shrink: 0 !important;
  width: 20px !important;
  text-align: center !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 6. Nav buttons align icons center when collapsed */
.mc-nav-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 10px !important;
  width: 100% !important;
  white-space: nowrap !important;
}

/* 7. Smooth scrollbar */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* 8. Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
"""

existing_css = read(css_path) if os.path.exists(css_path) else ""
# Remove previous patches to avoid duplication
if "MEDICONNECT — PAGE TRANSITIONS" in existing_css:
    existing_css = existing_css[:existing_css.index("/* ═══════════════════════════════════════════════════════════════\n   MEDICONNECT — PAGE TRANSITIONS")]
write(css_path, existing_css + EXTRA_CSS)

# ─────────────────────────────────────────────────────────────────────────────
# 3. PATCH all page files — fix mounted null guard + add sidebar CSS classes
# ─────────────────────────────────────────────────────────────────────────────
print("\n[3] Patching page files...")

src = os.path.join(ROOT, 'src')
patched = 0

for dirpath, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git')]
    for fname in files:
        if not fname.endswith('.js') and not fname.endswith('.jsx'):
            continue
        path = os.path.join(dirpath, fname)
        try:
            code = read(path)
        except:
            continue

        original = code
        changed = False

        # Fix 1: Replace `if(!mounted)return null;` with background placeholder
        for pattern in [
            "  if(!mounted)return null;\n",
            "  if (!mounted) return null;\n",
            "if(!mounted)return null;\n",
            "if (!mounted) return null;\n",
        ]:
            if pattern in code:
                bg_color = '#0c1a2e' if 'doctor' in path.lower() or 'admin' in path.lower() else '#f7f9fc'
                replacement = f"  if(!mounted) return <div style={{{{minHeight:'100vh',background:'{bg_color}'}}}}/>;\n"
                code = code.replace(pattern, replacement)
                changed = True

        # Fix 2: Add mc-sidebar class to sidebar outer div if not already there
        if 'function Sidebar(' in code and 'mc-sidebar' not in code:
            code = code.replace(
                "width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'",
                "width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'"
            )
            # Add className to the sidebar div
            code = re.sub(
                r"<div style=\{\{ width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' \}\}>",
                "<div className=\"mc-sidebar\" style={{ width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>",
                code
            )
            # Add mc-nav-icon class to icon spans
            code = code.replace(
                "<span style={{ fontSize: 14 }}>{item.icon}</span>",
                "<span className=\"mc-nav-icon\" style={{ fontSize: 14 }}>{item.icon}</span>"
            )
            # Add mc-nav-label class to label spans
            code = code.replace(
                "<span style={{ flex: 1 }}>{item.label}</span>",
                "<span className=\"mc-nav-label\" style={{ flex: 1 }}>{item.label}</span>"
            )
            # Add mc-nav-btn class to nav buttons
            code = re.sub(
                r'(<button key=\{item\.id\} onClick=\{[^}]+\})',
                r'<button className="mc-nav-btn" key={item.id} onClick={() => router.push(item.href)}',
                code,
                count=1
            )
            # Add mc-logo-text
            code = code.replace(
                "MediConnect AI</div><div style={{ fontSize: 9",
                "MediConnect <span className=\"mc-logo-text\">AI</span></div><div className=\"mc-section-label\" style={{ fontSize: 9"
            )
            changed = True

        # Fix 3: Fix duplicate style attributes that cause syntax errors
        code = re.sub(r'style=\{\{cursor:"pointer"\}\}\s+style=\{', 'style={', code)

        if changed and code != original:
            write(path, code)
            patched += 1

print(f"\n  Total pages patched: {patched}")

print("\n[4] All done! Now run:")
print("  git add .")
print("  git commit -m \"Fix: no-blink transitions + collapsible sidebar\"")
print("  git push origin main")
