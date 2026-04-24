import os, sys, paramiko, time

HOST = "72.60.203.107"
USER = "root"
PASS = "9@hW@s3UWL@Z#9uIUlnp"
LOCAL_ZIP = "noch-deploy.zip"
REMOTE_ZIP = "/var/www/apps/noch-deploy.zip"
REMOTE_DIR = "/var/www/apps"

print(f"[1/5] Connecting to {HOST}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30, look_for_keys=False, allow_agent=False)
print("    connected.")

print("[2/5] Snapshot /var/www/html before deploy:")
stdin, stdout, stderr = ssh.exec_command(f"ls -la {REMOTE_DIR} 2>&1 | head -40")
print(stdout.read().decode())

print("[3/5] Uploading zip via SFTP...")
sftp = ssh.open_sftp()
t0 = time.time()
sftp.put(LOCAL_ZIP, REMOTE_ZIP)
sftp.close()
print(f"    uploaded in {time.time()-t0:.1f}s")

print("[4/5] Extracting + cleanup...")
cmd = f"cd {REMOTE_DIR} && unzip -o noch-deploy.zip && rm -f noch-deploy.zip && ls -la"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err: print("STDERR:", err)

print("[5/5] Verifying index.html:")
stdin, stdout, stderr = ssh.exec_command(f"head -5 {REMOTE_DIR}/index.html")
print(stdout.read().decode())

print("\nDetecting web server:")
stdin, stdout, stderr = ssh.exec_command("systemctl is-active nginx 2>&1; systemctl is-active apache2 2>&1; ss -tlnp 2>/dev/null | grep -E ':80|:443|:3000' | head")
print(stdout.read().decode())

ssh.close()
print("\nDeploy complete.")
