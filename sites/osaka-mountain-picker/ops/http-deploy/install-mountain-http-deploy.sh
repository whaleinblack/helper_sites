#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

SOURCE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
INSTALL_ROOT="/usr/local/lib/osaka-mountain-picker"
SITE_ROOT="/srv/helper_sites/releases/osaka-mountain-picker-http"
LIVE_STATIC="/srv/helper_sites/sites/osaka-mountain-picker"
WEATHER_ROOT="/srv/helper_sites/services/osaka-mountain-weather"
WEATHER_CURRENT="$WEATHER_ROOT/current"
NGINX_SNIPPET="${NGINX_SNIPPET:-/etc/nginx/snippets/helper-sites.conf}"
OLD_ALIAS="        alias /srv/helper_sites/sites/osaka-mountain-picker/;"
NEW_ALIAS="        alias /srv/helper_sites/releases/osaka-mountain-picker-http/current/site/;"

for file in \
  mountain-deployd.mjs \
  helper-sites-osaka-mountain-weather.service \
  osaka-mountain-deployd.service; do
  [[ -f "$SOURCE_DIR/$file" ]] || { echo "Missing $SOURCE_DIR/$file" >&2; exit 1; }
done
[[ -f "$NGINX_SNIPPET" ]] || { echo "Missing Nginx snippet: $NGINX_SNIPPET" >&2; exit 1; }
[[ -f "$LIVE_STATIC/index.html" ]] || { echo "Missing live /mountain static directory." >&2; exit 1; }
weather_target="$(readlink -f "$WEATHER_CURRENT" 2>/dev/null || true)"
[[ -n "$weather_target" && -f "$weather_target/weather-api.mjs" ]] \
  || { echo "Missing current mountain weather service release." >&2; exit 1; }
command -v node >/dev/null
command -v nginx >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
[[ "$node_major" -ge 22 ]] || { echo "Node 22+ is required." >&2; exit 1; }
id codex >/dev/null 2>&1 || { echo "Existing codex service user is required." >&2; exit 1; }

install -d -o root -g root -m 0755 "$INSTALL_ROOT"
install -d -o root -g www-data -m 0755 "$SITE_ROOT" "$SITE_ROOT/releases" "$SITE_ROOT/incoming"
install -d -o codex -g codex -m 0750 "$WEATHER_ROOT" "$WEATHER_ROOT/cache"
install -o root -g root -m 0755 "$SOURCE_DIR/mountain-deployd.mjs" "$INSTALL_ROOT/mountain-deployd.mjs"
install -o root -g root -m 0644 "$SOURCE_DIR/helper-sites-osaka-mountain-weather.service" /etc/systemd/system/helper-sites-osaka-mountain-weather.service
install -o root -g root -m 0644 "$SOURCE_DIR/osaka-mountain-deployd.service" /etc/systemd/system/osaka-mountain-deployd.service

if [[ ! -L "$SITE_ROOT/current" ]]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  seed_id="mountain-http-${stamp}-000000000000"
  seed="$SITE_ROOT/releases/$seed_id"
  install -d -o root -g www-data -m 0755 "$seed/site" "$seed/weather"
  cp -a "$LIVE_STATIC/." "$seed/site/"
  cp -a "$weather_target/weather-api.mjs" "$seed/weather/weather-api.mjs"
  cat >"$seed/.release.json" <<EOF
{
  "releaseId": "$seed_id",
  "commit": "0000000000000000000000000000000000000000",
  "sha256": "bootstrap",
  "requestId": "bootstrap",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  chown -R root:www-data "$seed"
  chmod -R u=rwX,g=rX,o=rX "$seed"
  ln -s "$seed" "$SITE_ROOT/current.bootstrap.tmp"
  mv -Tf "$SITE_ROOT/current.bootstrap.tmp" "$SITE_ROOT/current"
  cat >"$SITE_ROOT/state.json" <<EOF
{
  "currentRelease": "$seed",
  "previousRelease": null,
  "previousWeather": "$weather_target",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  chown root:www-data "$SITE_ROOT/state.json"
  chmod 0640 "$SITE_ROOT/state.json"
fi

backup="$NGINX_SNIPPET.mountain-http-bootstrap.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp -a "$NGINX_SNIPPET" "$backup"
python3 - "$NGINX_SNIPPET" "$OLD_ALIAS" "$NEW_ALIAS" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
old = sys.argv[2]
new = sys.argv[3]
text = path.read_text(encoding="utf-8")
if new in text:
    raise SystemExit(0)
if text.count(old) != 1:
    raise SystemExit("Expected exactly one live /mountain alias")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
PY

if ! nginx -t; then
  cp -a "$backup" "$NGINX_SNIPPET"
  nginx -t
  echo "Nginx validation failed; restored $backup" >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable --now osaka-mountain-deployd.service
systemctl enable helper-sites-osaka-mountain-weather.service
systemctl reload nginx
curl --fail --silent http://127.0.0.1:4191/healthz >/dev/null
curl --fail --silent http://127.0.0.1:4188/health | grep -q '"status":"ok"'
curl --fail --silent https://chufa.wang/mountain/ | grep -q '下一座山'

cat <<EOF
Mountain HTTP deploy bootstrap installed without changing the public URL.
Public route: https://chufa.wang/mountain/
Nginx backup: $backup
Authentication: short-lived GitHub Actions OIDC; no persistent deploy token.
Bootstrap release: $(basename "$(readlink -f "$SITE_ROOT/current")")
EOF
