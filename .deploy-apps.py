import paramiko, time, io

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("72.60.203.107", username="root", password="9@hW@s3UWL@Z#9uIUlnp",
            timeout=30, look_for_keys=False, allow_agent=False)

def run(label, cmd):
    print("====", label, "====")
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode(); print(out)
    err = e.read().decode()
    if err.strip(): print("ERR:", err)
    return out

sftp = ssh.open_sftp()

# Upload zip
print(">> Uploading apps-deploy.zip ...")
sftp.put("apps-deploy.zip", "/root/apps-deploy.zip")
print("   done.")

# Wipe & extract to /var/www/apps
run("prep webroot", "mkdir -p /var/www/apps && rm -rf /var/www/apps/*")
run("extract zip", "cd /var/www/apps && unzip -o /root/apps-deploy.zip && rm /root/apps-deploy.zip")
run("verify", "ls /var/www/apps/ | head -10")

# nginx.conf for SPA
nginx_conf = """server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location ~* \\.(js|css|png|svg|jpg|ico|woff2?|ttf|otf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }
    gzip on;
    gzip_types text/html text/css application/javascript application/json image/svg+xml;
}
"""
run("mkdir compose dir", "mkdir -p /docker/apps-site")
with sftp.open("/docker/apps-site/nginx.conf", "w") as f:
    f.write(nginx_conf)
print("nginx.conf written")

# docker-compose.yml
compose = """services:
  apps-site:
    image: nginx:alpine
    container_name: apps-site
    restart: unless-stopped
    volumes:
      - /var/www/apps:/usr/share/nginx/html:ro
      - /docker/apps-site/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    labels:
      - traefik.enable=true
      - traefik.http.routers.apps-http.rule=Host(`apps.noch.cloud`)
      - traefik.http.routers.apps-http.entrypoints=web
      - traefik.http.routers.apps.rule=Host(`apps.noch.cloud`)
      - traefik.http.routers.apps.entrypoints=websecure
      - traefik.http.routers.apps.tls=true
      - traefik.http.routers.apps.tls.certresolver=letsencrypt
      - traefik.http.services.apps.loadbalancer.server.port=80
    networks:
      - traefik-ai5v_default

networks:
  traefik-ai5v_default:
    external: true
"""
with sftp.open("/docker/apps-site/docker-compose.yml", "w") as f:
    f.write(compose)
print("docker-compose.yml written")

sftp.close()

# Make sure DNS has apps A record
run("check apps DNS", "dig @8.8.8.8 apps.noch.cloud A +short")

# Start container
run("docker compose up", "cd /docker/apps-site && docker compose up -d 2>&1")
run("container running?", "docker ps --filter name=apps-site --format '{{.Names}} {{.Status}}'")

# Wait for ACME cert
print("\n>> Waiting up to 90s for apps.noch.cloud cert ...")
for i in range(18):
    time.sleep(5)
    _, o, _ = ssh.exec_command(
        "docker logs traefik-ai5v-traefik-1 --since 3m 2>&1 | grep -iE 'apps\\.noch|acme|certificate' | tail -8")
    out = o.read().decode()
    marker = f"[{(i+1)*5}s]"
    print(marker, out.replace("\n", "\n       ") if out.strip() else "(waiting...)")
    lo = out.lower()
    if "successfully obtained" in lo or "certificate obtained" in lo or "obtained" in lo:
        break
    if "error" in lo and "apps.noch" in lo:
        print("  ^^^ error ^^^")
        break

run("cert check", "echo | openssl s_client -connect 127.0.0.1:443 -servername apps.noch.cloud 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null")
run("curl https", "curl -sSI https://apps.noch.cloud 2>&1 | head -6")

ssh.close()
