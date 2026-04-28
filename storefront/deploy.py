#!/usr/bin/env python3
"""
Canonical deploy script for noch.cloud (the public marketing storefront).

Source of truth for storefront deploy paths. If this fails, FIX THIS FILE —
do not improvise paths in ad-hoc commands.

Serving chain:
  noch.cloud
    -> traefik (docker label: Host(`noch.cloud`))
    -> noch-site container (nginx)
    -> volume /var/www/html -> /usr/share/nginx/html
  So files must land in /var/www/html on the host.

The storefront is plain HTML/JS that uses React+Babel via CDN — no build step.
We upload the contents of `public/` directly.

Run:  python deploy.py
"""
import os
import sys
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
REMOTE = "/var/www/html"  # THE serving directory for noch.cloud
VERIFY_URL = "https://noch.cloud/index.html"

HERE = Path(__file__).resolve().parent
SRC = HERE / "public"


def upload():
    if not SRC.exists():
        sys.exit(f"public/ not found at {SRC}")

    print(f"[1/3] Connecting to {HOST}...")
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

    print(f"[2/3] Uploading {SRC.name}/ -> {REMOTE} ...")

    def ensure_remote_dir(rp):
        try:
            sftp.stat(rp)
        except FileNotFoundError:
            sftp.mkdir(rp)

    def upload_dir(local, remote):
        ensure_remote_dir(remote)
        for item in os.listdir(local):
            lp = os.path.join(local, item)
            rp = f"{remote}/{item}"
            if os.path.isdir(lp):
                upload_dir(lp, rp)
            else:
                sftp.put(lp, rp)
                print(f"  uploaded {os.path.relpath(lp, str(SRC))}")

    upload_dir(str(SRC), REMOTE)
    sftp.close()

    print("[3/3] Verifying...")
    stdin, stdout, _ = ssh.exec_command(
        f"ls -la {REMOTE}/index.html 2>/dev/null"
    )
    listing = stdout.read().decode().strip()
    ssh.close()

    if "index.html" in listing:
        print(f"OK Deployed. {listing}")
        print(f"   Verify in browser: {VERIFY_URL}  (hard refresh: Ctrl+Shift+R)")
    else:
        print("WARN: index.html not found on server after upload.")


if __name__ == "__main__":
    upload()
# v3.5.0
