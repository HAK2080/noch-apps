#!/usr/bin/env python3
"""
Canonical deploy script for apps.noch.cloud (the Noch Omni app).

Source of truth for deploy paths. If this ever fails, FIX THIS FILE —
do not improvise paths in ad-hoc commands.

Serving chain:
  apps.noch.cloud
    -> traefik (docker label: Host(`apps.noch.cloud`))
    -> apps-site container (nginx:alpine)
    -> volume /var/www/apps -> /usr/share/nginx/html
  So files must land in /var/www/apps on the host.

Run:  python deploy.py
"""
import os
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
# SSH auth: uses ED25519 key. Set DEPLOY_SSH_KEY_PATH to point at the private key,
# or place it at repo-root/.deploy-keys/noch_deploy and we'll auto-detect.
# DEPLOY_SSH_PASSWORD env var is honored as a last-resort fallback.
REMOTE = "/var/www/apps"  # THE serving directory for apps.noch.cloud
VERIFY_URL = "https://apps.noch.cloud/index.html"

HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"


def build():
    print("[1/4] Building...")
    result = subprocess.run(["npm", "run", "build"], cwd=HERE, shell=True)
    if result.returncode != 0:
        sys.exit("Build failed")
    if not DIST.exists():
        sys.exit(f"dist/ not found at {DIST}")


def upload():
    print(f"[2/4] Connecting to {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    # Resolve SSH key: env var first, then auto-detect local .deploy-keys/noch_deploy
    key_path = os.path.expanduser(os.environ.get("DEPLOY_SSH_KEY_PATH", ""))
    if not key_path:
        candidate = HERE.parents[1] / ".deploy-keys" / "noch_deploy"
        if candidate.exists():
            key_path = str(candidate)

    if key_path and os.path.exists(key_path):
        pkey = paramiko.Ed25519Key.from_private_key_file(key_path)
        ssh.connect(HOST, username=USER, pkey=pkey, look_for_keys=False, allow_agent=False)
    elif os.environ.get("DEPLOY_SSH_PASSWORD"):
        ssh.connect(HOST, username=USER, password=os.environ["DEPLOY_SSH_PASSWORD"])
    else:
        sys.exit("No SSH key found. Set DEPLOY_SSH_KEY_PATH, place key at repo-root/.deploy-keys/noch_deploy, or set DEPLOY_SSH_PASSWORD.")
    sftp = ssh.open_sftp()

    print(f"[3/4] Uploading to {REMOTE}...")
    # Clear only build outputs; keep siblings like menu.html, fonts, .bak
    ssh.exec_command(f"rm -rf {REMOTE}/assets {REMOTE}/index.html")[1].read()

    def upload_dir(local, remote):
        try:
            sftp.stat(remote)
        except FileNotFoundError:
            sftp.mkdir(remote)
        for item in os.listdir(local):
            lp = os.path.join(local, item)
            rp = f"{remote}/{item}"
            if os.path.isdir(lp):
                upload_dir(lp, rp)
            else:
                sftp.put(lp, rp)

    upload_dir(str(DIST), REMOTE)
    sftp.close()

    print("[4/4] Verifying...")
    stdin, stdout, _ = ssh.exec_command(
        f"ls {REMOTE}/assets/index-*.js 2>/dev/null | head -1"
    )
    deployed_js = stdout.read().decode().strip()
    ssh.close()

    local_html = (DIST / "index.html").read_text()
    import re
    m = re.search(r'/assets/(index-[^"]+\.js)', local_html)
    expected_js = m.group(1) if m else None

    if expected_js and expected_js in deployed_js:
        print(f"OK Deployed. {expected_js} is live at {REMOTE}")
        print(f"   Verify in browser: {VERIFY_URL}  (hard refresh: Ctrl+Shift+R)")
    else:
        print(f"WARN Hash mismatch. Local expects {expected_js}, server has {deployed_js}")


if __name__ == "__main__":
    if "--no-build" not in sys.argv:
        build()
    upload()
