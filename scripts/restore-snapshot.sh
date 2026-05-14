#!/usr/bin/env bash
# restore-snapshot.sh — restore a single table from a daily snapshot.
#
# Usage:
#   scripts/restore-snapshot.sh <table> <YYYY-MM-DD>
#   scripts/restore-snapshot.sh pos_products 2026-05-14
#
# Tables supported: pos_orders, pos_order_items, pos_products,
#                   pos_categories, loyalty_customers
#
# This produces a SQL script to stdout — does NOT apply automatically.
# Review the SQL, then pipe to supabase to apply:
#
#   scripts/restore-snapshot.sh pos_products 2026-05-14 \
#     | npx supabase db query --linked --stdin

set -e

TABLE="${1:-}"
DATE="${2:-}"

if [ -z "$TABLE" ] || [ -z "$DATE" ]; then
  echo "Usage: $0 <table> <YYYY-MM-DD>" >&2
  exit 1
fi

case "$TABLE" in
  pos_orders|pos_order_items|pos_products|pos_categories|loyalty_customers) ;;
  *) echo "Table not protected: $TABLE" >&2; exit 1 ;;
esac

cat <<SQL
-- Restore $TABLE from snapshot $DATE
-- REVIEW BEFORE APPLYING. This replaces the current contents.

BEGIN;
SET LOCAL app.allow_hard_delete = 'on';

DELETE FROM ${TABLE};

INSERT INTO ${TABLE}
SELECT (a).* FROM (
  SELECT a.* FROM ${TABLE}_archive a WHERE a.snapshot_date = '${DATE}'
) AS rows(a);

-- Note: the archive table has extra leading columns (snapshot_date, archived_at)
-- which need to be stripped. If this INSERT errors, build the column list manually.
-- See: SELECT column_name FROM information_schema.columns WHERE table_name = '${TABLE}'

COMMIT;
SQL
