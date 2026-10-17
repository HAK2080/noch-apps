#!/bin/sh
# Run read-only on the production Hostinger VPS after maintenance or a reboot.
# The public gateway owns host ports 80/443; app nginx containers remain intact.
set -eu

if systemctl is-active --quiet nginx; then
  echo 'FAIL: host nginx is active and may block the Traefik website gateway.'
  exit 1
fi
if systemctl is-enabled --quiet nginx 2>/dev/null; then
  echo 'FAIL: host nginx is enabled at boot; the port conflict may recur.'
  exit 1
fi
state=$(docker inspect traefik-ai5v-traefik-1 --format '{{.State.Status}}')
if [ "$state" != running ]; then
  echo "FAIL: website gateway is $state"
  exit 1
fi

for domain in apps.noch.cloud noch.cloud; do
  code=$(curl --max-time 15 --silent --show-error --output /dev/null \
    --write-out '%{http_code}' --resolve "$domain:443:127.0.0.1" "https://$domain/")
  if [ "$code" != 200 ]; then
    echo "FAIL: $domain returned HTTPS $code"
    exit 1
  fi
  echo "PASS: $domain HTTPS 200 with certificate validation"
done
echo 'PASS: host nginx inactive and disabled; public gateway running'
