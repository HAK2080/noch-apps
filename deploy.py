#!/usr/bin/env python3
"""
Canonical deploy script for both Noch front-ends.

Source of truth for deploy paths. If this ever fails, FIX THIS FILE —
do not improvise paths in ad-hoc commands.

Two targets:
  apps        apps.noch.cloud  (the React POS + dashboard SPA — repo root)
  storefront  noch.cloud       (the marketing landing in storefront/)

Serving chain:
  apps.noch.cloud
    -> traefik (Host(`apps.noch.cloud`))
    -> apps-site container (nginx:alpine)
    -> volume /var/www/apps -> /usr/share/nginx/html

  noch.cloud
    -> traefik (Host(`noch.cloud`))
    -> noch-site container (nginx)
    -> volume /var/www/html -> /usr/share/nginx/html

Run:
  python deploy.py apps         # build + upload apps.noch.cloud
  python deploy.py storefront   # build + upload noch.cloud
  python deploy.py both         # both, in order: apps first, then storefront
  python deploy.py              # alias for `apps` (legacy default)

  python deploy.py apps --no-build       # skip build, upload existing dist/
"""
import os
import re
import sys
import subprocess
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("paramiko not installed. Run: pip install paramiko")
    sys.exit(1)

HOST = "72.60.203.107"
USER = "root"
PASS = "9@hW@s3UWL@Z#9uIUlnp"

HERE = Path(__file__).resolve().parent

# ── Targets ─────────────────────────────────────────────────────────────
TARGETS = {
    "apps": {
        "label":      "apps.noch.cloud (Noch Omni)",
        "cwd":        HERE / "apps" / "pos",
        "dist":       HERE / "apps" / "pos" / "dist",
        "remote":     "/var/www/apps",
        "verify":     "https://apps.noch.cloud/index.html",
        "stamp_sw":   True,
    },
    "storefront": {
        "label":      "noch.cloud (Storefront)",
        "cwd":        HERE / "apps" / "storefront",
        "dist":       HERE / "apps" / "storefront" / "dist",
        "remote":     "/var/www/html",
        "verify":     "https://noch.cloud/index.html",
        "stamp_sw":   False,
    },
}


# ── Helpers ─────────────────────────────────────────────────────────────
def stamp_sw_cache(dist: Path):
    """Bump the service-worker cache name so each deploy purges the old one
    on activate. Without this, returning POS users keep serving stale JS
    bundles from cache (and the offline-reload path can hold a deleted hash)."""
    sw_path = dist / "sw.js"
    if not sw_path.exists():
        return
    import time
    stamp = time.strftime("%Y-%m-%d-%H%M%S")
    text = sw_path.read_text(encoding="utf-8")
    new_text = re.sub(
        r"const CACHE = '[^']+'",
        f"const CACHE = 'noch-pos-{stamp}'",
        text,
        count=1,
    )
    if new_text != text:
        sw_path.write_text(new_text, encoding="utf-8")
        print(f"      stamped sw.js cache: noch-pos-{stamp}")


def build(target_key: str):
    cfg = TARGETS[target_key]
    print(f"[1/4] Building {cfg['label']}...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(cfg["cwd"]),
        shell=True,
    )
    if result.returncode != 0:
        sys.exit(f"Build failed for {target_key}")
    if not cfg["dist"].exists():
        sys.exit(f"dist/ not found at {cfg['dist']}")
    if cfg["stamp_sw"]:
        stamp_sw_cache(cfg["dist"])


def upload(target_key: str):
    cfg = TARGETS[target_key]
    print(f"[2/4] Connecting to {HOST} for {cfg['label']}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    sftp = ssh.open_sftp()

    remote = cfg["remote"]
    print(f"[3/4] Uploading to {remote}...")

    # Clear only build outputs; keep siblings on the host.
    ssh.exec_command(f"rm -rf {remote}/assets {remote}/index.html")[1].read()

    def upload_dir(local, rem):
        try:
            sftp.stat(rem)
        except FileNotFoundError:
            sftp.mkdir(rem)
        for item in os.listdir(local):
            lp = os.path.join(local, item)
            rp = f"{rem}/{item}"
            if os.path.isdir(lp):
                upload_dir(lp, rp)
            else:
                sftp.put(lp, rp)

    upload_dir(str(cfg["dist"]), remote)
    sftp.close()

    print("[4/4] Verifying...")
    stdin, stdout, _ = ssh.exec_command(
        f"ls {remote}/assets/index-*.js 2>/dev/null | head -1"
    )
    deployed_js = stdout.read().decode().strip()
    ssh.close()

    local_html = (cfg["dist"] / "index.html").read_text()
    m = re.search(r'/assets/(index-[^"]+\.js)', local_html)
    expected_js = m.group(1) if m else None

    if expected_js and expected_js in deployed_js:
        print(f"OK Deployed. {expected_js} is live at {remote}")
        print(f"   Verify in browser: {cfg['verify']}  (hard refresh: Ctrl+Shift+R)")
    else:
        print(f"WARN Hash mismatch. Local expects {expected_js}, server has {deployed_js}")


def deploy(target_key: str, do_build: bool = True):
    if target_key not in TARGETS:
        sys.exit(f"Unknown target '{target_key}'. Choices: {', '.join(TARGETS)}")
    if do_build:
        build(target_key)
    upload(target_key)


# ── Entry point ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a not in ("--no-build",)]
    no_build = "--no-build" in sys.argv

    if not args:
        # Legacy default: apps only.
        deploy("apps", do_build=not no_build)
    elif args[0] == "both":
        deploy("apps",       do_build=not no_build)
        print()
        deploy("storefront", do_build=not no_build)
    else:
        deploy(args[0], do_build=not no_build)
