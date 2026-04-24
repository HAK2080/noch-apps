#!/usr/bin/env python3
"""
Bloomly Odoo → Noch Supabase sync script.

Pulls POS orders, vendor bills, and payslips from bloomly.odoo.com
and upserts them into the Noch Supabase analytics tables.

Usage:
    python bloomly_sync.py              # sync last 30 days
    python bloomly_sync.py --days 90    # sync last 90 days
    python bloomly_sync.py --since 2026-01-01  # sync from date
    python bloomly_sync.py --all        # sync everything (slow)
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

import requests

# ─── CONFIG ────────────────────────────────────────────────────────────────────

ODOO_URL = "https://bloomly.odoo.com"
ODOO_DB = "bloomly"
ODOO_USER = "aerohaith@gmail.com"
ODOO_PASS = "t2cfra8vAZxFNq9"

SUPABASE_URL = "https://kxqjasdvoohiexedtfqw.supabase.co"
# Use service_role key for upserts (bypasses RLS). Set via env var for security.
# To get service_role key: Supabase Dashboard → Settings → API → service_role
import os
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

BLOOM_BRANCH_NAME = "Bloom Abu Nawas"

# ─── ODOO CLIENT ───────────────────────────────────────────────────────────────

class OdooClient:
    def __init__(self):
        self.session = requests.Session()
        self.uid = None

    def authenticate(self):
        res = self.session.post(f"{ODOO_URL}/web/session/authenticate", json={
            "jsonrpc": "2.0", "method": "call", "id": 1,
            "params": {"db": ODOO_DB, "login": ODOO_USER, "password": ODOO_PASS}
        })
        result = res.json().get("result", {})
        self.uid = result.get("uid")
        if not self.uid:
            raise RuntimeError(f"Odoo auth failed: {result}")
        print(f"  Odoo authenticated as uid={self.uid}")
        return self.uid

    def call(self, model, method, args=None, kwargs=None):
        payload = {
            "jsonrpc": "2.0", "method": "call", "id": 1,
            "params": {
                "model": model,
                "method": method,
                "args": args or [],
                "kwargs": kwargs or {}
            }
        }
        res = self.session.post(f"{ODOO_URL}/web/dataset/call_kw", json=payload)
        data = res.json()
        if "error" in data:
            raise RuntimeError(f"Odoo error: {data['error']}")
        return data.get("result", [])

    def search_read(self, model, domain, fields, limit=500, offset=0, order=None):
        kwargs = {"fields": fields, "limit": limit, "offset": offset}
        if order:
            kwargs["order"] = order
        return self.call(model, "search_read", [domain], kwargs)

    def search_read_all(self, model, domain, fields, batch=200, order=None):
        """Fetch all records in batches."""
        results = []
        offset = 0
        while True:
            batch_data = self.search_read(model, domain, fields, limit=batch, offset=offset, order=order)
            if not batch_data:
                break
            results.extend(batch_data)
            if len(batch_data) < batch:
                break
            offset += batch
        return results


# ─── SUPABASE CLIENT ───────────────────────────────────────────────────────────

class SupabaseClient:
    def __init__(self):
        if not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_SERVICE_KEY env var not set.\n"
                "Get it from: Supabase Dashboard → Settings → API → service_role key\n"
                "Then run: set SUPABASE_SERVICE_KEY=eyJ..."
            )
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal"
        }

    def get_branch_id(self, branch_name):
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/pos_branches",
            params={"name": f"eq.{branch_name}", "select": "id"},
            headers=self.headers
        )
        rows = res.json()
        if not rows:
            raise RuntimeError(f"Branch '{branch_name}' not found in Supabase pos_branches")
        return rows[0]["id"]

    def upsert(self, table, rows):
        if not rows:
            return 0
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows
        )
        if res.status_code not in (200, 201, 204):
            raise RuntimeError(f"Supabase upsert {table} failed {res.status_code}: {res.text[:500]}")
        return len(rows)

    def log_sync(self, orders, bills, payslips, status="success", error=None, sync_from=None, sync_to=None):
        row = {
            "orders_synced": orders,
            "bills_synced": bills,
            "payslips_synced": payslips,
            "status": status,
            "error_message": error,
            "sync_from": sync_from.isoformat() if sync_from else None,
            "sync_to": sync_to.isoformat() if sync_to else None,
        }
        requests.post(
            f"{SUPABASE_URL}/rest/v1/bloom_sync_log",
            headers={**self.headers, "Prefer": "return=minimal"},
            json=row
        )


# ─── SYNC LOGIC ────────────────────────────────────────────────────────────────

def parse_odoo_datetime(dt_str):
    """Convert Odoo datetime string (UTC) to ISO format."""
    if not dt_str or dt_str is False:
        return None
    try:
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        try:
            return datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            return None

def parse_odoo_date(d_str):
    if not d_str or d_str is False:
        return None
    return str(d_str)[:10]  # YYYY-MM-DD


def sync_pos_orders(odoo, supabase, branch_id, since_dt):
    """Sync pos.order.line rows → sales_transactions."""
    print(f"\n[1/3] Syncing POS orders since {since_dt.date()}...")

    domain = [
        ["date_order", ">=", since_dt.strftime("%Y-%m-%d 00:00:00")],
        ["state", "in", ["done", "invoiced"]]
    ]
    orders = odoo.search_read_all(
        "pos.order",
        domain,
        ["id", "name", "date_order", "amount_total", "lines"],
        order="date_order asc"
    )
    print(f"  Found {len(orders)} orders")
    if not orders:
        return 0

    # Collect all line IDs
    line_ids = []
    order_meta = {}  # line_id → (order_name, date_order)
    for o in orders:
        for lid in (o.get("lines") or []):
            line_ids.append(lid)
            order_meta[lid] = (o["name"], o["date_order"])

    # Fetch lines in batches
    all_lines = []
    batch_size = 200
    for i in range(0, len(line_ids), batch_size):
        chunk = line_ids[i:i+batch_size]
        lines = odoo.search_read(
            "pos.order.line",
            [["id", "in", chunk]],
            ["id", "product_id", "qty", "price_unit", "price_subtotal"],
            limit=batch_size
        )
        all_lines.extend(lines)

    print(f"  Found {len(all_lines)} order lines")

    rows = []
    for line in all_lines:
        order_name, date_order = order_meta.get(line["id"], ("", ""))
        product = line.get("product_id")
        category = ""
        if isinstance(product, (list, tuple)) and len(product) >= 2:
            product_name = product[1]
        else:
            product_name = str(product) if product else ""

        rows.append({
            "branch_id": branch_id,
            "category": category,
            "quantity": float(line.get("qty") or 0),
            "unit_price": float(line.get("price_unit") or 0),
            "total": float(line.get("price_subtotal") or 0),
            "sold_at": parse_odoo_datetime(date_order),
            "external_id": f"bloom-line-{line['id']}",
            "source": "bloomly_odoo",
        })

    count = supabase.upsert("sales_transactions", rows)
    print(f"  Upserted {count} sales transaction rows")
    return count


def sync_vendor_bills(odoo, supabase, branch_id, since_dt):
    """Sync account.move (in_invoice) → operating_costs."""
    print(f"\n[2/3] Syncing vendor bills since {since_dt.date()}...")

    domain = [
        ["move_type", "=", "in_invoice"],
        ["invoice_date", ">=", since_dt.strftime("%Y-%m-%d")],
    ]
    bills = odoo.search_read_all(
        "account.move",
        domain,
        ["id", "name", "invoice_date", "amount_untaxed", "amount_total",
         "partner_id", "invoice_line_ids", "payment_state"],
        order="invoice_date asc"
    )
    print(f"  Found {len(bills)} vendor bills")

    rows = []
    for bill in bills:
        partner = bill.get("partner_id")
        partner_name = partner[1] if isinstance(partner, (list, tuple)) and len(partner) >= 2 else ""
        inv_date = parse_odoo_date(bill.get("invoice_date"))
        rows.append({
            "branch_id": branch_id,
            "cost_type": "Vendor Bill",
            "amount": float(bill.get("amount_untaxed") or bill.get("amount_total") or 0),
            "period_start": inv_date,
            "period_end": inv_date,
            "notes": f"{bill.get('name', '')} — {partner_name}",
            "external_id": f"bloom-bill-{bill['id']}",
            "source": "bloomly_odoo",
        })

    count = supabase.upsert("operating_costs", rows)
    print(f"  Upserted {count} vendor bill rows")
    return count


def sync_payslips(odoo, supabase, branch_id, since_dt):
    """Sync hr.payslip → operating_costs (salary entries)."""
    print(f"\n[3/3] Syncing payslips since {since_dt.date()}...")

    domain = [
        ["date_from", ">=", since_dt.strftime("%Y-%m-%d")],
        ["state", "in", ["done", "paid"]]
    ]
    payslips = odoo.search_read_all(
        "hr.payslip",
        domain,
        ["id", "name", "date_from", "date_to", "employee_id", "net_wage"],
        order="date_from asc"
    )
    print(f"  Found {len(payslips)} payslips")

    rows = []
    for slip in payslips:
        emp = slip.get("employee_id")
        emp_name = emp[1] if isinstance(emp, (list, tuple)) and len(emp) >= 2 else ""
        rows.append({
            "branch_id": branch_id,
            "cost_type": "Labor/Salaries",
            "amount": float(slip.get("net_wage") or 0),
            "period_start": parse_odoo_date(slip.get("date_from")),
            "period_end": parse_odoo_date(slip.get("date_to")),
            "notes": f"Salary — {emp_name}",
            "external_id": f"bloom-payslip-{slip['id']}",
            "source": "bloomly_odoo",
        })

    count = supabase.upsert("operating_costs", rows)
    print(f"  Upserted {count} payslip rows")
    return count


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Bloomly Odoo → Noch Supabase")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--days", type=int, default=30, help="Sync last N days (default: 30)")
    group.add_argument("--since", type=str, help="Sync from date YYYY-MM-DD")
    group.add_argument("--all", action="store_true", help="Sync all records (slow)")
    args = parser.parse_args()

    if args.all:
        since_dt = datetime(2020, 1, 1, tzinfo=timezone.utc)
    elif args.since:
        since_dt = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(days=args.days)

    print("=" * 60)
    print("  Bloomly → Noch Sync")
    print(f"  Syncing from: {since_dt.strftime('%Y-%m-%d')}")
    print("=" * 60)

    odoo = OdooClient()
    supabase = SupabaseClient()

    orders_count = bills_count = payslips_count = 0
    error_msg = None

    try:
        print("\nAuthenticating with Odoo...")
        odoo.authenticate()

        print("Fetching Bloom Abu Nawas branch ID from Supabase...")
        branch_id = supabase.get_branch_id(BLOOM_BRANCH_NAME)
        print(f"  Branch ID: {branch_id}")

        orders_count = sync_pos_orders(odoo, supabase, branch_id, since_dt)
        bills_count = sync_vendor_bills(odoo, supabase, branch_id, since_dt)
        payslips_count = sync_payslips(odoo, supabase, branch_id, since_dt)

        print("\n" + "=" * 60)
        print(f"  ✓ Sync complete!")
        print(f"    Sales transactions : {orders_count}")
        print(f"    Vendor bills       : {bills_count}")
        print(f"    Payslips           : {payslips_count}")
        print("=" * 60)

    except Exception as e:
        error_msg = str(e)
        print(f"\n  ✗ Sync failed: {error_msg}", file=sys.stderr)

    finally:
        supabase.log_sync(
            orders=orders_count,
            bills=bills_count,
            payslips=payslips_count,
            status="success" if not error_msg else "error",
            error=error_msg,
            sync_from=since_dt,
            sync_to=datetime.now(timezone.utc)
        )
        if error_msg:
            sys.exit(1)


if __name__ == "__main__":
    main()
