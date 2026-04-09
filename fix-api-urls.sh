#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-api-urls.sh
# Run this from your project root: bash fix-api-urls.sh
#
# Finds every JS file under src/ that still has the hardcoded
#   const API = 'http://localhost:5000/api'
# and replaces it with the environment-variable-aware version:
#   const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
#
# Safe to run multiple times — skips files already fixed.
# ─────────────────────────────────────────────────────────────────────────────

FRONTEND_DIR="./frontend/src"

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ Could not find $FRONTEND_DIR — run this from your project root."
  exit 1
fi

FIXED=0
SKIPPED=0

while IFS= read -r file; do
  # Check if it has the hardcoded version (not yet fixed)
  if grep -q "const API\s*=\s*['\"]http://localhost:5000/api['\"]" "$file"; then
    # Replace it
    sed -i "s|const API\s*=\s*['\"]http://localhost:5000/api['\"]|const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'|g" "$file"
    echo "✅ Fixed: $file"
    FIXED=$((FIXED + 1))
  else
    SKIPPED=$((SKIPPED + 1))
  fi
done < <(find "$FRONTEND_DIR" -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" | sort)

echo ""
echo "──────────────────────────────────────────"
echo "Done. Fixed: $FIXED files. Already OK: $SKIPPED files."
echo ""
echo "Next: make sure NEXT_PUBLIC_API_URL is set in Vercel:"
echo "  NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api"
