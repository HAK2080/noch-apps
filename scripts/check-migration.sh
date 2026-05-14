#!/usr/bin/env bash
# check-migration.sh — scan a migration file for dangerous patterns
# before applying it to production.
#
# Usage:
#   scripts/check-migration.sh supabase/migrations/<file>.sql
#   scripts/check-migration.sh                    # checks all unstaged migrations
#
# Exits 0 if safe, 1 if dangerous patterns found (CI-friendly).
# Override with --force to apply anyway after manual review.

set -e

FILES=()
if [ $# -gt 0 ] && [ "$1" != "--force" ]; then
  FILES=("$@")
else
  # Find migrations that are untracked or modified
  mapfile -t FILES < <(git diff --name-only HEAD -- 'supabase/migrations/*.sql' 2>/dev/null; git ls-files --others --exclude-standard 'supabase/migrations/*.sql' 2>/dev/null)
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No migration files to check."
  exit 0
fi

ANY_DANGER=0

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  echo ""
  echo "── Checking: $f"
  DANGER_LINES=$(grep -nEi '(\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDROP\s+SCHEMA\b|\bDROP\s+DATABASE\b)' "$f" || true)
  WARN_LINES=$(grep -nEi '(\bDELETE\s+FROM\b(?!.*WHERE)|\bALTER\s+TABLE\b.*\bDROP\s+COLUMN\b|\bDROP\s+POLICY\b|\bDROP\s+TRIGGER\b)' "$f" || true)

  if [ -n "$DANGER_LINES" ]; then
    echo "  ⚠ DANGEROUS patterns found:"
    echo "$DANGER_LINES" | sed 's/^/    /'
    ANY_DANGER=1
  fi
  if [ -n "$WARN_LINES" ]; then
    echo "  ⚠ Patterns that need review:"
    echo "$WARN_LINES" | sed 's/^/    /'
  fi
  if [ -z "$DANGER_LINES" ] && [ -z "$WARN_LINES" ]; then
    echo "  ✓ clean"
  fi
done

echo ""
if [ "$ANY_DANGER" -eq 1 ]; then
  echo "❌ One or more migrations contain DANGEROUS patterns."
  echo "   Review carefully. If intentional, add to a separate clearly-named migration."
  echo "   To override, pass --force after manual review."
  if [ "${1:-}" != "--force" ] && [ "${2:-}" != "--force" ]; then
    exit 1
  fi
  echo "   (continuing because --force was passed)"
fi

echo "✓ Safe to apply."
exit 0
