#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

SOURCE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/travel-planner-preview.conf}"
INSTALL_ROOT="/usr/local/lib/osaka-mountain-outdoor"
SITE_ROOT="/srv/helper_sites/releases/osaka-mountain-picker-http"
WEATHER_ROOT="/srv/helper_sites/services/osaka-mountain-weather"
SNIPPET="/etc/nginx/snippets/osaka-mountain-outdoor.conf"
HTPASSWD_FILE="/etc/nginx/.htpasswd_chufa_outdoor"
INCLUDE_LINE="    include /etc/nginx/snippets/osaka-mountain-outdoor.conf;"

for file in \
  outdoor-deployd.mjs \
  helper-sites-osaka-mountain-weather.service \
  osaka-mountain-outdoor-deployd.service \
  nginx-outdoor.conf; do
  [[ -f "$SOURCE_DIR/$file" ]] || { echo "Missing $SOURCE_DIR/$file" >&2; exit 1; }
done
[[ -f "$NGINX_SITE" ]] || { echo "Missing Nginx site: $NGINX_SITE" >&2; exit 1; }
command -v node >/dev/null
command -v nginx >/dev/null
command -v htpasswd >/dev/null
command -v openssl >/dev/null
command -v python3 >/dev/null
node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
[[ "$node_major" -ge 22 ]] || { echo "Node 22+ is required." >&2; exit 1; }
id codex >/dev/null 2>&1 || { echo "Existing codex service user is required." >&2; exit 1; }

install -d -o root -g root -m 0755 "$INSTALL_ROOT"
install -d -o root -g www-data -m 0755 "$SITE_ROOT" "$SITE_ROOT/releases" "$SITE_ROOT/incoming"
install -d -o codex -g codex -m 0750 "$WEATHER_ROOT" "$WEATHER_ROOT/cache"
install -o root -g root -m 0755 "$SOURCE_DIR/outdoor-deployd.mjs" "$INSTALL_ROOT/outdoor-deployd.mjs"
install -o root -g root -m 0644 "$SOURCE_DIR/helper-sites-osaka-mountain-weather.service" /etc/systemd/system/helper-sites-osaka-mountain-weather.service
install -o root -g root -m 0644 "$SOURCE_DIR/osaka-mountain-outdoor-deployd.service" /etc/systemd/system/osaka-mountain-outdoor-deployd.service
install -o root -g root -m 0644 "$SOURCE_DIR/nginx-outdoor.conf" "$SNIPPET"

generated_password=""
if [[ ! -s "$HTPASSWD_FILE" ]]; then
  generated_password="$(openssl rand -base64 24 | tr -d '\n')"
  htpasswd -b -c "$HTPASSWD_FILE" outdoor "$generated_password" >/dev/null
  chown root:www-data "$HTPASSWD_FILE"
  chmod 0640 "$HTPASSWD_FILE"
fi

backup="$NGINX_SITE.outdoor-bootstrap.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp -a "$NGINX_SITE" "$backup"
if ! grep -Fqx "$INCLUDE_LINE" "$NGINX_SITE"; then
  python3 - "$NGINX_SITE" "$INCLUDE_LINE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
include = sys.argv[2]
text = path.read_text(encoding="utf-8")
marker = "    location / {\n"
if text.count(marker) != 1:
    raise SystemExit("Expected exactly one catch-all location in the TLS server block")
path.write_text(text.replace(marker, f"{include}\n\n{marker}", 1), encoding="utf-8")
PY
fi

if ! nginx -t; then
  cp -a "$backup" "$NGINX_SITE"
  nginx -t
  echo "Nginx validation failed; restored $backup" >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable --now osaka-mountain-outdoor-deployd.service
systemctl enable helper-sites-osaka-mountain-weather.service
systemctl reload nginx
curl --fail --silent http://127.0.0.1:4191/healthz >/dev/null

cat <<EOF
HTTP deploy bootstrap installed.
Nginx backup: $backup
Authentication: short-lived GitHub Actions OIDC; no persistent deploy token.
EOF
if [[ -n "$generated_password" ]]; then
  cat <<EOF

Save these one-time /outdoor Basic Auth credentials, then clear scrollback:
username: outdoor
password: $generated_password
EOF
fi
